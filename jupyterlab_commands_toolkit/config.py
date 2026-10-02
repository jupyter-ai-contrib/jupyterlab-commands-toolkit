from traitlets import Float
from traitlets.config import Configurable

SETTINGS_KEY = "jupyterlab_commands_toolkit_config"


class CommandsToolkit(Configurable):
    """
    Configuration of the commands sent to the web clients.
    """

    command_timeout = Float(
        10.0,
        help="How long to wait for the result of a command (seconds).",
    ).tag(config=True)

    ack_timeout = Float(
        2.0,
        help=(
            "How long to wait for a web client to acknowledge a command (seconds). "
            "Increase it when the web clients have a slow connection to the server."
        ),
    ).tag(config=True)
