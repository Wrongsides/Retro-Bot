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

export interface McpToolCallRecord {
  toolName: string;
  args: Record<string, unknown>;
}

export interface McpClientNullOptions {
  tools?: string[];
  responses?: Record<string, string | ((args: Record<string, unknown>) => string)>;
}

const DEFAULT_NULL_TOOLS = ["miro_create_retro", "cycle_overview"];

export class McpClient {
  private readonly tracker: { calls: McpToolCallRecord[] } = { calls: [] };

  private constructor(
    private readonly listToolsImpl: () => Promise<string[]>,
    private readonly callToolImpl: (toolName: string, args: Record<string, unknown>) => Promise<string>,
  ) {}

  static create(): McpClient {
    return new McpClient(
      () =>
        withMcpClient(async (client) => {
          const { tools } = await client.listTools();
          return tools.map((tool) => tool.name);
        }),
      (toolName, args) =>
        withMcpClient(async (client) => {
          const result = await client.callTool({ name: toolName, arguments: args });
          const content = Array.isArray(result.content) ? result.content : [];
          return content
            .map((item) => (item.type === "text" ? item.text : `[${item.type} content]`))
            .join("\n");
        }),
    );
  }

  static createNull(options: McpClientNullOptions = {}): McpClient {
    const tools = options.tools ?? DEFAULT_NULL_TOOLS;
    const responses = options.responses ?? {};

    return new McpClient(
      async () => tools,
      async (toolName, args) => {
        const response = responses[toolName];
        if (response === undefined) {
          return `[stub] ${toolName} called with ${JSON.stringify(args)}`;
        }
        return typeof response === "function" ? response(args) : response;
      },
    );
  }

  async listTools(): Promise<string[]> {
    return this.listToolsImpl();
  }

  async callTool(toolName: string, args: Record<string, unknown> = {}): Promise<string> {
    this.tracker.calls.push({ toolName, args });
    return this.callToolImpl(toolName, args);
  }

  trackCalls(): McpToolCallRecord[] {
    const calls = this.tracker.calls;
    this.tracker.calls = [];
    return calls;
  }
}
