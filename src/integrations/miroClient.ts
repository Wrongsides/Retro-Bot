import { config } from "../config.js";
import { HttpClient, type ResponseMap } from "../infrastructure/httpClient.js";

export interface MiroStickyNote {
  id: string;
  content: string;
  author?: string;
  x: number;
  y: number;
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

function defaultStickyNotes(): MiroStickyNote[] {
  return [
    { id: "1", content: "Deploys felt smoother this sprint thanks to the new pipeline", x: 0, y: 0 },
    { id: "2", content: "We keep forgetting to close out retro actions from last time", x: 100, y: 0 },
    { id: "3", content: "Onboarding docs for the payments service are out of date", x: 0, y: 100 },
    { id: "4", content: "Pairing session on Thursday was really useful, let's do more", x: 100, y: 100 },
    { id: "5", content: "Incident review took too long because logs were hard to find", x: 0, y: 200 },
    { id: "6", content: "Great shoutout to Sam for helping unblock the release", x: 100, y: 200 },
    { id: "7", content: "Retro: 2026-08-15", x: 200, y: 0 },
  ];
}

function defaultNullResponses(options: MiroClientNullOptions): ResponseMap {
  if (options.failure) {
    const failed = { status: options.failure.status };
    return { "GET /items": failed, "POST /frames": failed, "POST /sticky_notes": failed };
  }

  const pages = options.stickyNotePages ?? [options.stickyNotes ?? defaultStickyNotes()];
  const frames = options.frames ?? [];
  let frameCounter = 1;
  let stickyCounter = 1;

  return {
    "GET /items?type=sticky_note": pages.map((page, index) => ({
      body: {
        data: page.map((note) => ({
          id: note.id,
          data: { content: `<p>${note.content}</p>` },
          position: { x: note.x, y: note.y },
          createdBy: note.author ? { id: note.author } : undefined,
        })),
        cursor: index < pages.length - 1 ? `page-${index + 2}` : undefined,
      } satisfies MiroItemsResponseBody,
    })),
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
    const id = boardId ?? this.defaultBoardId;
    const notes: MiroStickyNote[] = [];
    let cursor: string | undefined;

    do {
      const url = cursor
        ? `https://api.miro.com/v2/boards/${id}/items?type=sticky_note&cursor=${encodeURIComponent(cursor)}`
        : `https://api.miro.com/v2/boards/${id}/items?type=sticky_note`;
      const response = await this.http.request<MiroItemsResponseBody>({
        method: "GET",
        url,
        headers: { Authorization: authHeader(), Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Miro getBoardStickyNotes failed: ${response.status}`);
      }
      notes.push(
        ...response.data.data.map((item) => ({
          id: item.id,
          content: item.data.content.replace(/<[^>]*>/g, ""),
          author: item.createdBy?.id,
          x: item.position.x,
          y: item.position.y,
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
        throw new Error(`Miro getBoardFrames failed: ${response.status}`);
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
      throw new Error(`Miro createFrame failed: ${response.status}`);
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
      throw new Error(`Miro createStickyNote failed: ${response.status}`);
    }
    return {
      id: response.data.id,
      content: response.data.data.content,
      x: response.data.position.x,
      y: response.data.position.y,
    };
  }
}
