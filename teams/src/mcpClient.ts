import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { config } from "./config.js";

/**
 * Thin wrapper around the MCP SDK client, scoped to the retro-bot MCP server.
 * A fresh client/transport is created per call since the server uses a
 * stateless StreamableHTTPServerTransport (sessionIdGenerator: undefined).
 */
async function withMcpClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const transport = new StreamableHTTPClientTransport(new URL(config.mcpServerUrl), {
    requestInit: config.mcpServerToken
      ? { headers: { Authorization: `Bearer ${config.mcpServerToken}` } }
      : undefined,
  });

  const client = new Client({ name: "teams-retro-bot", version: "0.1.0" });

  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    await client.close();
  }
}

export async function listMcpTools(): Promise<string[]> {
  return withMcpClient(async (client) => {
    const { tools } = await client.listTools();
    return tools.map((tool) => tool.name);
  });
}

export async function callMcpTool(toolName: string, args: Record<string, unknown>): Promise<string> {
  return withMcpClient(async (client) => {
    const result = await client.callTool({ name: toolName, arguments: args });
    const content = Array.isArray(result.content) ? result.content : [];
    return content
      .map((item) => (item.type === "text" ? item.text : `[${item.type} content]`))
      .join("\n");
  });
}
