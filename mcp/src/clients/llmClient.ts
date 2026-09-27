import { config } from "../config.js";
import { HttpClient, type ResponseMap } from "./httpClient.js";

export interface LlmClientNullOptions {
  completion?: string;
  failure?: { status: number };
  emptyResponse?: boolean;
}

interface ChatCompletionResponseBody {
  choices: Array<{ message?: { content?: string } }>;
}

const NULL_BASE_URL = "https://models.example.com/inference";

function defaultNullResponses(options: LlmClientNullOptions): ResponseMap {
  if (options.failure) {
    return { "POST /chat/completions": { status: options.failure.status } };
  }
  if (options.emptyResponse) {
    return { "POST /chat/completions": { body: { choices: [] } satisfies ChatCompletionResponseBody } };
  }
  const completion = options.completion ?? "This retro reflected steady progress across the team.";
  return {
    "POST /chat/completions": {
      body: { choices: [{ message: { content: completion } }] } satisfies ChatCompletionResponseBody,
    },
  };
}

export class LlmClient {
  private constructor(private readonly http: HttpClient, private readonly baseUrl: string) {}

  static create(): LlmClient {
    return new LlmClient(HttpClient.create(), config.llm.baseUrl);
  }

  static createNull(options: LlmClientNullOptions = {}): LlmClient {
    return new LlmClient(HttpClient.createNull(defaultNullResponses(options)), NULL_BASE_URL);
  }

  trackRequests() {
    return this.http.trackRequests();
  }

  async complete(prompt: string): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;
    const response = await this.http.request<ChatCompletionResponseBody>({
      method: "POST",
      url,
      headers: {
        Authorization: `Bearer ${config.llm.token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: { model: config.llm.model, messages: [{ role: "user", content: prompt }] },
    });
    if (!response.ok) {
      throw new Error(`LLM completion failed: ${response.status}`);
    }
    const content = response.data.choices[0]?.message?.content;
    if (!content) {
      throw new Error("LLM completion response had no content");
    }
    return content;
  }
}
