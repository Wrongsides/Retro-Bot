import { config } from "../config.js";
import { HttpClient, type ResponseMap } from "./httpClient.js";
import { buildRetroTemplateLayout } from "../domain/retroTemplate.js";

export interface MiroStickyNote {
  id: string;
  content: string;
  author?: string;
  x: number;
  y: number;
  frameId?: string;
}

export interface MiroFrame {
  id: string;
  title: string;
}

export interface MiroFrameLayout {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CreateFrameInput {
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  boardId?: string;
}

export interface CreateStickyNoteInput {
  content: string;
  x: number;
  y: number;
  boardId?: string;
  frameId?: string;
}

export interface MiroClientNullOptions {
  stickyNotes?: MiroStickyNote[];
  stickyNotePages?: MiroStickyNote[][];
  textItems?: MiroStickyNote[];
  frames?: MiroFrameLayout[];
  failure?: { status: number };
}

const NULL_BOARD_ID = "demo-board";

interface MiroItemsResponseBody {
  data: Array<{
    id: string;
    data: { content: string };
    position: { x: number; y: number };
    createdBy?: { id: string };
    parent?: { id: string };
  }>;
  cursor?: string;
}

interface MiroFrameItemsResponseBody {
  data: Array<{
    id: string;
    data: { title: string };
    position: { x: number; y: number };
    geometry: { width: number; height: number };
  }>;
  cursor?: string;
}

interface MiroFrameResponseBody {
  id: string;
  data: { title: string };
}

interface MiroStickyNoteResponseBody {
  id: string;
  data: { content: string };
  position: { x: number; y: number };
}

function authHeader(): string {
  return `Bearer ${config.miro.accessToken}`;
}

function miroError(action: string, response: { status: number; data: unknown }): Error {
  return new Error(`Miro ${action} failed: ${response.status} ${JSON.stringify(response.data)}`);
}

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const codePoint = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
    }
    return NAMED_HTML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function plainTextContent(htmlContent: string): string {
  return decodeHtmlEntities(htmlContent.replace(/<[^>]*>/g, ""));
}

const NULL_RETRO_DATE = new Date("2026-08-15T00:00:00.000Z");
const NULL_LAYOUT = buildRetroTemplateLayout(NULL_RETRO_DATE);

function defaultFrames(): MiroFrameLayout[] {
  return [
    { id: "frame-outer", ...NULL_LAYOUT.frame },
    { id: "frame-mood", ...NULL_LAYOUT.moodBox },
    ...NULL_LAYOUT.columns.map((column, index) => ({ id: `frame-column-${index}`, ...column })),
  ];
}

function defaultStickyNotes(): MiroStickyNote[] {
  return [
    { id: "1", content: "Deploys felt smoother this sprint thanks to the new pipeline", x: 0, y: 0, frameId: "frame-column-0" },
    {
      id: "2",
      content: "GitHub search only matches literal retro phrasing, missing relevant issues",
      x: 100,
      y: 0,
      frameId: "frame-column-1",
    },
    { id: "3", content: "Onboarding docs for the payments service are out of date", x: 0, y: 100, frameId: "frame-column-2" },
    { id: "4", content: "Pairing session on Thursday was really useful, let's do more", x: 100, y: 100, frameId: "frame-column-2" },
    { id: "5", content: "Fix the flaky pipeline", x: 0, y: 200, frameId: "frame-column-3" },
    { id: "6", content: "Great shoutout to Sam for helping unblock the release", x: 100, y: 200, frameId: "frame-mood" },
    { id: "7", content: "Retro: 2026-08-15", x: 200, y: 0 },
  ];
}

function defaultNullResponses(options: MiroClientNullOptions): ResponseMap {
  if (options.failure) {
    const failed = { status: options.failure.status };
    return {
      "GET /items?type=sticky_note": failed,
      "GET /items?type=text": failed,
      "GET /items?type=frame": failed,
      "POST /frames": failed,
      "POST /sticky_notes": failed,
    };
  }

  const pages = options.stickyNotePages ?? [options.stickyNotes ?? defaultStickyNotes()];
  const textItems = options.textItems ?? [];
  const frames = options.frames ?? defaultFrames();
  let frameCounter = 1;
  let stickyCounter = 1;

  const toItemsBody = (items: MiroStickyNote[]): MiroItemsResponseBody => ({
    data: items.map((note) => ({
      id: note.id,
      data: { content: `<p>${note.content}</p>` },
      position: { x: note.x, y: note.y },
      createdBy: note.author ? { id: note.author } : undefined,
      parent: note.frameId ? { id: note.frameId } : undefined,
    })),
  });

  return {
    "GET /items?type=sticky_note": pages.map((page, index) => ({
      body: {
        ...toItemsBody(page),
        cursor: index < pages.length - 1 ? `page-${index + 2}` : undefined,
      } satisfies MiroItemsResponseBody,
    })),
    "GET /items?type=text": {
      body: toItemsBody(textItems) satisfies MiroItemsResponseBody,
    },
    "GET /items?type=frame": {
      body: {
        data: frames.map((frame) => ({
          id: frame.id,
          data: { title: frame.title },
          position: { x: frame.x, y: frame.y },
          geometry: { width: frame.width, height: frame.height },
        })),
      } satisfies MiroFrameItemsResponseBody,
    },
    "POST /frames": (ctx) => {
      const body = ctx.body as { data: { title: string } };
      return {
        status: 201,
        body: { id: `frame-${frameCounter++}`, data: { title: body.data.title } } satisfies MiroFrameResponseBody,
      };
    },
    "POST /sticky_notes": (ctx) => {
      const body = ctx.body as { data: { content: string }; position: { x: number; y: number } };
      return {
        status: 201,
        body: {
          id: `sticky-${stickyCounter++}`,
          data: { content: body.data.content },
          position: body.position,
        } satisfies MiroStickyNoteResponseBody,
      };
    },
  };
}

export class MiroClient {
  private constructor(private readonly http: HttpClient, private readonly defaultBoardId: string) {}

  static create(): MiroClient {
    return new MiroClient(HttpClient.create(), config.miro.defaultBoardId);
  }

  static createNull(options: MiroClientNullOptions = {}): MiroClient {
    return new MiroClient(HttpClient.createNull(defaultNullResponses(options)), NULL_BOARD_ID);
  }

  trackRequests() {
    return this.http.trackRequests();
  }

  async getBoardStickyNotes(boardId?: string): Promise<MiroStickyNote[]> {
    const stickyNotes = await this.fetchBoardItems(boardId, "sticky_note");
    const textNotes = await this.fetchBoardItems(boardId, "text");
    return [...stickyNotes, ...textNotes];
  }

  private async fetchBoardItems(boardId: string | undefined, type: "sticky_note" | "text"): Promise<MiroStickyNote[]> {
    const id = boardId ?? this.defaultBoardId;
    const notes: MiroStickyNote[] = [];
    let cursor: string | undefined;

    do {
      const url = cursor
        ? `https://api.miro.com/v2/boards/${id}/items?type=${type}&cursor=${encodeURIComponent(cursor)}`
        : `https://api.miro.com/v2/boards/${id}/items?type=${type}`;
      const response = await this.http.request<MiroItemsResponseBody>({
        method: "GET",
        url,
        headers: { Authorization: authHeader(), Accept: "application/json" },
      });
      if (!response.ok) {
        throw miroError("getBoardStickyNotes", response);
      }
      notes.push(
        ...response.data.data.map((item) => ({
          id: item.id,
          content: plainTextContent(item.data.content),
          author: item.createdBy?.id,
          x: item.position.x,
          y: item.position.y,
          frameId: item.parent?.id,
        })),
      );
      cursor = response.data.cursor;
    } while (cursor);

    return notes;
  }

  async getBoardFrames(boardId?: string): Promise<MiroFrameLayout[]> {
    const id = boardId ?? this.defaultBoardId;
    const frames: MiroFrameLayout[] = [];
    let cursor: string | undefined;

    do {
      const url = cursor
        ? `https://api.miro.com/v2/boards/${id}/items?type=frame&cursor=${encodeURIComponent(cursor)}`
        : `https://api.miro.com/v2/boards/${id}/items?type=frame`;
      const response = await this.http.request<MiroFrameItemsResponseBody>({
        method: "GET",
        url,
        headers: { Authorization: authHeader(), Accept: "application/json" },
      });
      if (!response.ok) {
        throw miroError("getBoardFrames", response);
      }
      frames.push(
        ...response.data.data.map((item) => ({
          id: item.id,
          title: item.data.title,
          x: item.position.x,
          y: item.position.y,
          width: item.geometry.width,
          height: item.geometry.height,
        })),
      );
      cursor = response.data.cursor;
    } while (cursor);

    return frames;
  }

  async createFrame(input: CreateFrameInput): Promise<MiroFrame> {
    const id = input.boardId ?? this.defaultBoardId;
    const url = `https://api.miro.com/v2/boards/${id}/frames`;
    const response = await this.http.request<MiroFrameResponseBody>({
      method: "POST",
      url,
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: {
        data: { title: input.title },
        position: { x: input.x, y: input.y },
        geometry: { width: input.width, height: input.height },
      },
    });
    if (!response.ok) {
      throw miroError("createFrame", response);
    }
    return { id: response.data.id, title: response.data.data.title };
  }

  async createStickyNote(input: CreateStickyNoteInput): Promise<MiroStickyNote> {
    const id = input.boardId ?? this.defaultBoardId;
    const url = `https://api.miro.com/v2/boards/${id}/sticky_notes`;
    const response = await this.http.request<MiroStickyNoteResponseBody>({
      method: "POST",
      url,
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: {
        data: { content: input.content },
        position: { x: input.x, y: input.y },
        ...(input.frameId ? { parent: { id: input.frameId } } : {}),
      },
    });
    if (!response.ok) {
      throw miroError("createStickyNote", response);
    }
    return {
      id: response.data.id,
      content: plainTextContent(response.data.data.content),
      x: response.data.position.x,
      y: response.data.position.y,
    };
  }
}
