/**
 * E2E (Chat integration): the toolkit stamps a per-tab `web_client_id` into the
 * metadata of every chat message, and different browser clients get different
 * ids (both a second tab in the same context and a separate context).
 *
 * Runs only in the `chat` nox env, where `jupyterlab-chat` is installed and
 * provides `IChatTracker` (so the toolkit's optional metadata contributor
 * activates).
 */
import { expect, test } from '@jupyterlab/galata';
import { UUID } from '@lumino/coreutils';
import {
  openSecondClient,
  SECOND_CLIENT_MODES,
  webClientId
} from '../_helpers';

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

  for (const mode of SECOND_CLIENT_MODES) {
    test(`two clients get two different web_client_ids (${mode})`, async ({
      page,
      browser,
      baseURL
    }) => {
      const id1 = await webClientId(page);
      const { page2, cleanup } = await openSecondClient(
        page,
        browser,
        baseURL as string,
        mode
      );
      const id2 = await webClientId(page2);
      await cleanup();

      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });
  }
});
