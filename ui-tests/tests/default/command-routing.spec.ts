/**
 * E2E: `lab_command` events are routed to the correct web client.
 *
 * The test-only server extension (`e2e_emit_ext.py`) emits a `lab_command`
 * event through the toolkit's real `emit()` path with an optional target
 * `client_id`. We register a marker command in the browser and assert it runs
 * only when the command is a broadcast (no `client_id`) or targets this
 * browser's own web client id, and never when it targets a different client.
 */
import { expect, test } from '@jupyterlab/galata';

const MARK = 'e2e:mark';

async function setup(page: any): Promise<void> {
  await page.evaluate((cmd: string) => {
    const app = (window as any).jupyterapp;
    (window as any).__e2eMarkCount = 0;
    if (!app.commands.hasCommand(cmd)) {
      app.commands.addCommand(cmd, {
        label: 'E2E mark',
        execute: () => {
          (window as any).__e2eMarkCount++;
        }
      });
    }
  }, MARK);
}

async function webClientId(page: any): Promise<string> {
  return page.evaluate(() =>
    (window as any).jupyterapp.commands.execute(
      'jupyterlab-commands-toolkit:get-web-client-id'
    )
  );
}

async function emitCommand(
  page: any,
  body: Record<string, any>
): Promise<void> {
  const status = await page.evaluate(async (b: Record<string, any>) => {
    const app = (window as any).jupyterapp;
    const s = app.serviceManager.serverSettings;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (s.token) {
      headers['Authorization'] = 'token ' + s.token;
    }
    const xsrf = document.cookie.match(/_xsrf=([^;]+)/)?.[1];
    if (xsrf) {
      headers['X-XSRFToken'] = decodeURIComponent(xsrf);
    }
    const resp = await fetch(
      s.baseUrl + 'jupyterlab-commands-toolkit-e2e/emit',
      {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify(b)
      }
    );
    return resp.status;
  }, body);
  expect(status, 'emit endpoint status').toBeLessThan(300);
}

function markCount(page: any): Promise<number> {
  return page.evaluate(() => (window as any).__e2eMarkCount as number);
}

test.describe('web-client command routing', () => {
  test('a broadcast command (no client_id) runs on this client', async ({
    page
  }) => {
    await setup(page);
    await emitCommand(page, { name: MARK });
    await expect.poll(() => markCount(page)).toBe(1);
  });

  test('a command targeting this client runs', async ({ page }) => {
    await setup(page);
    const id = await webClientId(page);
    await emitCommand(page, { name: MARK, client_id: id });
    await expect.poll(() => markCount(page)).toBe(1);
  });

  test('a command targeting a different client is ignored', async ({
    page
  }) => {
    await setup(page);
    const id = await webClientId(page);
    await emitCommand(page, { name: MARK, client_id: `${id}-other` });
    // Give the event time to arrive so a failure to guard would show up.
    await page.waitForTimeout(1500);
    expect(await markCount(page)).toBe(0);
    // Positive control: a subsequent broadcast still runs, proving the
    // listener is live and the zero above is due to the routing guard.
    await emitCommand(page, { name: MARK });
    await expect.poll(() => markCount(page)).toBe(1);
  });
});
