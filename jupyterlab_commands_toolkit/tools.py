import asyncio
import time
import uuid
from contextvars import ContextVar
from typing import Any, Dict, Optional

from jsonschema import ValidationError
from jupyter_server.serverapp import ServerApp

from .config import SETTINGS_KEY

COMMAND_SCHEMA_ID = (
    "https://events.jupyter.org/jupyterlab_command_toolkit/lab_command/v1"
)

OPEN_JUPYTERLAB_HINT = (
    "Open JupyterLab in a web browser, with the jupyterlab-commands-toolkit "
    "extension enabled, and try again."
)

# Store for pending command results
pending_requests: Dict[str, Dict[str, Any]] = {}

# The id of the web client that should execute the emitted commands,
# or None to have all connected web clients execute them
target_client_id: ContextVar[Optional[str]] = ContextVar(
    "target_client_id", default=None
)

# Tools list for jupyter-server-mcp entrypoint discovery
TOOLS = [
    "jupyterlab_commands_toolkit.tools:list_all_commands",
    "jupyterlab_commands_toolkit.tools:execute_command",
]


class NoWebClientError(RuntimeError):
    """
    No web client is connected to the server to receive the commands.
    """


def emit(data, wait_for_result=False):
    """
    Emit an event to the frontend with optional result waiting.

    Args:
        data: Event data to emit
        wait_for_result: Whether to add a request ID for result tracking

    Returns:
        str: Request ID if wait_for_result is True, None otherwise

    Raises:
        jsonschema.ValidationError: If the event data does not match the schema
        NoWebClientError: If wait_for_result is True and no web client is connected
    """
    server = ServerApp.instance()

    client_id = target_client_id.get()
    if client_id is not None:
        data.setdefault("client_id", client_id)

    # The event logger skips the validation when the event has no listener
    server.event_logger.schemas.validate_event(COMMAND_SCHEMA_ID, data)

    # Add request ID if waiting for result
    request_id = None
    if wait_for_result:
        request_id = str(uuid.uuid4())
        data["requestId"] = request_id
        loop = asyncio.get_running_loop()
        pending_requests[request_id] = {
            "timestamp": time.time(),
            "data": data,
            "result": None,
            "completed": False,
            "ack": loop.create_future(),
            "future": loop.create_future(),
        }

    # The event has no listener, so emit returns None, when no web client
    # has an events websocket open
    emitted = server.event_logger.emit(schema_id=COMMAND_SCHEMA_ID, data=data)
    if emitted is None and request_id is not None:
        del pending_requests[request_id]
        raise NoWebClientError()

    return request_id


async def emit_and_wait_for_result(data, timeout=None, ack_timeout=None):
    """
    Emit a command and wait for its result.

    Args:
        data: Command data to emit
        timeout: How long to wait for a result (seconds). Defaults to the
                 `CommandsToolkit.command_timeout` setting of the server.
        ack_timeout: How long to wait for a web client to acknowledge the
                     command (seconds), to fail fast when none receives it.
                     Defaults to the `CommandsToolkit.ack_timeout` setting.

    Returns:
        dict: Command result from the frontend. When the command does not reach
              the frontend, the dict has an "error_code": "no_web_client",
              "not_acknowledged", "web_client_not_found", "timeout" or
              "invalid_command".
    """
    config = ServerApp.instance().web_app.settings[SETTINGS_KEY]
    if timeout is None:
        timeout = config.command_timeout
    if ack_timeout is None:
        ack_timeout = config.ack_timeout

    try:
        request_id = emit(data, wait_for_result=True)
    except ValidationError as e:
        return _failure(
            data, f"Invalid command at {e.json_path}: {e.message}", "invalid_command"
        )
    except NoWebClientError:
        return _failure(
            data,
            f"No JupyterLab web client is connected. {OPEN_JUPYTERLAB_HINT}",
            "no_web_client",
        )

    request_info = pending_requests[request_id]
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    try:
        # The result can also arrive first, or without an acknowledgment
        done, _ = await asyncio.wait(
            {request_info["ack"], request_info["future"]},
            timeout=ack_timeout,
            return_when=asyncio.FIRST_COMPLETED,
        )
        if done:
            return await asyncio.wait_for(
                request_info["future"], timeout=max(deadline - loop.time(), 0)
            )
        client_id = data.get("client_id")
        if client_id is None:
            # A web client with an older version of the extension runs the
            # command without an acknowledgment, so a caller must not run it
            # again with another method.
            error = (
                "No JupyterLab web client acknowledged the command within "
                f"{ack_timeout} seconds. {OPEN_JUPYTERLAB_HINT}"
            )
            error_code = "not_acknowledged"
        else:
            error = (
                f"The web client {client_id} did not receive the command within "
                f"{ack_timeout} seconds. Its browser tab may be closed or reloaded."
            )
            error_code = "web_client_not_found"
    except asyncio.TimeoutError:
        error = (
            f"Command timed out after {timeout} seconds. It may still be running "
            "in JupyterLab, so check its effects before running it again."
        )
        error_code = "timeout"
    finally:
        pending_requests.pop(request_id, None)

    return _failure(data, error, error_code, request_id)


def _failure(data, error, error_code, request_id=None):
    """
    Log and build the result of a command that did not reach the frontend.
    """
    ServerApp.instance().log.warning(f"Command {data.get('name')!r} failed: {error}")
    result = {"success": False, "error": error, "error_code": error_code}
    if request_id is not None:
        result["request_id"] = request_id
    return result


def handle_command_result(event_data):
    """Handle incoming command results from the frontend."""
    request_id = event_data.get("requestId")
    if request_id and request_id in pending_requests:
        request_info = pending_requests[request_id]
        request_info["result"] = event_data
        request_info["completed"] = True

        future = request_info.get("future")
        if future and not future.done():
            future.set_result(event_data)


def handle_command_ack(event_data):
    """
    Handle incoming command acknowledgments from the frontend.
    """
    request_info = pending_requests.get(event_data.get("requestId"))
    if request_info and not request_info["ack"].done():
        request_info["ack"].set_result(event_data)


async def list_all_commands(query: Optional[str] = None) -> dict:
    """
    Retrieve a list of all available JupyterLab commands.

    This function emits a request to the JupyterLab frontend to retrieve all
    registered commands in the application. It waits for the response and
    returns the complete list of available commands with their metadata.
    JupyterLab must be open in a web browser.

    Args:
        query (Optional[str], optional): An optional search query to filter commands.
                                        When provided, only commands whose ID, label,
                                        caption, or description contain the query string
                                        (case-insensitive) will be returned. If None or
                                        omitted, all commands will be returned.
                                        Defaults to None.

    Returns:
        dict: A dictionary containing the command list response from JupyterLab.
              The structure typically includes:
              - success (bool): Whether the operation succeeded
              - commandCount (int): Number of commands returned
              - commands (list): List of available command objects, each with:
                  - id (str): The command identifier
                  - label (str, optional): Human-readable command label
                  - caption (str, optional): Short description
                  - description (str, optional): Detailed usage information
                  - args (dict, optional): Command argument schema
              - error (str, optional): Error message if the operation failed
              - error_code (str, optional): "no_web_client" when JupyterLab is not
                open in a web browser, "not_acknowledged", "web_client_not_found",
                "timeout" or
                "invalid_command"

    Examples:
        >>> # Get all commands
        >>> await list_all_commands()
        {'success': True, 'commandCount': 150, 'commands': [...]}

        >>> # Filter commands by query
        >>> await list_all_commands(query="notebook")
        {'success': True, 'commandCount': 25, 'commands': [...]}
    """
    args = {}
    if query is not None:
        args["query"] = query

    return await emit_and_wait_for_result(
        {"name": "jupyterlab-commands-toolkit:list-all-commands", "args": args}
    )


async def execute_command(command_id: str, args: Optional[dict] = None) -> dict:
    """
    Execute a JupyterLab command with optional arguments.

    This function sends a command execution request to the JupyterLab frontend
    and waits for the result. The command is identified by its unique command_id
    and can be parameterized with optional arguments. JupyterLab must be open in
    a web browser.

    Args:
        command_id (str): The unique identifier of the JupyterLab command to execute.
                         This should be a valid command ID registered in JupyterLab.
        args (Optional[dict], optional): A dictionary of arguments to pass to the
                                       command. Defaults to None, which is converted
                                       to an empty dictionary.

    Returns:
        dict: A dictionary containing the command execution response from JupyterLab.
              The structure typically includes:
              - success (bool): Whether the command executed successfully
              - result (any): The return value from the executed command
              - error (str, optional): Error message if the command failed
              - error_code (str, optional): "no_web_client" when JupyterLab is not
                open in a web browser, "not_acknowledged", "web_client_not_found",
                "timeout" or
                "invalid_command". Absent when the command itself failed.
              - request_id (str): The unique identifier for this request

    Examples:
        >>> await execute_command("application:toggle-left-area")
        {'success': True, 'result': None}

        >>> await execute_command("docmanager:open", {"path": "notebook.ipynb"})
        {'success': True, 'result': 'opened'}
    """
    if args is None:
        args = {}
    return await emit_and_wait_for_result({"name": command_id, "args": args})
