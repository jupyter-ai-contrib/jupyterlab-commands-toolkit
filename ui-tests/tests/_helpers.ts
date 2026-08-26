/**
 * Shared helpers for tests that involve a second web client.
 *
 * Each two-client test runs in two modes:
 *   - same-context: a second tab in the same browser context (two tabs, one
 *     browser, shared cookies/storage) — proves web_client_id is a per-tab
 *     in-memory value, not shared via storage.
 *   - new-context: a second browser context (two independent clients).
 */
export const GET_ID = 'jupyterlab-commands-toolkit:get-web-client-id';

export const SECOND_CLIENT_MODES = ['same-context', 'new-context'] as const;
export type SecondClientMode = (typeof SECOND_CLIENT_MODES)[number];

export async function waitForToolkit(p: any): Promise<void> {
  await p.waitForFunction(
    (cmd: string) =>
      (window as any).jupyterapp?.commands?.hasCommand(cmd) === true,
    GET_ID
  );
}

export function webClientId(p: any): Promise<string> {
  return p.evaluate(
    (cmd: string) => (window as any).jupyterapp.commands.execute(cmd),
    GET_ID
  );
}

/**
 * Open a second web client relative to the galata `page`, per `mode`, navigate
 * it to the lab, and wait for the toolkit to be ready. Returns the new page and
 * a cleanup that disposes the tab (same-context) or the whole context.
 */
export async function openSecondClient(
  page: any,
  browser: any,
  baseURL: string,
  mode: SecondClientMode
): Promise<{ page2: any; cleanup: () => Promise<void> }> {
  if (mode === 'same-context') {
    const page2 = await page.context().newPage();
    await page2.goto(`${baseURL}/lab?reset`);
    await waitForToolkit(page2);
    return {
      page2,
      cleanup: async () => {
        await page2.close();
      }
    };
  }
  const context = await browser.newContext();
  const page2 = await context.newPage();
  await page2.goto(`${baseURL}/lab?reset`);
  await waitForToolkit(page2);
  return {
    page2,
    cleanup: async () => {
      await context.close();
    }
  };
}
