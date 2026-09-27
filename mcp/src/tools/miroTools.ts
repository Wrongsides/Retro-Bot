import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { miroClient as defaultClient } from "../clients/index.js";
import { MiroClient } from "../clients/miroClient.js";
import { logger } from "../utils/logger.js";

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

export function registerMiroTools(server: McpServer, client: MiroClient = defaultClient) {
  server.registerTool(
    "miro_get_retro_notes",
    {
      title: "Get retrospective sticky notes",
      description:
        "Read the raw sticky-note contents from a Miro retrospective board. Returns unprocessed notes " +
        "only - use this as input to summarisation, it does not interpret or cluster the notes itself.",
      inputSchema: {
        boardId: z.string().optional().describe("Miro board ID, defaults to configured board"),
      },
    },
    async ({ boardId }) => {
      try {
        const notes = await client.getBoardStickyNotes(boardId);
        return {
          content: [
            {
              type: "text" as const,
              text: notes.length
                ? notes.map((n) => `- ${n.content}`).join("\n")
                : "No sticky notes found on this board.",
            },
          ],
        };
      } catch (err) {
        logger.error("miro_get_retro_notes failed", { error: String(err) });
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "miro_create_frame",
    {
      title: "Create a Miro frame",
      description:
        "Create a frame on a Miro board, useful for grouping the sticky notes of a single retrospective " +
        "session. Returns the created frame's id, which can be passed to miro_create_sticky_note.",
      inputSchema: {
        title: z.string().describe("Frame title, shown above the frame on the board"),
        x: z.number().describe("X position of the frame's top-left corner"),
        y: z.number().describe("Y position of the frame's top-left corner"),
        width: z.number().describe("Frame width in pixels"),
        height: z.number().describe("Frame height in pixels"),
        boardId: z.string().optional().describe("Miro board ID, defaults to configured board"),
      },
    },
    async ({ title, x, y, width, height, boardId }) => {
      try {
        const frame = await client.createFrame({ title, x, y, width, height, boardId });
        return { content: [{ type: "text" as const, text: `Created frame ${frame.id}: ${frame.title}` }] };
      } catch (err) {
        logger.error("miro_create_frame failed", { error: String(err) });
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "miro_create_sticky_note",
    {
      title: "Create a Miro sticky note",
      description:
        "Create a sticky note on a Miro board, optionally nested inside a frame created with " +
        "miro_create_frame. Useful for seeding retrospective boards with feedback notes.",
      inputSchema: {
        content: z.string().describe("Text content of the sticky note"),
        x: z.number().describe("X position of the sticky note"),
        y: z.number().describe("Y position of the sticky note"),
        boardId: z.string().optional().describe("Miro board ID, defaults to configured board"),
        frameId: z.string().optional().describe("Frame id to nest this sticky note inside"),
      },
    },
    async ({ content, x, y, boardId, frameId }) => {
      try {
        const note = await client.createStickyNote({ content, x, y, boardId, frameId });
        return { content: [{ type: "text" as const, text: `Created sticky note ${note.id}: ${note.content}` }] };
      } catch (err) {
        logger.error("miro_create_sticky_note failed", { error: String(err) });
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
