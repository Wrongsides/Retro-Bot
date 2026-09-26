import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "../config.js";
import { MiroClient } from "../integrations/miroClient.js";
import { logger } from "../utils/logger.js";

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

const defaultClient = config.useNullClients ? MiroClient.createNull() : MiroClient.create();

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
}
