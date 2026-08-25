"""Test-only in-process MCP server for the E2E ``mcp`` suite.

Stands in for ``jupyter-server-mcp``: it serves a FastMCP HTTP endpoint from
inside the Jupyter Server process (so it shares the toolkit's ``emit()`` path
and the server's event logger) and installs a middleware that reads the
``X-Web-Client-Id`` request header into the ``target_client_id`` contextvar
before each tool call. A ``run_command`` tool then calls the toolkit's
``execute_command``, which stamps that ``client_id`` onto the emitted
``lab_command`` event. This mirrors exactly how the production integration will
route commands to a specific web client.

Not for production use.
"""

import asyncio
import os

import uvicorn
from fastmcp import FastMCP
from fastmcp.server.dependencies import get_http_headers
from fastmcp.server.middleware import Middleware

from jupyterlab_commands_toolkit.tools import execute_command, target_client_id

MCP_PORT = int(os.environ.get("CT_MCP_PORT", "3999"))


class ClientRoutingMiddleware(Middleware):
    """Copy the X-Web-Client-Id header into the target_client_id contextvar."""

    async def on_call_tool(self, context, call_next):
        headers = get_http_headers()
        token = target_client_id.set(headers.get("x-web-client-id"))
        try:
            return await call_next(context)
        finally:
            target_client_id.reset(token)


mcp = FastMCP("e2e-commands-toolkit")
mcp.add_middleware(ClientRoutingMiddleware())


@mcp.tool
async def run_command(name: str) -> dict:
    """Run a JupyterLab command on the web client bound by the request header."""
    return await execute_command(name)


class _EmbeddedServer(uvicorn.Server):
    def install_signal_handlers(self) -> None:  # do not touch Jupyter's signals
        pass


def _jupyter_server_extension_points():
    return [{"module": "e2e_mcp_ext"}]


def _load_jupyter_server_extension(server_app):
    async def _serve():
        app = mcp.http_app(transport="http")
        config = uvicorn.Config(
            app, host="127.0.0.1", port=MCP_PORT, lifespan="on", log_level="warning"
        )
        await _EmbeddedServer(config).serve()

    server_app.io_loop.add_callback(lambda: asyncio.ensure_future(_serve()))
    server_app.log.info("e2e_mcp_ext: FastMCP on http://127.0.0.1:%s/mcp", MCP_PORT)
