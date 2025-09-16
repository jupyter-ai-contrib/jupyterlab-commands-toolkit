import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { Event } from '@jupyterlab/services';
import { IEventListener } from 'jupyterlab-eventlistener';

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
    console.log(
      'JupyterLab extension jupyterlab-commands-toolkit is activated 2342521263!'
    );

    const { commands } = app;

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
            (commandResult.constructor?.name?.includes('Widget') ||
              commandResult.id)
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
      execute: async () => {
        const commandList: Array<{
          id: string;
          label?: string;
          caption?: string;
          description?: string;
          args?: any;
        }> = [];

        const commandIds = commands.listCommands();

        for (const id of commandIds) {
          const description = await commands.describedBy(id);
          const label = commands.label(id);
          const caption = commands.caption(id);
          const usage = commands.usage(id);

          commandList.push({
            id,
            label: label || undefined,
            caption: caption || undefined,
            description: usage || undefined,
            args: description?.args || undefined
          });
        }
        return commandList;
      }
    });
  }
};

export default plugin;
