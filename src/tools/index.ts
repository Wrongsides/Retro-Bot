import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerJiraTools } from "./jiraTools.js";
import { registerMiroTools } from "./miroTools.js";
import { registerGitHubTools } from "./githubTools.js";
import { registerRetroOverviewTools } from "./retroOverviewTools.js";
import { registerRetroTemplateTools } from "./retroTemplateTools.js";

export function registerAllTools(server: McpServer) {
  registerJiraTools(server);
  registerMiroTools(server);
  registerGitHubTools(server);
  registerRetroOverviewTools(server);
  registerRetroTemplateTools(server);
}
