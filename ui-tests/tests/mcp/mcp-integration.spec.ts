/**
 * E2E (MCP integration): an MCP server working like jupyter-server-mcp can pass
 * the web client id as context to the tools it invokes, so a command routes to
 * exactly the browser named by the `X-Web-Client-Id` header and no other.
 *
 * Runs only in the `mcp` nox env (fastmcp/mcp installed; e2e_mcp_ext serves the
 * in-process FastMCP server). This also verifies that the header the middleware
 * sets propagates through the FastMCP tool call into the toolkit contextvar.
 */
import { expect, test } from '@jupyterlab/galata';
import { callRunCommand } from './mcp-client';

const MARK = 'e2e:mark';
const MCP_PORT = Number(process.env.CT_MCP_PORT || '3999');

async function setup(p: any): Promise<void> {
  await p.evaluate((cmd: string) => {
    const app = (window as any).jupyterapp;
    (window as any).__ctMark = 0;
    if (!app.commands.hasCommand(cmd)) {
      app.commands.addCommand(cmd, {
        label: 'ct mark',
        execute: () => {
          (window as any).__ctMark++;
        }
      });
    }
  }, MARK);
}

function webClientId(p: any): Promise<string> {
  return p.evaluate(() =>
    (window as any).jupyterapp.commands.execute(
      'jupyterlab-commands-toolkit:get-web-client-id'
    )
  );
}

function count(p: any): Promise<number> {
  return p.evaluate(() => (window as any).__ctMark as number);
}

test.describe('mcp integration: web_client_id routing', () => {
  test('an MCP tool call runs the command on the header-named client only', async ({
    page,
    browser,
    baseURL
  }) => {
    // Target client (this galata page).
    await setup(page);
    const targetId = await webClientId(page);

    // A second, unrelated client connected to the same server.
    const context = await browser.newContext();
    const other = await context.newPage();
    await other.goto(`${baseURL}/lab`);
    await other.waitForFunction(
      () =>
        (window as any).jupyterapp?.commands?.hasCommand(
          'jupyterlab-commands-toolkit:get-web-client-id'
        ) === true
    );
    await setup(other);
    const otherId = await webClientId(other);
    expect(targetId).not.toBe(otherId);

    // Invoke the MCP tool with the target client's id in the header.
    const res = await callRunCommand(MCP_PORT, targetId, MARK);
    expect(Boolean(res?.isError)).toBe(false);

    // Only the target client ran the command.
    await expect.poll(() => count(page)).toBe(1);
    await other.waitForTimeout(500);
    expect(await count(other)).toBe(0);

    await context.close();
  });
});
