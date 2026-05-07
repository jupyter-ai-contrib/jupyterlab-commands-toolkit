import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { Event } from '@jupyterlab/services';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { IEventListener } from 'jupyterlab-eventlistener';

const PLUGIN_ID = 'jupyterlab-commands-toolkit:plugin';

const JUPYTERLAB_COMMAND_SCHEMA_ID =
  'https://events.jupyter.org/jupyterlab_command_toolkit/lab_command/v1';

const JUPYTERLAB_COMMAND_RESULT_SCHEMA_ID =
  'https://events.jupyter.org/jupyterlab_command_toolkit/lab_command_result/v1';

type JupyterLabCommand = {
  name: string;
  args: any;
  requestId?: string;
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
  requires: [IEventListener],
  optional: [ISettingRegistry],
  activate: (
    app: JupyterFrontEnd,
    eventListener: IEventListener,
    settingRegistry: ISettingRegistry | null
  ) => {
    const { commands } = app;

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

    eventListener.addListener(
      JUPYTERLAB_COMMAND_SCHEMA_ID,
      async (manager, _, event: Event.Emission) => {
        const data = event as any as JupyterLabCommand;
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
