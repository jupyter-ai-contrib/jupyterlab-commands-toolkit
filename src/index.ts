import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { Event } from '@jupyterlab/services';
import { IEventListener } from 'jupyterlab-eventlistener';


const JUPYTERLAB_COMMAND_SCHEMA_ID = "https://events.jupyter.org/jupyterlab_command_toolkit/lab_command/v1"

type JupyterLabCommand = {
  name: string, 
  args: any
}


/**
 * Initialization data for the jupyterlab-commands-toolkit extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-commands-toolkit:plugin',
  description: 'A Jupyter extension that provides an AI toolkit for JupyterLab commands.',
  autoStart: true,
  requires: [IEventListener],
  activate: (app: JupyterFrontEnd, eventListener: IEventListener) => {

    console.log('JupyterLab extension jupyterlab-commands-toolkit is activated 2342521263!');
    
    eventListener.addListener(
      JUPYTERLAB_COMMAND_SCHEMA_ID,
      async (manager, schemaId, event: Event.Emission) => {
        let data = event as any as JupyterLabCommand
        await app.commands.execute(data.name, data.args)
      }
    );
  }
};

export default plugin;
