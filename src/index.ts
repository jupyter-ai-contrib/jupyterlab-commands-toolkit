import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { Event } from '@jupyterlab/services';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { UUID } from '@lumino/coreutils';

const PLUGIN_ID = 'jupyterlab-commands-toolkit:plugin';

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

// Translate a glob pattern (`*`, `?`) into an anchored RegExp.
function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexPattern = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${regexPattern}$`, 'u');
}

function compilePatterns(patterns: ReadonlyArray<unknown>): RegExp[] {
  const result: RegExp[] = [];
  for (const pattern of patterns) {
    if (typeof pattern !== 'string' || pattern.length === 0) {
      continue;
    }
    try {
      result.push(globToRegex(pattern));
    } catch (e) {
      console.warn(`[${PLUGIN_ID}] Failed to compile pattern "${pattern}":`, e);
    }
  }
  return result;
}

function isAllowed(id: string, allowed: RegExp[], denied: RegExp[]): boolean {
  if (allowed.length > 0 && !allowed.some(re => re.test(id))) {
    return false;
  }
  if (denied.some(re => re.test(id))) {
    return false;
  }
  return true;
}

/**
 * Initialization data for the jupyterlab-commands-toolkit extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description:
    'A Jupyter extension that provides an AI toolkit for JupyterLab commands.',
  autoStart: true,
  optional: [ISettingRegistry, ITranslator],
  activate: (
    app: JupyterFrontEnd,
    settingRegistry: ISettingRegistry | null,
    translator: ITranslator | null
  ) => {
    const { commands } = app;
    const events = app.serviceManager.events;
    const trans = (translator ?? nullTranslator).load(
      'jupyterlab_commands_toolkit'
    );
    // The id of this web client (browser tab), new on each page load
    const clientId = UUID.uuid4();

    // Empty until settings load resolves — fail-open so list_all_commands
    // returns everything if it fires before the async load completes.
    let allowedRegexes: RegExp[] = [];
    let deniedRegexes: RegExp[] = [];

    const refreshFromSettings = (settings: ISettingRegistry.ISettings) => {
      const allowed = settings.get('allowedPatterns').composite as
        | unknown[]
        | undefined;
      const denied = settings.get('deniedPatterns').composite as
        | unknown[]
        | undefined;
      allowedRegexes = compilePatterns(allowed ?? []);
      deniedRegexes = compilePatterns(denied ?? []);
    };

    if (settingRegistry) {
      settingRegistry
        .load(PLUGIN_ID)
        .then(settings => {
          refreshFromSettings(settings);
          settings.changed.connect(refreshFromSettings);
        })
        .catch(err => {
          console.error(`[${PLUGIN_ID}] Failed to load settings:`, err);
        });
    }

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
      label: trans.__('Get Web Client ID'),
      describedBy: {
        args: {
          type: 'object',
          properties: {}
        }
      },
      execute: () => clientId
    });

    commands.addCommand(CommandIDs.listAllCommands, {
      label: trans.__('List All Commands'),
      describedBy: {
        args: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: trans.__(
                'Only list the commands with an id, label, caption or usage that contains this text'
              )
            }
          }
        }
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

        // Get all command IDs and apply the configured allow/deny filter first,
        // so we don't waste work fetching metadata for excluded commands.
        const commandIds = commands
          .listCommands()
          .filter(id => isAllowed(id, allowedRegexes, deniedRegexes));

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

export default plugin;
