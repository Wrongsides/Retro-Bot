import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  buildRetroTemplateLayout,
  CYCLE_OVERVIEW_FRAME_TITLE,
  RETRO_FRAME_TITLE_PATTERN,
} from "../domain/retroTemplate.js";
import { miroClient as defaultClient } from "../clients/index.js";
import { MiroClient, type MiroFrame, type MiroStickyNote } from "../clients/miroClient.js";
import { logger } from "../utils/logger.js";

const AUTO_OFFSET_GAP = 200;

export interface CreateRetroTemplateOptions {
  boardId?: string;
  date?: Date;
  x?: number;
  y?: number;
}

export interface PositionedFrame extends MiroFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RetroTemplate {
  frame: PositionedFrame;
  columns: PositionedFrame[];
  columnStickyStacks: MiroStickyNote[][];
  moodBox: PositionedFrame;
  moodBoxSticky: MiroStickyNote;
  dotVoteBox: PositionedFrame;
  dotVoteBoxSticky: MiroStickyNote;
  marker: MiroStickyNote;
}

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

async function resolveOrigin(
  client: MiroClient,
  options: CreateRetroTemplateOptions,
): Promise<{ x: number; y: number }> {
  if (options.x !== undefined && options.y !== undefined) {
    return { x: options.x, y: options.y };
  }

  const frames = await client.getBoardFrames(options.boardId);
  const retroFrames = frames.filter(
    (frame) => RETRO_FRAME_TITLE_PATTERN.test(frame.title) || frame.title === CYCLE_OVERVIEW_FRAME_TITLE,
  );
  if (retroFrames.length === 0) {
    return { x: options.x ?? 0, y: options.y ?? 0 };
  }

  const lowestBottom = Math.max(...retroFrames.map((frame) => frame.y + frame.height / 2));
  return { x: options.x ?? 0, y: options.y ?? lowestBottom + AUTO_OFFSET_GAP };
}

export async function createRetroTemplate(
  client: MiroClient,
  options: CreateRetroTemplateOptions = {},
): Promise<RetroTemplate> {
  const origin = await resolveOrigin(client, options);
  const layout = buildRetroTemplateLayout(options.date ?? new Date(), origin);

  const createdFrame = await client.createFrame({ ...layout.frame, boardId: options.boardId });
  const frame: PositionedFrame = { ...createdFrame, x: layout.frame.x, y: layout.frame.y, width: layout.frame.width, height: layout.frame.height };
  const columns: PositionedFrame[] = [];
  for (const column of layout.columns) {
    const createdColumn = await client.createFrame({ ...column, boardId: options.boardId });
    columns.push({ ...createdColumn, x: column.x, y: column.y, width: column.width, height: column.height });
  }

  const columnStickyStacks: MiroStickyNote[][] = [];
  for (let index = 0; index < columns.length; index += 1) {
    const stack: MiroStickyNote[] = [];
    for (const sticky of layout.columnStickyStacks[index]) {
      const created = await client.createStickyNote({
        content: sticky.content,
        x: sticky.x,
        y: sticky.y,
        boardId: options.boardId,
        frameId: columns[index].id,
      });
      stack.push(created);
    }
    columnStickyStacks.push(stack);
  }

  const createdMoodBox = await client.createFrame({ ...layout.moodBox, boardId: options.boardId });
  const moodBox: PositionedFrame = {
    ...createdMoodBox,
    x: layout.moodBox.x,
    y: layout.moodBox.y,
    width: layout.moodBox.width,
    height: layout.moodBox.height,
  };
  const moodBoxSticky = await client.createStickyNote({
    content: layout.moodBoxSticky.content,
    x: layout.moodBoxSticky.x,
    y: layout.moodBoxSticky.y,
    boardId: options.boardId,
    frameId: moodBox.id,
  });

  const createdDotVoteBox = await client.createFrame({ ...layout.dotVoteBox, boardId: options.boardId });
  const dotVoteBox: PositionedFrame = {
    ...createdDotVoteBox,
    x: layout.dotVoteBox.x,
    y: layout.dotVoteBox.y,
    width: layout.dotVoteBox.width,
    height: layout.dotVoteBox.height,
  };
  const dotVoteBoxSticky = await client.createStickyNote({
    content: layout.dotVoteBoxSticky.content,
    x: layout.dotVoteBoxSticky.x,
    y: layout.dotVoteBoxSticky.y,
    boardId: options.boardId,
    frameId: dotVoteBox.id,
  });

  const marker = await client.createStickyNote({
    content: layout.marker.content,
    x: layout.marker.x,
    y: layout.marker.y,
    boardId: options.boardId,
    frameId: frame.id,
  });

  return { frame, columns, columnStickyStacks, moodBox, moodBoxSticky, dotVoteBox, dotVoteBoxSticky, marker };
}

function formatTemplate(template: RetroTemplate): string {
  const lines = [`Created retro frame ${template.frame.id}: ${template.frame.title}`, "", "Columns:"];
  lines.push(...template.columns.map((column) => `- ${column.id}: ${column.title}`));
  lines.push("", `Mood box: ${template.moodBox.id}`, `Dot votes box: ${template.dotVoteBox.id}`);
  lines.push("", `Date marker: ${template.marker.id} — ${template.marker.content}`);
  return lines.join("\n");
}

export function registerRetroTemplateTools(server: McpServer, client: MiroClient = defaultClient) {
  server.registerTool(
    "miro_create_retro",
    {
      title: "Create an empty retro template",
      description:
        "Set up a new empty retrospective on a Miro board: an outer frame titled with the given or current " +
        "date, four column frames (What went well?, What should we do differently?, What should we start " +
        "doing?, Action items) each pre-seeded with a stack of starter sticky notes, a Mood box and a Dot " +
        "Votes box each with an instructional sticky note, and a dated marker sticky note so future retros " +
        "can find where the previous one ended.",
      inputSchema: {
        boardId: z.string().optional().describe("Miro board ID, defaults to configured board"),
        date: z.string().optional().describe("Retro date as YYYY-MM-DD, defaults to today"),
        x: z.number().optional().describe("X position of the new template's top-left corner, defaults to 0"),
        y: z.number().optional().describe("Y position of the new template's top-left corner, defaults to 0"),
      },
    },
    async ({ boardId, date, x, y }) => {
      try {
        const template = await createRetroTemplate(client, {
          boardId,
          date: date ? new Date(date) : undefined,
          x,
          y,
        });
        return { content: [{ type: "text" as const, text: formatTemplate(template) }] };
      } catch (err) {
        logger.error("miro_create_retro failed", { error: String(err) });
        return toolError(err instanceof Error ? err.message : String(err));
      }
    },
  );
}
