import "dotenv/config";

function required(name: string, value: string | undefined, fallback?: string): string {
  if (value && value.length > 0) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${name}`);
}

export const config = {
  port: Number(process.env.PORT ?? 3978),
  microsoftAppType: process.env.MicrosoftAppType ?? "MultiTenant",
  microsoftAppId: process.env.MicrosoftAppId ?? "",
  microsoftAppPassword: process.env.MicrosoftAppPassword ?? "",
  microsoftAppTenantId: process.env.MicrosoftAppTenantId ?? "",
  mcpServerUrl: required("MCP_SERVER_URL", process.env.MCP_SERVER_URL, "http://localhost:8080/mcp"),
  mcpServerToken: process.env.MCP_SERVER_TOKEN ?? "",
};
