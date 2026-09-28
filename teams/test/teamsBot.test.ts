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

  test('"retro summary" calls retro_summary, relays the result, and prompts for star-rating feedback', async () => {
    const mcpClient = McpClient.createNull({
      responses: { retro_summary: "Mood\n- Good" },
    });
    const adapter = createTestAdapter(mcpClient);

    await adapter
      .send("retro summary")
      .assertReply("retro_summary result:\nMood\n- Good")
      .assertReply((activity) => {
        expect(activity.attachments).toHaveLength(1);
        expect(activity.attachments?.[0].contentType).toBe("application/vnd.microsoft.card.adaptive");
        const card = activity.attachments?.[0].content as { actions: { title: string; data: { rating: number } }[] };
        expect(card.actions.map((action) => action.data.rating)).toEqual([1, 2, 3, 4, 5]);
      });

    expect(mcpClient.trackCalls()).toEqual([{ toolName: "retro_summary", args: {} }]);
  });

  test("submitting the feedback card calls retro_feedback with the selected rating", async () => {
    const mcpClient = McpClient.createNull({
      responses: { retro_feedback: "Thanks for the feedback! Recorded 4/5." },
    });
    const adapter = createTestAdapter(mcpClient);

    await adapter
      .send({ type: "message", value: { rating: 4 } })
      .assertReply("retro_feedback result:\nThanks for the feedback! Recorded 4/5.");

    expect(mcpClient.trackCalls()).toEqual([{ toolName: "retro_feedback", args: { rating: 4 } }]);
  });

  test('"feedback <rating> <comment>" calls retro_feedback with the rating and comment', async () => {
    const mcpClient = McpClient.createNull({
      responses: { retro_feedback: "Thanks for the feedback! Recorded 5/5." },
    });
    const adapter = createTestAdapter(mcpClient);

    await adapter
      .send("feedback 5 loved the experiment tracking box")
      .assertReply("retro_feedback result:\nThanks for the feedback! Recorded 5/5.");

    expect(mcpClient.trackCalls()).toEqual([
      { toolName: "retro_feedback", args: { rating: 5, comment: "loved the experiment tracking box" } },
    ]);
  });

  test('"feedback <rating>" without a comment calls retro_feedback with no comment', async () => {
    const mcpClient = McpClient.createNull({
      responses: { retro_feedback: "Thanks for the feedback! Recorded 4/5." },
    });
    const adapter = createTestAdapter(mcpClient);

    await adapter.send("feedback 4").assertReply("retro_feedback result:\nThanks for the feedback! Recorded 4/5.");

    expect(mcpClient.trackCalls()).toEqual([{ toolName: "retro_feedback", args: { rating: 4 } }]);
  });

  test('"github examples" calls retro_github_examples and relays the result', async () => {
    const mcpClient = McpClient.createNull({
      responses: { retro_github_examples: "example-org/example-repo src/clients/githubClient.ts" },
    });
    const adapter = createTestAdapter(mcpClient);

    await adapter
      .send("github examples")
      .assertReply("retro_github_examples result:\nexample-org/example-repo src/clients/githubClient.ts");

    expect(mcpClient.trackCalls()).toEqual([{ toolName: "retro_github_examples", args: {} }]);
  });

  test('"sentiment trend" calls retro_sentiment_trend, relays the result, and attaches a bar-chart card', async () => {
    const mcpClient = McpClient.createNull({
      responses: {
        retro_sentiment_trend:
          "Sentiment trend\n\n- Retro - 2026-08-01: 2/5 — CI frustration\n- Retro - 2026-08-15: 4/5 — Smooth release\n\nTrend: Sentiment improved.",
      },
    });
    const adapter = createTestAdapter(mcpClient);

    await adapter
      .send("sentiment trend")
      .assertReply((activity) => {
        expect(activity.text).toContain("retro_sentiment_trend result:");
        expect(activity.text).toContain("Trend: Sentiment improved.");
      })
      .assertReply((activity) => {
        expect(activity.attachments).toHaveLength(1);
        expect(activity.attachments?.[0].contentType).toBe("application/vnd.microsoft.card.adaptive");
        const card = activity.attachments?.[0].content as {
          body: { type: string; items?: { type: string; text?: string; width?: string }[] }[];
        };
        const rows = card.body.filter((item) => item.type === "ColumnSet");
        expect(rows).toHaveLength(2);
      });

    expect(mcpClient.trackCalls()).toEqual([{ toolName: "retro_sentiment_trend", args: {} }]);
  });

  test('"sentiment trend" skips the chart card when no retro was scored', async () => {
    const mcpClient = McpClient.createNull({
      responses: { retro_sentiment_trend: "No retros found on the board to analyse." },
    });
    const adapter = createTestAdapter(mcpClient);

    await adapter
      .send("sentiment trend")
      .assertReply("retro_sentiment_trend result:\nNo retros found on the board to analyse.");

    expect(mcpClient.trackCalls()).toEqual([{ toolName: "retro_sentiment_trend", args: {} }]);
  });

  test('"feedback summary" calls retro_feedback_summary and relays the result', async () => {
    const mcpClient = McpClient.createNull({
      responses: { retro_feedback_summary: "Retro-Bot feedback: 4.0/5 average from 3 ratings" },
    });
    const adapter = createTestAdapter(mcpClient);

    await adapter
      .send("feedback summary")
      .assertReply("retro_feedback_summary result:\nRetro-Bot feedback: 4.0/5 average from 3 ratings");

    expect(mcpClient.trackCalls()).toEqual([{ toolName: "retro_feedback_summary", args: {} }]);
  });

  test('"feedback" with an out-of-range rating is rejected without calling the MCP server', async () => {
    const mcpClient = McpClient.createNull();
    const adapter = createTestAdapter(mcpClient);

    await adapter
      .send("feedback 9 too high")
      .assertReply('Please give a star rating between 1 and 5, e.g. "feedback 5 loved it".');

    expect(mcpClient.trackCalls()).toEqual([]);
  });

  test("unrecognised text falls back to the usage help message", async () => {
    const mcpClient = McpClient.createNull();
    const adapter = createTestAdapter(mcpClient);

    await adapter
      .send("hello there")
      .assertReply(
        'Hi! Try "tools" to list retro-bot MCP tools, "create retro" to build a new retro board to use, "cycle overview" for a Jira summary since the last retro, "retro summary" for the latest retro\'s outcomes, "github examples" to find GitHub code matching this retro\'s problems and action items, "sentiment trend" to see how team sentiment has changed over recent retros, "feedback <1-5> [comment]" to rate Retro-Bot, or "feedback summary" to see the average rating.'
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
