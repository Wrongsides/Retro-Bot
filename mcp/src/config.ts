import "dotenv/config";

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  useNullClients: bool(process.env.USE_NULL_CLIENTS, true),
  jira: {
    baseUrl: process.env.JIRA_BASE_URL ?? "https://example.atlassian.net",
    email: process.env.JIRA_EMAIL ?? "",
    apiToken: process.env.JIRA_API_TOKEN ?? "",
    defaultProjectKey: process.env.JIRA_DEFAULT_PROJECT_KEY ?? "RETRO",
  },
  miro: {
    accessToken: process.env.MIRO_ACCESS_TOKEN ?? "",
    defaultBoardId: process.env.MIRO_DEFAULT_BOARD_ID ?? "",
  },
  github: {
    token: process.env.GITHUB_TOKEN ?? "",
    defaultOwner: process.env.GITHUB_DEFAULT_OWNER ?? "",
    defaultRepo: process.env.GITHUB_DEFAULT_REPO ?? "",
  },
  llm: {
    baseUrl: process.env.LLM_BASE_URL ?? "http://localhost:11434/v1",
    token: process.env.GITHUB_MODELS_TOKEN ?? process.env.GITHUB_TOKEN ?? "ollama",
    model: process.env.LLM_MODEL ?? "llama3.1",
  },
  feedback: {
    filePath: process.env.FEEDBACK_STORE_PATH ?? "data/feedback.json",
  },
} as const;
