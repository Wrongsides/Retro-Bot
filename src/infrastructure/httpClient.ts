export interface HttpRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface HttpResponse<T = unknown> {
  status: number;
  ok: boolean;
  data: T;
}

export interface StubContext {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface StubbedResponse {
  status?: number;
  body?: unknown;
}

export type ResponseFactory = (ctx: StubContext) => StubbedResponse;

export type ResponseConfig = StubbedResponse | StubbedResponse[] | ResponseFactory;

export type ResponseMap = Record<string, ResponseConfig>;

export interface RequestRecord {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

interface RequestTracker {
  requests: RequestRecord[];
}

function findResponseKey(responses: ResponseMap, method: string, url: string): string | undefined {
  return Object.keys(responses).find((key) => {
    const [keyMethod, ...pathParts] = key.split(" ");
    const keyPath = pathParts.join(" ");
    return keyMethod === method && url.includes(keyPath);
  });
}

function resolveStub(
  config: ResponseConfig,
  ctx: StubContext,
  cursors: Map<string, number>,
  key: string,
): StubbedResponse {
  if (typeof config === "function") {
    return config(ctx);
  }
  if (Array.isArray(config)) {
    const cursor = cursors.get(key) ?? 0;
    const entry = config[Math.min(cursor, config.length - 1)];
    cursors.set(key, cursor + 1);
    return entry;
  }
  return config;
}

function createEmbeddedStub(responses: ResponseMap) {
  const cursors = new Map<string, number>();

  return async function stubbedRequest<T>(req: HttpRequest): Promise<HttpResponse<T>> {
    const key = findResponseKey(responses, req.method, req.url);
    if (key === undefined) {
      throw new Error(`No stubbed response configured for ${req.method} ${req.url}`);
    }
    const stub = resolveStub(responses[key], req, cursors, key);
    const status = stub.status ?? 200;
    return { status, ok: status >= 200 && status < 300, data: stub.body as T };
  };
}

async function performRequest<T>(req: HttpRequest): Promise<HttpResponse<T>> {
  const res = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body === undefined ? undefined : JSON.stringify(req.body),
  });
  const data = (await res.json().catch(() => undefined)) as T;
  return { status: res.status, ok: res.ok, data };
}

export class HttpClient {
  private readonly send: <T>(req: HttpRequest) => Promise<HttpResponse<T>>;
  private readonly tracker: RequestTracker = { requests: [] };

  private constructor(send: <T>(req: HttpRequest) => Promise<HttpResponse<T>>) {
    this.send = send;
  }

  static create(): HttpClient {
    return new HttpClient(performRequest);
  }

  static createNull(responses: ResponseMap = {}): HttpClient {
    return new HttpClient(createEmbeddedStub(responses));
  }

  async request<T>(req: HttpRequest): Promise<HttpResponse<T>> {
    this.tracker.requests.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
    });
    return this.send<T>(req);
  }

  trackRequests(): RequestRecord[] {
    const requests = this.tracker.requests;
    this.tracker.requests = [];
    return requests;
  }
}
