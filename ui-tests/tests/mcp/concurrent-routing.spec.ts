/**
 * E2E (MCP integration, concurrency): two overlapping tool calls with different
 * X-Web-Client-Id headers must each route to their own client and no other.
 *
 * Both calls sleep 5s server-side (while their target_client_id contextvar is
 * set) so they are provably in flight at the same time, then open a *different*
 * document on their respective client. If the contextvar leaked between the
 * concurrent calls, one client would end up with both documents (or the wrong
 * one); we assert each client has exactly its own document.
 */
import { expect, test } from '@jupyterlab/galata';
import { callRunCommand } from './mcp-client';

const MCP_PORT = Number(process.env.CT_MCP_PORT || '3999');
const NB = 'Untitled.ipynb';
const TXT = 'untitled.txt';
const DELAY = 5;

function webClientId(p: any): Promise<string> {
  return p.evaluate(() =>
    (window as any).jupyterapp.commands.execute(
      'jupyterlab-commands-toolkit:get-web-client-id'
    )
  );
}

function openDocPaths(p: any): Promise<string[]> {
  return p.evaluate(() => {
    const app = (window as any).jupyterapp;
    const paths: string[] = [];
    for (const w of app.shell.widgets('main')) {
      const ctx = (w as any).context;
      if (ctx && ctx.path) {
        paths.push(ctx.path);
      }
    }
    return paths;
  });
}

test.describe('mcp integration: concurrent routing', () => {
  test('overlapping tool calls each run on their own client only', async ({
    page,
    browser,
    baseURL
  }) => {
    test.setTimeout(60_000);
    // Client A is this galata page; client B is a second browser context.
    const idA = await webClientId(page);
    const context = await browser.newContext();
    const pageB = await context.newPage();
    await pageB.goto(`${baseURL}/lab`);
    await pageB.waitForFunction(
      () =>
        (window as any).jupyterapp?.commands?.hasCommand(
          'jupyterlab-commands-toolkit:get-web-client-id'
        ) === true
    );
    const idB = await webClientId(pageB);
    expect(idA).not.toBe(idB);

    // Pre-create both documents so the routed command just opens them (the
    // notebook carries a kernelspec so opening it does not pop a kernel dialog).
    await page.evaluate(
      async (arg: { nb: string; txt: string }) => {
        const c = (window as any).jupyterapp.serviceManager.contents;
        await c.save(arg.nb, {
          type: 'notebook',
          format: 'json',
          content: {
            cells: [],
            metadata: {
              kernelspec: { name: 'python3', display_name: 'Python 3' }
            },
            nbformat: 4,
            nbformat_minor: 5
          }
        });
        await c.save(arg.txt, { type: 'file', format: 'text', content: 'hi' });
      },
      { nb: NB, txt: TXT }
    );

    // Fire both at the same time; each sleeps 5s server-side, guaranteeing the
    // two calls (with different client ids) overlap before either resolves.
    const [rA, rB] = await Promise.all([
      callRunCommand(MCP_PORT, idA, 'docmanager:open', {
        args: { path: NB },
        delay: DELAY
      }),
      callRunCommand(MCP_PORT, idB, 'docmanager:open', {
        args: { path: TXT },
        delay: DELAY
      })
    ]);
    expect(Boolean(rA?.isError)).toBe(false);
    expect(Boolean(rB?.isError)).toBe(false);

    // Client A opened the notebook and ONLY the notebook.
    await expect.poll(() => openDocPaths(page)).toContain(NB);
    expect(await openDocPaths(page)).not.toContain(TXT);

    // Client B opened the text file and ONLY the text file.
    await expect.poll(() => openDocPaths(pageB)).toContain(TXT);
    expect(await openDocPaths(pageB)).not.toContain(NB);

    await context.close();
  });
});
