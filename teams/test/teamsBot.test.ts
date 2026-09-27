import { TestAdapter } from "botbuilder";
import { describe, expect, test } from "vitest";
import { McpClient } from "../src/mcpClient.js";
import { TeamsRetroBot } from "../src/teamsBot.js";

function createTestAdapter(mcpClient: McpClient): TestAdapter {
  const bot = new TeamsRetroBot(mcpClient);
  return new TestAdapter(async (context) => bot.run(context));
}

describe("TeamsRetroBot message routing", () => {
  test('"tools" lists the tools returned by the MCP server', async () => {
    const mcpClient = McpClient.createNull({ tools: ["miro_create_retro", "cycle_overview"] });
    const adapter = createTestAdapter(mcpClient);

    await adapter.send("tools").assertReply("Available MCP tools:\n- miro_create_retro\n- cycle_overview");
  });

  test('"tools" reports when the MCP server returns no tools', async () => {
    const mcpClient = McpClient.createNull({ tools: [] });
    const adapter = createTestAdapter(mcpClient);

    await adapter.send("tools").assertReply("No tools returned by the MCP server.");
  });

  test('"create retro" calls miro_create_retro and relays the result', async () => {
    const mcpClient = McpClient.createNull({
      responses: { miro_create_retro: "Created board https://miro.com/board/123" },
    });
    const adapter = createTestAdapter(mcpClient);

    await adapter
      .send("create retro")
      .assertReply("miro_create_retro result:\nCreated board https://miro.com/board/123");

    expect(mcpClient.trackCalls()).toEqual([{ toolName: "miro_create_retro", args: {} }]);
  });

  test('"cycle overview" calls cycle_overview and relays the result', async () => {
    const mcpClient = McpClient.createNull({
      responses: { cycle_overview: "3 tickets completed since the last retro" },
    });
    const adapter = createTestAdapter(mcpClient);

    await adapter
      .send("cycle overview")
      .assertReply("cycle_overview result:\n3 tickets completed since the last retro");

    expect(mcpClient.trackCalls()).toEqual([{ toolName: "cycle_overview", args: {} }]);
  });

  test("unrecognised text falls back to the usage help message", async () => {
    const mcpClient = McpClient.createNull();
    const adapter = createTestAdapter(mcpClient);

    await adapter
      .send("hello there")
      .assertReply(
        'Hi! Try "tools" to list retro-bot MCP tools, "create retro" to run a smoke test, or "cycle overview" for a Jira summary since the last retro.'
      );
  });

  test("command matching is case-insensitive and trims whitespace", async () => {
    const mcpClient = McpClient.createNull({ tools: ["only_tool"] });
    const adapter = createTestAdapter(mcpClient);

    await adapter.send("  TOOLS  ").assertReply("Available MCP tools:\n- only_tool");
  });

  test("an MCP call failure is reported back to the user instead of throwing", async () => {
    const mcpClient = McpClient.createNull({
      responses: {
        miro_create_retro: () => {
          throw new Error("Miro createFrame failed: 500");
        },
      },
    });
    const adapter = createTestAdapter(mcpClient);

    await adapter.send("create retro").assertReply((activity) => {
      expect(activity.text).toContain("⚠️ MCP call failed:");
      expect(activity.text).toContain("Miro createFrame failed: 500");
    });
  });
});

describe("TeamsRetroBot welcome message", () => {
  test("greets a newly added member (not the bot itself)", async () => {
    const mcpClient = McpClient.createNull();
    const adapter = createTestAdapter(mcpClient);

    await adapter.receiveActivity({
      type: "conversationUpdate",
      membersAdded: [{ id: "user-1", name: "User One" }],
      recipient: { id: "bot-1", name: "Bot" },
    });

    expect(adapter.activityBuffer).toHaveLength(1);
    expect(adapter.activityBuffer[0].text).toBe(
      'Welcome! I bridge Teams to the retro-bot MCP server. Send "tools" to get started.'
    );
  });

  test("does not greet the bot itself when it is added to the conversation", async () => {
    const mcpClient = McpClient.createNull();
    const adapter = createTestAdapter(mcpClient);

    await adapter.receiveActivity({
      type: "conversationUpdate",
      membersAdded: [{ id: "bot-1", name: "Bot" }],
      recipient: { id: "bot-1", name: "Bot" },
    });

    expect(adapter.activityBuffer).toHaveLength(0);
  });
});
