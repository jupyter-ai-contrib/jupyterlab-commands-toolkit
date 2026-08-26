# Integration tests

End-to-end (Playwright / galata) tests for `jupyterlab-commands-toolkit`.

The suites are keyed on the optional integrations the
package supports. Each runs in its own isolated environment via `nox` (using
`uv`), so the "package alone" behavior is tested separately from each
integration.

## Suites

Run with `nox` from the repository root:

```bash
nox -l                      # list sessions
nox -s e2e                  # run all three suites
nox -s "e2e(env='chat')"    # run one suite
```

### `default` — the package alone

`tests/default/` — no optional dependencies installed. Verifies command
routing over `lab_command` events: a broadcast command (no `client_id`) runs on
this client, a command targeting this client's `web_client_id` runs, and a
command targeting a different client is ignored. A test-only server extension
(`e2e_emit_ext.py`) emits the events through the toolkit's real `emit()` path.

### `chat` — Jupyter Chat integration

`tests/chat/` — installs `jupyterlab-chat`, which provides `IChatTracker` so the
toolkit's optional metadata contributor activates. Verifies that a per-tab
`web_client_id` is attached to the metadata of a sent chat message, and that two
browser tabs get two different `web_client_id`s.

### `mcp` — MCP integration

`tests/mcp/` — installs `fastmcp`/`mcp`. A test-only in-process FastMCP server
(`e2e_mcp_ext.py`), standing in for `jupyter-server-mcp`, installs a middleware
that copies the `X-Web-Client-Id` request header into the `target_client_id`
contextvar, and exposes a `run_command` tool that calls the toolkit's
`execute_command`. The spec connects an MCP client with a target client's id in
the header and verifies the command runs only on that browser, not on a second
connected client. This exercises the full production routing path: header →
middleware → contextvar → event `client_id` → frontend guard.

## How the pieces fit

- `jupyter_server_test_config.py` loads `e2e_emit_ext` for the `default`/`chat`
  suites and `e2e_mcp_ext` for the `mcp` suite, selected by the `CT_E2E_SUITE`
  environment variable that the nox session sets.
- `noxfile.py` installs the extension (the prebuilt wheel via `E2E_WHEEL` in CI,
  or from source locally) plus the suite's extra packages, then runs only that
  suite's spec directory.

## Local run without nox

```bash
jlpm install
jlpm playwright install chromium
CT_E2E_SUITE=default jlpm playwright test tests/default
```

(Install `jupyterlab-chat` or `fastmcp`/`mcp` in the environment first to run the
`chat` or `mcp` suites this way.)
