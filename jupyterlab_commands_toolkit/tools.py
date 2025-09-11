import asyncio
import time
import uuid
from typing import Any, Dict, Optional

from jupyter_server.serverapp import ServerApp

# Store for pending command results
pending_requests: Dict[str, Dict[str, Any]] = {}


def emit(data, wait_for_result=False):
    """
    Emit an event to the frontend with optional result waiting.

    Args:
        data: Event data to emit
        wait_for_result: Whether to add a request ID for result tracking

    Returns:
        str: Request ID if wait_for_result is True, None otherwise
    """
    server = ServerApp.instance()

    # Add request ID if waiting for result
    request_id = None
    if wait_for_result:
        request_id = str(uuid.uuid4())
        data["requestId"] = request_id
        pending_requests[request_id] = {
            "timestamp": time.time(),
            "data": data,
            "result": None,
            "completed": False,
            "future": asyncio.Future(),
        }

    server.io_loop.call_later(
        0.1,
        server.event_logger.emit,
        schema_id="https://events.jupyter.org/jupyterlab_command_toolkit/lab_command/v1",
        data=data,
    )

    return request_id


async def emit_and_wait_for_result(data, timeout=10.0):
    """
    Emit a command and wait for its result.

    Args:
        data: Command data to emit
        timeout: How long to wait for a result (seconds)

    Returns:
        dict: Command result from the frontend
    """
    request_id = emit(data, wait_for_result=True)

    try:
        future = pending_requests[request_id]["future"]
        result = await asyncio.wait_for(future, timeout=timeout)
        return result
    except asyncio.TimeoutError:
        return {
            "success": False,
            "error": f"Command timed out after {timeout} seconds",
            "request_id": request_id,
        }
    finally:
        pending_requests.pop(request_id, None)


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


async def list_all_commands() -> dict:
    """
    Retrieve a list of all available JupyterLab commands.

    This function emits a request to the JupyterLab frontend to retrieve all
    registered commands in the application. It waits for the response and
    returns the complete list of available commands with their metadata.

    Returns:
        dict: A dictionary containing the command list response from JupyterLab.
              The structure typically includes:
              - success (bool): Whether the operation succeeded
              - commands (list): List of available command objects, with arguments and types
              - error (str, optional): Error message if the operation failed

    Raises:
        asyncio.TimeoutError: If the frontend doesn't respond within the timeout period
    """
    return await emit_and_wait_for_result(
        {"name": "jupyterlab-commands-toolkit:list-all-commands", "args": {}}
    )


async def execute_command(command_id: str, args: Optional[dict] = None) -> dict:
    """
    Execute a JupyterLab command with optional arguments.

    This function sends a command execution request to the JupyterLab frontend
    and waits for the result. The command is identified by its unique command_id
    and can be parameterized with optional arguments.

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
              - request_id (str): The unique identifier for this request

    Raises:
        asyncio.TimeoutError: If the frontend doesn't respond within the timeout period

    Examples:
        >>> await execute_command("application:toggle-left-area")
        {'success': True, 'result': None}

        >>> await execute_command("docmanager:open", {"path": "notebook.ipynb"})
        {'success': True, 'result': 'opened'}
    """
    if args is None:
        args = {}
    return await emit_and_wait_for_result({"name": command_id, "args": args})
