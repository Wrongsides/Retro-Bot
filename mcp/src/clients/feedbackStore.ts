import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";

export interface FeedbackEntry {
  rating: number;
  comment?: string;
  recordedAt: string;
}

export interface FeedbackStoreNullOptions {
  entries?: FeedbackEntry[];
}

interface FeedbackTracker {
  writes: FeedbackEntry[];
}

async function readEntries(filePath: string): Promise<FeedbackEntry[]> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as FeedbackEntry[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

async function writeEntries(filePath: string, entries: FeedbackEntry[]): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(entries, null, 2), "utf-8");
}

export class FeedbackStore {
  private readonly tracker: FeedbackTracker = { writes: [] };

  private constructor(
    private readonly readAll: () => Promise<FeedbackEntry[]>,
    private readonly writeAll: (entries: FeedbackEntry[]) => Promise<void>,
  ) {}

  static create(filePath: string = config.feedback.filePath): FeedbackStore {
    return new FeedbackStore(
      () => readEntries(filePath),
      (entries) => writeEntries(filePath, entries),
    );
  }

  static createNull(options: FeedbackStoreNullOptions = {}): FeedbackStore {
    let entries = options.entries ?? [];
    return new FeedbackStore(
      async () => entries,
      async (updated) => {
        entries = updated;
      },
    );
  }

  async record(rating: number, comment?: string, recordedAt: Date = new Date()): Promise<FeedbackEntry> {
    const entry: FeedbackEntry = { rating, comment, recordedAt: recordedAt.toISOString() };
    const entries = await this.readAll();
    await this.writeAll([...entries, entry]);
    this.tracker.writes.push(entry);
    return entry;
  }

  async list(): Promise<FeedbackEntry[]> {
    return this.readAll();
  }

  trackWrites(): FeedbackEntry[] {
    const writes = this.tracker.writes;
    this.tracker.writes = [];
    return writes;
  }
}
