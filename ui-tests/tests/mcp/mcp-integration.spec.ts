/**
 * E2E (MCP integration): an MCP server working like jupyter-server-mcp can pass
 * the web client id as context to the tools it invokes, so a command routes to
 * exactly the browser named by the `X-Web-Client-Id` header and no other.
 *
 * Runs in both second-client modes (a second tab in the same context, and a
 * separate context). Runs only in the `mcp` nox env.
 */
import { expect, test } from '@jupyterlab/galata';
import { callRunCommand } from './mcp-client';
import {
  openSecondClient,
  SECOND_CLIENT_MODES,
  webClientId
} from '../_helpers';

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

function count(p: any): Promise<number> {
  return p.evaluate(() => (window as any).__ctMark as number);
}

test.describe('mcp integration: web_client_id routing', () => {
  for (const mode of SECOND_CLIENT_MODES) {
    test(`an MCP tool call runs the command on the header-named client only (${mode})`, async ({
      page,
      browser,
      baseURL
    }) => {
      // Target client (this galata page).
      await setup(page);
      const targetId = await webClientId(page);

      // A second, unrelated client connected to the same server.
      const { page2: other, cleanup } = await openSecondClient(
        page,
        browser,
        baseURL as string,
        mode
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

      await cleanup();
    });
  }
});
