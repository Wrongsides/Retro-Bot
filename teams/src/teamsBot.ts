import { TeamsActivityHandler, TurnContext } from "botbuilder";
import { callMcpTool, listMcpTools } from "./mcpClient.js";

/**
 * Minimal Teams bot used to verify Bot Framework <-> Teams permissions/wiring,
 * and to prove the bot can reach the retro-bot MCP server as an MCP client.
 *
 * Commands (typed as plain chat messages):
 *  - "tools"          -> lists the tools exposed by the retro-bot MCP server
 *  - "create retro"   -> calls the miro_create_retro tool as a smoke test
 *  - "cycle overview"  -> calls the cycle_overview tool (Jira actions completed/in
 *                         progress since the previous retro)
 *  - anything else    -> echoes back with usage help
 */
export class TeamsRetroBot extends TeamsActivityHandler {
  constructor() {
    super();

    this.onMessage(async (context: TurnContext, next) => {
      const text = (context.activity.text ?? "").trim().toLowerCase();

      try {
        if (text === "tools") {
          const tools = await listMcpTools();
          await context.sendActivity(
            tools.length > 0 ? `Available MCP tools:\n- ${tools.join("\n- ")}` : "No tools returned by the MCP server."
          );
        } else if (text === "create retro") {
          const result = await callMcpTool("miro_create_retro", {});
          await context.sendActivity(`miro_create_retro result:\n${result}`);
        } else if (text === "cycle overview") {
          const result = await callMcpTool("cycle_overview", {});
          await context.sendActivity(`cycle_overview result:\n${result}`);
        } else {
          await context.sendActivity(
            'Hi! Try "tools" to list retro-bot MCP tools, "create retro" to run a smoke test, or "cycle overview" for a Jira summary since the last retro.'
          );
        }
      } catch (err) {
        await context.sendActivity(`⚠️ MCP call failed: ${String(err)}`);
      }

      await next();
    });

    this.onMembersAdded(async (context, next) => {
      for (const member of context.activity.membersAdded ?? []) {
        if (member.id !== context.activity.recipient.id) {
          await context.sendActivity(
            'Welcome! I bridge Teams to the retro-bot MCP server. Send "tools" to get started.'
          );
        }
      }
      await next();
    });
  }
}
