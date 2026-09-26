import { config } from "../config.js";
import { HttpClient, type ResponseMap } from "../infrastructure/httpClient.js";

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  url: string;
}

export interface CreateJiraIssueInput {
  projectKey?: string;
  summary: string;
  description?: string;
  issueType?: string;
  labels?: string[];
}

export interface JiraClientNullOptions {
  searchIssues?: JiraIssue[];
}

const NULL_BASE_URL = "https://example.atlassian.net";

interface JiraSearchResponseBody {
  issues: Array<{ key: string; fields: { summary: string; status: { name: string } }; url?: string }>;
}

interface JiraCreateResponseBody {
  key: string;
  url?: string;
}

function authHeader(): string {
  const token = Buffer.from(`${config.jira.email}:${config.jira.apiToken}`).toString("base64");
  return `Basic ${token}`;
}

function defaultSearchIssues(): JiraIssue[] {
  return [
    {
      key: "RETRO-101",
      summary: "Investigate flaky checkout integration tests",
      status: "In Progress",
      url: `${NULL_BASE_URL}/browse/RETRO-101`,
    },
    {
      key: "RETRO-98",
      summary: "Document on-call handover checklist",
      status: "Done",
      url: `${NULL_BASE_URL}/browse/RETRO-98`,
    },
  ];
}

function defaultNullResponses(options: JiraClientNullOptions): ResponseMap {
  const issues = options.searchIssues ?? defaultSearchIssues();
  let counter = 102;

  return {
    "POST /rest/api/3/search/jql": {
      body: {
        issues: issues.map((issue) => ({
          key: issue.key,
          fields: { summary: issue.summary, status: { name: issue.status } },
          url: issue.url,
        })),
      } satisfies JiraSearchResponseBody,
    },
    "POST /rest/api/3/issue": (ctx) => {
      const body = ctx.body as { fields: { project: { key: string } } };
      const key = `${body.fields.project.key}-${counter++}`;
      return { status: 201, body: { key, url: `${NULL_BASE_URL}/browse/${key}` } satisfies JiraCreateResponseBody };
    },
  };
}

export class JiraClient {
  private constructor(private readonly http: HttpClient, private readonly baseUrl: string) {}

  static create(): JiraClient {
    return new JiraClient(HttpClient.create(), config.jira.baseUrl);
  }

  static createNull(options: JiraClientNullOptions = {}): JiraClient {
    return new JiraClient(HttpClient.createNull(defaultNullResponses(options)), NULL_BASE_URL);
  }

  trackRequests() {
    return this.http.trackRequests();
  }

  async searchIssues(jql: string): Promise<JiraIssue[]> {
    const url = `${this.baseUrl}/rest/api/3/search/jql`;
    const response = await this.http.request<JiraSearchResponseBody>({
      method: "POST",
      url,
      headers: { Authorization: authHeader(), Accept: "application/json", "Content-Type": "application/json" },
      body: { jql },
    });
    if (!response.ok) {
      throw new Error(`Jira search failed: ${response.status}`);
    }
    return response.data.issues.map((issue) => ({
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      url: issue.url ?? `${this.baseUrl}/browse/${issue.key}`,
    }));
  }

  async createIssue(input: CreateJiraIssueInput): Promise<JiraIssue> {
    const projectKey = input.projectKey ?? config.jira.defaultProjectKey;
    const url = `${this.baseUrl}/rest/api/3/issue`;
    const response = await this.http.request<JiraCreateResponseBody>({
      method: "POST",
      url,
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: {
        fields: {
          project: { key: projectKey },
          summary: input.summary,
          description: input.description
            ? {
                type: "doc",
                version: 1,
                content: [{ type: "paragraph", content: [{ type: "text", text: input.description }] }],
              }
            : undefined,
          issuetype: { name: input.issueType ?? "Task" },
          labels: input.labels,
        },
      },
    });
    if (!response.ok) {
      throw new Error(`Jira create issue failed: ${response.status}`);
    }
    return {
      key: response.data.key,
      summary: input.summary,
      status: "To Do",
      url: response.data.url ?? `${this.baseUrl}/browse/${response.data.key}`,
    };
  }
}
