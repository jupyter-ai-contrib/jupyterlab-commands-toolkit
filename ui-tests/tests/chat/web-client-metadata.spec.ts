/**
 * E2E (Chat integration): the toolkit stamps a per-tab `web_client_id` into the
 * metadata of every chat message, and different browser tabs get different ids.
 *
 * Runs only in the `chat` nox env, where `jupyterlab-chat` is installed and
 * provides `IChatTracker` (so the toolkit's optional metadata contributor
 * activates).
 */
import { expect, test } from '@jupyterlab/galata';
import { UUID } from '@lumino/coreutils';

const INPUT = '.jp-chat-input-container';
const SEND = `${INPUT} .jp-chat-send-button`;

async function openChat(page: any): Promise<string> {
  const path = `chat-${UUID.uuid4()}.chat`;
  await page.filebrowser.contents.uploadContent('{}', 'text', path);
  await page.evaluate(async (name: string) => {
    await (window as any).jupyterapp.commands.execute('jupyterlab-chat:open', {
      filepath: name
    });
  }, path);
  const tab = path.split('/').pop() as string;
  await page.waitForCondition(async () => page.activity.isTabActive(tab));
  return path;
}

function webClientId(page: any): Promise<string> {
  return page.evaluate(() =>
    (window as any).jupyterapp.commands.execute(
      'jupyterlab-commands-toolkit:get-web-client-id'
    )
  );
}

async function readMessages(page: any, path: string): Promise<any[]> {
  return page.evaluate(async (p: string) => {
    const model = await (window as any).jupyterapp.serviceManager.contents.get(
      p,
      { content: true }
    );
    const content =
      typeof model.content === 'string'
        ? JSON.parse(model.content)
        : model.content;
    return content.messages || [];
  }, path);
}

test.describe('chat integration: web_client_id metadata', () => {
  test('attaches web_client_id to a sent message', async ({ page }) => {
    const path = await openChat(page);
    const id = await webClientId(page);

    const chat = (await page.activity.getPanelLocator(
      path.split('/').pop() as string
    )) as any;
    await chat.locator(INPUT).getByRole('combobox').pressSequentially('hello');
    await chat.locator(SEND).click();

    // The message (with metadata) is persisted to the .chat document; poll it.
    await expect
      .poll(
        async () => {
          const messages = await readMessages(page, path);
          return messages.some(m => m?.metadata?.web_client_id === id);
        },
        { timeout: 20000 }
      )
      .toBe(true);
  });

  test('two tabs get two different web_client_ids', async ({
    page,
    browser,
    baseURL
  }) => {
    const id1 = await webClientId(page);

    const context = await browser.newContext();
    const page2 = await context.newPage();
    await page2.goto(`${baseURL}/lab`);
    await page2.waitForFunction(
      () =>
        (window as any).jupyterapp?.commands?.hasCommand(
          'jupyterlab-commands-toolkit:get-web-client-id'
        ) === true
    );
    const id2 = await page2.evaluate(() =>
      (window as any).jupyterapp.commands.execute(
        'jupyterlab-commands-toolkit:get-web-client-id'
      )
    );
    await context.close();

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });
});
