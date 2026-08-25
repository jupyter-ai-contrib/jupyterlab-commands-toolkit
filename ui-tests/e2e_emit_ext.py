"""Test-only Jupyter Server extension for the E2E suite.

Exposes ``POST /jupyterlab-commands-toolkit-e2e/emit`` which emits a
``lab_command`` event through the toolkit's real ``emit()`` path, with an
optional target ``client_id``. This lets the Playwright specs drive the exact
server -> browser command flow (including the routing guard) without needing an
MCP client or an AI agent.

Not for production use.
"""

import json

import tornado
from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join

from jupyterlab_commands_toolkit.tools import emit, target_client_id


class EmitHandler(APIHandler):
    @tornado.web.authenticated
    def post(self):
        body = self.get_json_body() or {}
        name = body["name"]
        args = body.get("args", {})
        client_id = body.get("client_id")  # None => broadcast

        # Bind the routing target the same way the production MCP middleware
        # will, so ``emit()`` stamps ``client_id`` onto the event itself.
        token = target_client_id.set(client_id)
        try:
            emit({"name": name, "args": args}, wait_for_result=False)
        finally:
            target_client_id.reset(token)

        self.finish(json.dumps({"ok": True}))


def _jupyter_server_extension_points():
    return [{"module": "e2e_emit_ext"}]


def _load_jupyter_server_extension(server_app):
    web_app = server_app.web_app
    base_url = web_app.settings["base_url"]
    route = url_path_join(base_url, "jupyterlab-commands-toolkit-e2e", "emit")
    web_app.add_handlers(".*$", [(route, EmitHandler)])
    server_app.log.info("e2e_emit_ext loaded: POST %s", route)
