import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { Event } from '@jupyterlab/services';
import { Token, UUID } from '@lumino/coreutils';

const JUPYTERLAB_COMMAND_SCHEMA_ID =
  'https://events.jupyter.org/jupyterlab_command_toolkit/lab_command/v1';

const JUPYTERLAB_COMMAND_RESULT_SCHEMA_ID =
  'https://events.jupyter.org/jupyterlab_command_toolkit/lab_command_result/v1';

/**
 * The command IDs used by the extension.
 */
namespace CommandIDs {
  export const listAllCommands =
    'jupyterlab-commands-toolkit:list-all-commands';
  export const getWebClientId = 'jupyterlab-commands-toolkit:get-web-client-id';
}

/**
 * The token for the id of this web client (browser tab).
 */
export const IWebClientId = new Token<string>(
  'jupyterlab-commands-toolkit:IWebClientId',
  'The id of this web client, used to route commands to a specific browser tab.'
);

type JupyterLabCommand = {
  name: string;
  args: any;
  requestId?: string;
  /**
   * The id of the web client that should execute the command.
   * When not set, all web clients execute the command.
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
 * A plugin providing a unique id for this web client.
 */
const webClientId: JupyterFrontEndPlugin<string> = {
  id: 'jupyterlab-commands-toolkit:web-client-id',
  description: 'Provides a unique id for this web client.',
  autoStart: true,
  provides: IWebClientId,
  activate: (): string => UUID.uuid4()
};

/**
 * Initialization data for the jupyterlab-commands-toolkit extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-commands-toolkit:plugin',
  description:
    'A Jupyter extension that provides an AI toolkit for JupyterLab commands.',
  autoStart: true,
  requires: [IWebClientId],
  activate: (app: JupyterFrontEnd, clientId: string) => {
    const { commands } = app;
    const events = app.serviceManager.events;

    const handleCommand = async (event: Event.Emission): Promise<void> => {
      const data = event as any as JupyterLabCommand;
      if (data.client_id && data.client_id !== clientId) {
        return;
      }

      const result: JupyterLabCommandResult = {
        requestId: data.requestId || '',
        success: false
      };

      try {
        const commandResult = await app.commands.execute(data.name, data.args);
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
        void events.emit({
          schema_id: JUPYTERLAB_COMMAND_RESULT_SCHEMA_ID,
          version: '1',
          data: result
        });
      }
    };

    events.stream.connect((sender, emission) => {
      if (emission.schema_id === JUPYTERLAB_COMMAND_SCHEMA_ID) {
        void handleCommand(emission);
      }
    });

    commands.addCommand(CommandIDs.getWebClientId, {
      label: 'Get Web Client ID',
      execute: () => clientId
    });

    commands.addCommand(CommandIDs.listAllCommands, {
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
  }
};

export default [webClientId, plugin];
