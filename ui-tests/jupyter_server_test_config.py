"""Server configuration for integration tests.

!! Never use this configuration in production because it
opens the server to the world and provides access to JupyterLab
JavaScript objects through the global window variable.
"""
import os
import sys
from pathlib import Path

from jupyterlab.galata import configure_jupyter_server

configure_jupyter_server(c)  # noqa: F821

# Make the test-only server extensions in this directory importable.
sys.path.insert(0, str(Path(__file__).parent.resolve()))

# Which suite is running (set by the nox session). The `mcp` suite serves an
# in-process FastMCP server (e2e_mcp_ext); the others use the plain emit
# endpoint (e2e_emit_ext) that drives lab_command events directly.
_suite = os.environ.get("CT_E2E_SUITE", "default")
if _suite == "mcp":
    c.ServerApp.jpserver_extensions = {"e2e_mcp_ext": True}  # noqa: F821
else:
    c.ServerApp.jpserver_extensions = {"e2e_emit_ext": True}  # noqa: F821

# Uncomment to set server log level to debug level
# c.ServerApp.log_level = "DEBUG"
