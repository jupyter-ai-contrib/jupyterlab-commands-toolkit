// Required: makes this a module file so `declare module` below augments
// @jupyter/chat rather than replacing it with an ambient module declaration.
export {};

declare module '@jupyter/chat' {
  export interface IMessageMetadata {
    /**
     * The id of the web client (browser tab) that sent this message. Stamped by
     * jupyterlab-commands-toolkit so the server can route frontend commands
     * back to the specific web client that triggered them.
     */
    web_client_id?: string;
  }
}
