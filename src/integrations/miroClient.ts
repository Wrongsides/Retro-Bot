import { config } from "../config.js";
import { HttpClient, type ResponseMap } from "../infrastructure/httpClient.js";

export interface MiroStickyNote {
  id: string;
  content: string;
  author?: string;
  x: number;
  y: number;
}

export interface MiroClientNullOptions {
  stickyNotes?: MiroStickyNote[];
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
    return { "GET /items": { status: options.failure.status } };
  }

  const notes = options.stickyNotes ?? defaultStickyNotes();

  return {
    "GET /items": {
      body: {
        data: notes.map((note) => ({
          id: note.id,
          data: { content: `<p>${note.content}</p>` },
          position: { x: note.x, y: note.y },
          createdBy: note.author ? { id: note.author } : undefined,
        })),
      } satisfies MiroItemsResponseBody,
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
    const url = `https://api.miro.com/v2/boards/${id}/items?type=sticky_note`;
    const response = await this.http.request<MiroItemsResponseBody>({
      method: "GET",
      url,
      headers: { Authorization: authHeader(), Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Miro getBoardStickyNotes failed: ${response.status}`);
    }
    return response.data.data.map((item) => ({
      id: item.id,
      content: item.data.content.replace(/<[^>]*>/g, ""),
      author: item.createdBy?.id,
      x: item.position.x,
      y: item.position.y,
    }));
  }
}
