"""Server configuration for integration tests.

!! Never use this configuration in production because it
opens the server to the world and provides access to JupyterLab
JavaScript objects through the global window variable.
"""
import sys
from pathlib import Path

from jupyterlab.galata import configure_jupyter_server

configure_jupyter_server(c)  # noqa: F821

# Make the test-only server extension in this directory importable, then enable
# it. It exposes a POST endpoint the E2E specs use to emit `lab_command` events
# with an optional target `client_id`, exercising the frontend routing guard.
sys.path.insert(0, str(Path(__file__).parent.resolve()))
c.ServerApp.jpserver_extensions = {"e2e_emit_ext": True}  # noqa: F821

# Uncomment to set server log level to debug level
# c.ServerApp.log_level = "DEBUG"
