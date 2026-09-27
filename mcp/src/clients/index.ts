import { config } from "../config.js";
import { JiraClient } from "./jiraClient.js";
import { MiroClient } from "./miroClient.js";
import { GitHubClient } from "./githubClient.js";

/**
 * Single set of shared client singletons for the MCP server. Each tool module
 * imports the instance it needs instead of constructing its own, so there is
 * exactly one JiraClient/MiroClient/GitHubClient per process (real or null,
 * depending on config.useNullClients).
 */
export const jiraClient = config.useNullClients ? JiraClient.createNull() : JiraClient.create();
export const miroClient = config.useNullClients ? MiroClient.createNull() : MiroClient.create();
export const githubClient = config.useNullClients ? GitHubClient.createNull() : GitHubClient.create();
