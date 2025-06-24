try:
    from ._version import __version__
except ImportError:
    # Fallback when using the package in dev mode without installing
    # in editable mode with pip. It is highly recommended to install
    # the package from a stable release or in editable mode: https://pip.pypa.io/en/stable/topics/local-project-installs/#editable-installs
    import warnings
    warnings.warn("Importing 'jupyterlab_commands_toolkit' outside a proper installation.")
    __version__ = "dev"

import pathlib
from jupyter_server_ai_tools.models import ToolSet, Toolkit
from jupyter_server.serverapp import ServerApp
from .tools import TOOLS

def _jupyter_labextension_paths():
    return [{
        "src": "labextension",
        "dest": "jupyterlab-commands-toolkit"
    }]


def _jupyter_server_extension_points():
    return [{
        "module": "jupyterlab_commands_toolkit"
    }]

def _load_jupyter_server_extension(serverapp: ServerApp):
    schema_path = pathlib.Path(__file__).parent / "events" / "jupyterlab-command.yml"
    serverapp.event_logger.register_event_schema(schema_path)
    serverapp.log.info("jupyterlab_commands_toolkit extension loaded.")


async def _start_jupyter_server_extension(serverapp: ServerApp):
    registry = serverapp.web_app.settings["toolkit_registry"]
    if registry:
        tools = ToolSet(TOOLS)
        registry.register_toolkit(
            Toolkit(
                name="jupyterlab_commands", tools=tools
            )
        )