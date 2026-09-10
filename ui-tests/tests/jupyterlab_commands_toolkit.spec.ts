import {
  expect,
  galata,
  IJupyterLabPageFixture,
  test
} from '@jupyterlab/galata';

const COMMAND_SCHEMA_ID =
  'https://events.jupyter.org/jupyterlab_command_toolkit/lab_command/v1';

/**
 * Get the id of the web client of the page.
 */
function getWebClientId(page: IJupyterLabPageFixture): Promise<string> {
  return page.evaluate(() =>
    window.jupyterapp.commands.execute(
      'jupyterlab-commands-toolkit:get-web-client-id'
    )
  );
}

/**
 * Emit a command event from the page, as the server would.
 */
async function emitCommand(
  page: IJupyterLabPageFixture,
  data: { name: string; client_id?: string }
): Promise<void> {
  await page.evaluate(
    ({ schemaId, data }) =>
      window.jupyterapp.serviceManager.events.emit({
        schema_id: schemaId,
        version: '1',
        data
      }),
    { schemaId: COMMAND_SCHEMA_ID, data }
  );
}

test.describe('web client routing', () => {
  let otherPage: IJupyterLabPageFixture;

  test.beforeEach(async ({ baseURL, browser, tmpPath, waitForApplication }) => {
    otherPage = (
      await galata.newPage({
        baseURL: baseURL!,
        browser,
        tmpPath,
        waitForApplication
      })
    ).page;
  });

  test.afterEach(async () => {
    await otherPage.context().close();
  });

  test('should execute a command on all the web clients', async ({ page }) => {
    await emitCommand(page, { name: 'application:toggle-left-area' });

    await expect.poll(() => page.sidebar.isOpen('left')).toBe(false);
    await expect.poll(() => otherPage.sidebar.isOpen('left')).toBe(false);
  });

  test('should execute a command on the target web client only', async ({
    page
  }) => {
    const clientId = await getWebClientId(page);
    const otherClientId = await getWebClientId(otherPage);
    expect(clientId).not.toBe(otherClientId);

    await emitCommand(page, {
      name: 'application:toggle-left-area',
      client_id: otherClientId
    });
    await expect.poll(() => otherPage.sidebar.isOpen('left')).toBe(false);

    // A command for all the web clients, to make sure the events were processed
    await emitCommand(page, { name: 'application:toggle-right-area' });
    await expect.poll(() => page.sidebar.isOpen('right')).toBe(true);
    await expect.poll(() => otherPage.sidebar.isOpen('right')).toBe(true);

    expect(await page.sidebar.isOpen('left')).toBe(true);
  });
});
