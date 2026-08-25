# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.
"""E2E test suites for jupyterlab-commands-toolkit.

The package rides on Jupyter Events and is RTC-independent, so there is no RTC
matrix. Instead the suites are keyed on the optional integrations the package
supports, each in its own isolated venv (uv):

    - default -- the package alone: command routing via lab_command events.
    - chat    -- with jupyterlab-chat: the web_client_id metadata contributor.
    - mcp     -- with fastmcp/mcp: an in-process MCP server (like
                 jupyter-server-mcp) routing a command to a specific web client.

Each session installs the extension -- the prebuilt wheel via ``E2E_WHEEL`` in
CI, or from source locally -- plus the suite's extra packages, then runs only
that suite's specs. The JS deps and browser binaries are expected to be present
in ``ui-tests`` already (installed once at the CI job level, where
``playwright install-deps`` can use sudo); the ``jlpm install`` /
``playwright install`` calls below are idempotent no-ops on a hit.

Usage::

    nox -l                        # list sessions
    nox -s e2e                    # all three suites
    nox -s "e2e(env='chat')"      # one suite
"""
import os

import nox

# Prefer uv for fast, isolated env creation; fall back to virtualenv.
nox.options.default_venv_backend = "uv|virtualenv"

# suite name -> (extra packages, spec directory)
_ENVS = {
    "default": ([], "tests/default"),
    "chat": (["jupyterlab-chat>=0.25.0a5"], "tests/chat"),
    "mcp": (["fastmcp", "mcp"], "tests/mcp"),
}


@nox.session(python="3.11")
@nox.parametrize("env", list(_ENVS))
def e2e(session: nox.Session, env: str) -> None:
    """Run one E2E suite in an isolated environment."""
    deps, spec_dir = _ENVS[env]
    # The prebuilt wheel from the CI ``build`` job; from source for local runs.
    target = os.environ.get("E2E_WHEEL") or "."
    session.install("jupyterlab>=4.0.0,<5", target, *deps)
    # Tells jupyter_server_test_config.py which test-only server extension to
    # load (the mcp suite serves an in-process FastMCP server).
    session.env["CT_E2E_SUITE"] = env
    with session.chdir("ui-tests"):
        session.run("jlpm", "install", external=True)
        session.run("jlpm", "playwright", "install", "chromium", external=True)
        session.run("jlpm", "playwright", "test", spec_dir, external=True)
