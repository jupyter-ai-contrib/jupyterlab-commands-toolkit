try:
    from ._version import __version__
except ImportError:
    # Fallback when using the package in dev mode without installing
    # in editable mode with pip. It is highly recommended to install
    # the package from a stable release or in editable mode: https://pip.pypa.io/en/stable/topics/local-project-installs/#editable-installs
    import warnings

    warnings.warn(
        "Importing 'jupyterlab_commands_toolkit' outside a proper installation."
    )
    __version__ = "dev"

import pathlib

from jupyter_server.serverapp import ServerApp


def _jupyter_labextension_paths():
    return [{"src": "labextension", "dest": "jupyterlab-commands-toolkit"}]


def _jupyter_server_extension_points():
    return [{"module": "jupyterlab_commands_toolkit"}]


def _load_jupyter_server_extension(serverapp: ServerApp):
    command_schema_path = (
        pathlib.Path(__file__).parent / "events" / "jupyterlab-command.yml"
    )
    serverapp.event_logger.register_event_schema(command_schema_path)

    result_schema_path = (
        pathlib.Path(__file__).parent / "events" / "jupyterlab-command-result.yml"
    )
    serverapp.event_logger.register_event_schema(result_schema_path)

    async def command_result_listener(logger, schema_id: str, data: dict) -> None:
        """
        Handle command result events from the frontend.

        This listener receives the results of JupyterLab commands that were
        executed in the frontend and processes them accordingly.
        """
        from .tools import handle_command_result

        try:
            request_id = data.get("requestId", "unknown")
            success = data.get("success", False)
            result = data.get("result")
            error = data.get("error")

            serverapp.log.info(
                f"Received command result for request {request_id}: success={success}"
            )

            if success:
                if result is not None:
                    serverapp.log.debug(f"Command result: {result}")
            else:
                serverapp.log.warning(f"Command failed: {error}")

            handle_command_result(data)

        except Exception as e:
            serverapp.log.error(f"Error processing command result: {e}")

    result_schema_id = (
        "https://events.jupyter.org/jupyterlab_command_toolkit/lab_command_result/v1"
    )
    serverapp.event_logger.add_listener(
        schema_id=result_schema_id, listener=command_result_listener
    )

    serverapp.log.info(
        "jupyterlab_commands_toolkit extension loaded with bidirectional event communication."
    )
