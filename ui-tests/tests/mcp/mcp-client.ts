/**
 * Minimal MCP client for the `mcp` E2E suite: connects to the in-process
 * FastMCP server (e2e_mcp_ext.py) over streamable HTTP with an
 * `X-Web-Client-Id` header and calls the `run_command` tool.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export async function callRunCommand(
  port: number,
  webClientId: string,
  name: string,
  opts: { args?: Record<string, any>; delay?: number } = {}
): Promise<any> {
  const client = new Client({ name: 'ct-e2e', version: '0.0.0' });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${port}/mcp`),
    { requestInit: { headers: { 'X-Web-Client-Id': webClientId } } }
  );
  await client.connect(transport);
  try {
    return await client.callTool({
      name: 'run_command',
      arguments: { name, args: opts.args ?? {}, delay: opts.delay ?? 0 }
    });
  } finally {
    await client.close();
  }
}
