import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { Event } from '@jupyterlab/services';
import { Token } from '@lumino/coreutils';
import { IEventListener } from 'jupyterlab-eventlistener';
import { IChatTracker, IChatPanel } from '@jupyter/chat';

const JUPYTERLAB_COMMAND_SCHEMA_ID =
  'https://events.jupyter.org/jupyterlab_command_toolkit/lab_command/v1';

const JUPYTERLAB_COMMAND_RESULT_SCHEMA_ID =
  'https://events.jupyter.org/jupyterlab_command_toolkit/lab_command_result/v1';

/**
 * A stable id for this browser tab (this web client), generated once per page
 * load. Commands may be addressed to a specific web client via `client_id`;
 * this id is what an incoming command is matched against, and the value this
 * tab stamps into the metadata of the chat messages it sends.
 */
export const WEB_CLIENT_ID = crypto.randomUUID();

/**
 * Token providing this browser tab's web client id, for other extensions that
 * want to read it.
 */
export const IWebClientId = new Token<string>(
  'jupyterlab-commands-toolkit:IWebClientId'
);

type JupyterLabCommand = {
  name: string;
  args: any;
  requestId?: string;
  /**
   * Optional target web client. When set, only the browser whose
   * `WEB_CLIENT_ID` matches executes the command; other browsers ignore it.
   * When absent, every browser executes it (backward-compatible broadcast).
   */
  client_id?: string;
};

type JupyterLabCommandResult = {
  requestId: string;
  success: boolean;
  result?: any;
  error?: string;
};

/**
 * Initialization data for the jupyterlab-commands-toolkit extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-commands-toolkit:plugin',
  description:
    'A Jupyter extension that provides an AI toolkit for JupyterLab commands.',
  autoStart: true,
  requires: [IEventListener],
  activate: (app: JupyterFrontEnd, eventListener: IEventListener) => {
    const { commands } = app;

    eventListener.addListener(
      JUPYTERLAB_COMMAND_SCHEMA_ID,
      async (manager, _, event: Event.Emission) => {
        const data = event as any as JupyterLabCommand;

        // Web-client routing: a command may target a specific web client. Only
        // the matching browser executes it; others ignore it entirely (no
        // execution, no result). A command with no `client_id` is a broadcast
        // and runs everywhere, preserving the pre-routing behavior.
        if (data.client_id && data.client_id !== WEB_CLIENT_ID) {
          return;
        }

        const result: JupyterLabCommandResult = {
          requestId: data.requestId || '',
          success: false
        };

        try {
          const commandResult = await app.commands.execute(
            data.name,
            data.args
          );
          result.success = true;

          // Handle Widget objects specially (including subclasses like DocumentWidget)
          let serializedResult;
          if (
            commandResult &&
            typeof commandResult === 'object' &&
            commandResult.constructor?.name?.includes('Widget')
          ) {
            serializedResult = {
              type: commandResult.constructor?.name || 'Widget',
              id: commandResult.id,
              title: commandResult.title?.label || commandResult.title,
              className: commandResult.className
            };
          } else {
            // For other objects, try JSON serialization with fallback
            try {
              serializedResult = JSON.parse(JSON.stringify(commandResult));
            } catch {
              serializedResult = commandResult
                ? '[Complex object - cannot serialize]'
                : 'Command executed successfully';
            }
          }

          result.result = serializedResult;
        } catch (error) {
          result.success = false;
          result.error = error instanceof Error ? error.message : String(error);
        }

        // Emit the result back if we have a requestId
        if (data.requestId) {
          manager.emit({
            schema_id: JUPYTERLAB_COMMAND_RESULT_SCHEMA_ID,
            version: '1',
            data: result
          });
        }
      }
    );

    commands.addCommand('jupyterlab-commands-toolkit:list-all-commands', {
      label: 'List All Commands',
      describedBy: {
        args: {}
      },
      execute: async (args: any) => {
        const query = args['query'] as string | undefined;

        const commandList: Array<{
          id: string;
          label?: string;
          caption?: string;
          description?: string;
          args?: any;
        }> = [];

        // Get all command IDs
        const commandIds = commands.listCommands();

        for (const id of commandIds) {
          // Get command metadata using various CommandRegistry methods
          // Wrap each call in try/catch since some commands throw internally
          let description: any = null;
          let label = '';
          let caption = '';
          let usage = '';
          try {
            description = await commands.describedBy(id);
          } catch (e) {
            console.warn(`Failed to get describedBy for command "${id}":`, e);
          }
          try {
            label = commands.label(id);
          } catch (e) {
            console.warn(`Failed to get label for command "${id}":`, e);
          }
          try {
            caption = commands.caption(id);
          } catch (e) {
            console.warn(`Failed to get caption for command "${id}":`, e);
          }
          try {
            usage = commands.usage(id);
          } catch (e) {
            console.warn(`Failed to get usage for command "${id}":`, e);
          }

          const command = {
            id,
            label: label || undefined,
            caption: caption || undefined,
            description: usage || undefined,
            args: description?.args || undefined
          };

          // Filter by query if provided
          if (query) {
            const searchTerm = query.toLowerCase();
            const matchesQuery =
              id.toLowerCase().includes(searchTerm) ||
              label?.toLowerCase().includes(searchTerm) ||
              caption?.toLowerCase().includes(searchTerm) ||
              usage?.toLowerCase().includes(searchTerm);

            if (matchesQuery) {
              commandList.push(command);
            }
          } else {
            commandList.push(command);
          }
        }
        return {
          success: true,
          commandCount: commandList.length,
          commands: commandList
        };
      }
    });

    // Introspection: return this browser tab's web client id. Useful for
    // debugging multi-client routing (and for E2E tests to learn the id).
    commands.addCommand('jupyterlab-commands-toolkit:get-web-client-id', {
      label: 'Get Web Client ID',
      describedBy: {
        args: {}
      },
      execute: () => WEB_CLIENT_ID
    });
  }
};

/**
 * Provides this browser tab's web client id via a token.
 */
const webClientIdPlugin: JupyterFrontEndPlugin<string> = {
  id: 'jupyterlab-commands-toolkit:web-client-id',
  description: "Provides this browser tab's stable web client id.",
  autoStart: true,
  provides: IWebClientId,
  activate: (): string => WEB_CLIENT_ID
};

/**
 * Optional integration with Jupyter Chat: stamp this browser tab's web client
 * id into the metadata of every chat message it sends, so an AI persona can
 * route frontend commands back to the specific web client that triggered them.
 *
 * This plugin only activates when `@jupyter/chat` provides `IChatTracker`; when
 * Jupyter Chat is absent, the token is not provided and this is a no-op. The
 * id is merged into `input.metadata` (not replaced), so it coexists with
 * metadata contributed by other extensions (e.g. persona-manager's
 * `to_persona`/`model`/`settings`).
 */
const chatMetadataPlugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-commands-toolkit:web-client-metadata',
  description:
    'Stamps the web client id into outgoing chat message metadata (optional; requires @jupyter/chat).',
  autoStart: true,
  optional: [IChatTracker],
  activate: (app: JupyterFrontEnd, chatTracker: IChatTracker | null) => {
    if (!chatTracker) {
      return;
    }
    const stamp = (panel: IChatPanel) => {
      // `updateMetadata` merges the patch, and the input model keeps its
      // metadata across sends, so a single stamp rides on every message.
      panel.model.input.updateMetadata({ web_client_id: WEB_CLIENT_ID });
    };
    chatTracker.forEach(stamp);
    chatTracker.widgetAdded.connect((_, panel) => stamp(panel));
  }
};

export default [plugin, webClientIdPlugin, chatMetadataPlugin];
