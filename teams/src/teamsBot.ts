import { Attachment, CardFactory, TeamsActivityHandler, TurnContext } from "botbuilder";
import { McpClient } from "./mcpClient.js";

/**
 * Minimal Teams bot used to verify Bot Framework <-> Teams permissions/wiring,
 * and to prove the bot can reach the retro-bot MCP server as an MCP client.
 *
 * Commands (typed as plain chat messages):
 *  - "tools"          -> lists the tools exposed by the retro-bot MCP server
 *  - "create retro"   -> calls miro_create_retro to add a template to the configured Miro board
 *  - "cycle overview"  -> calls the cycle_overview tool for Jira issues and
 *                         writes ticket notes to Miro
 *  - "retro summary"  -> calls the retro_summary tool (latest retro's columns,
 *                         mood board and experiment tracking box, creates Jira
 *                         action tickets, then prompts for feedback via an
 *                         Adaptive Card with star-rating buttons
 *  - "github examples" -> calls the retro_github_examples tool to find GitHub
 *                         code and commits matching the problems and action
 *                         items raised in the most recent retro
 *  - "sentiment trend" -> calls the retro_sentiment_trend tool to score team
 *                         sentiment across recent retros, then attaches an
 *                         Adaptive Card bar chart of the scores
 *  - "feedback <1-5> [comment]" -> calls the retro_feedback tool to rate Retro-Bot
 *  - "feedback summary"        -> calls the retro_feedback_summary tool for the
 *                                 average rating and recent comments
 *  - anything else    -> echoes back with usage help
 *
 * Submitting the star-rating Adaptive Card posts a message activity with no
 * text and a `value` payload of `{ rating }`, which is routed to retro_feedback.
 */
const FEEDBACK_COMMAND_PATTERN = /^feedback\s+(\d+)(?:\s+(.+))?$/i;
const SENTIMENT_TREND_ROW_PATTERN = /^-\s*(.+?):\s*(\d)\/5/;
const USAGE_HELP =
  'Hi! Try "tools" to list retro-bot MCP tools, "create retro" to add a retro template to the configured Miro board, "cycle overview" for ' +
  'Jira issues and Miro notes from a dated retro, "retro summary" for the latest retro\'s outcomes and Jira actions, ' +
  '"github examples" to find GitHub code and commits matching this retro\'s problems and action items, ' +
  '"sentiment trend" to see how team sentiment has changed over recent retros, ' +
  '"feedback <1-5> [comment]" to rate Retro-Bot, or "feedback summary" to see the average rating.';

function buildFeedbackCard(): Attachment {
  return CardFactory.adaptiveCard({
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.3",
    body: [
      {
        type: "TextBlock",
        text: "How would you rate Retro-Bot's summary?",
        wrap: true,
      },
    ],
    actions: [1, 2, 3, 4, 5].map((rating) => ({
      type: "Action.Submit",
      title: "★".repeat(rating) + "☆".repeat(5 - rating),
      data: { rating },
    })),
  });
}

function parseSentimentTrendRows(text: string): { title: string; score: number }[] {
  return text
    .split("\n")
    .map((line) => line.match(SENTIMENT_TREND_ROW_PATTERN))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({ title: match[1].trim(), score: Number(match[2]) }));
}

function buildSentimentTrendCard(rows: { title: string; score: number }[]): Attachment {
  return CardFactory.adaptiveCard({
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.3",
    body: [
      { type: "TextBlock", text: "Sentiment trend", weight: "bolder", size: "medium" },
      ...rows.map((row) => ({
        type: "ColumnSet",
        columns: [
          { type: "Column", width: "stretch", items: [{ type: "TextBlock", text: row.title, wrap: true }] },
          {
            type: "Column",
            width: `${row.score}`,
            items: [{ type: "TextBlock", text: "█".repeat(row.score), color: "accent" }],
          },
          { type: "Column", width: `${5 - row.score || 1}`, items: [{ type: "TextBlock", text: `${row.score}/5` }] },
        ],
      })),
    ],
  });
}


export class TeamsRetroBot extends TeamsActivityHandler {
  constructor(private readonly mcpClient: McpClient = McpClient.create()) {
    super();

    this.onMessage(async (context: TurnContext, next) => {
      const feedbackCardValue = context.activity.value as { rating?: unknown } | undefined;

      try {
        if (feedbackCardValue && typeof feedbackCardValue.rating === "number") {
          const result = await this.mcpClient.callTool("retro_feedback", { rating: feedbackCardValue.rating });
          await context.sendActivity(`retro_feedback result:\n${result}`);
          await next();
          return;
        }

        const text = (context.activity.text ?? "").trim();
        const lowerText = text.toLowerCase();
        const feedbackMatch = text.match(FEEDBACK_COMMAND_PATTERN);

        if (lowerText === "tools") {
          const tools = await this.mcpClient.listTools();
          await context.sendActivity(
            tools.length > 0 ? `Available MCP tools:\n- ${tools.join("\n- ")}` : "No tools returned by the MCP server."
          );
        } else if (lowerText === "create retro") {
          const result = await this.mcpClient.callTool("miro_create_retro", {});
          await context.sendActivity(`miro_create_retro result:\n${result}`);
        } else if (lowerText === "cycle overview") {
          const result = await this.mcpClient.callTool("cycle_overview", {});
          await context.sendActivity(`cycle_overview result:\n${result}`);
        } else if (lowerText === "retro summary") {
          const result = await this.mcpClient.callTool("retro_summary", {});
          await context.sendActivity(`retro_summary result:\n${result}`);
          await context.sendActivity({ attachments: [buildFeedbackCard()] });
        } else if (lowerText === "github examples") {
          const result = await this.mcpClient.callTool("retro_github_examples", {});
          await context.sendActivity(`retro_github_examples result:\n${result}`);
        } else if (lowerText === "sentiment trend") {
          const result = await this.mcpClient.callTool("retro_sentiment_trend", {});
          await context.sendActivity(`retro_sentiment_trend result:\n${result}`);
          const rows = parseSentimentTrendRows(result);
          if (rows.length > 0) {
            await context.sendActivity({ attachments: [buildSentimentTrendCard(rows)] });
          }
        } else if (lowerText === "feedback summary") {
          const result = await this.mcpClient.callTool("retro_feedback_summary", {});
          await context.sendActivity(`retro_feedback_summary result:\n${result}`);
        } else if (feedbackMatch) {
          const rating = Number(feedbackMatch[1]);
          const comment = feedbackMatch[2];
          if (rating < 1 || rating > 5) {
            await context.sendActivity('Please give a star rating between 1 and 5, e.g. "feedback 5 loved it".');
          } else {
            const args = comment ? { rating, comment } : { rating };
            const result = await this.mcpClient.callTool("retro_feedback", args);
            await context.sendActivity(`retro_feedback result:\n${result}`);
          }
        } else {
          await context.sendActivity(USAGE_HELP);
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
