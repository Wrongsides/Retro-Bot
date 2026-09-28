import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerJiraTools } from "./jiraTools.js";
import { registerMiroTools } from "./miroTools.js";
import { registerGitHubTools } from "./githubTools.js";
import { registerCycleOverviewTools } from "./cycleOverviewTools.js";
import { registerRetroTemplateTools } from "./retroTemplateTools.js";
import { registerSummaryTools } from "./summaryTools.js";
import { registerSentimentTrendTools } from "./sentimentTrendTools.js";

export function registerAllTools(server: McpServer) {
  registerJiraTools(server);
  registerMiroTools(server);
  registerGitHubTools(server);
  registerCycleOverviewTools(server);
  registerRetroTemplateTools(server);
  registerSummaryTools(server);
  registerSentimentTrendTools(server);
}
