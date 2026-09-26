import { config } from "../config.js";
import { HttpClient, type ResponseMap } from "../infrastructure/httpClient.js";

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  url: string;
}

export interface CreateGitHubIssueInput {
  owner?: string;
  repo?: string;
  title: string;
  body?: string;
  labels?: string[];
}

export interface GitHubClientNullOptions {
  openIssues?: GitHubIssue[];
}

const NULL_OWNER = "example-org";
const NULL_REPO = "example-repo";

interface GitHubIssueResponseBody {
  number: number;
  title: string;
  state: string;
  html_url: string;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${config.github.token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function defaultOpenIssues(): GitHubIssue[] {
  return [
    {
      number: 42,
      title: "Add retry/backoff to broadband availability lookup",
      state: "open",
      url: `https://github.com/${NULL_OWNER}/${NULL_REPO}/issues/42`,
    },
  ];
}

function defaultNullResponses(options: GitHubClientNullOptions): ResponseMap {
  const issues = options.openIssues ?? defaultOpenIssues();
  let counter = 43;

  return {
    "GET /issues": {
      body: issues.map((issue) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        html_url: issue.url,
      })) satisfies GitHubIssueResponseBody[],
    },
    "POST /issues": (ctx) => {
      const url = new URL(ctx.url);
      const [, , owner, repo] = url.pathname.split("/");
      const number = counter++;
      const body = ctx.body as { title: string };
      return {
        status: 201,
        body: {
          number,
          title: body.title,
          state: "open",
          html_url: `https://github.com/${owner}/${repo}/issues/${number}`,
        } satisfies GitHubIssueResponseBody,
      };
    },
  };
}

export class GitHubClient {
  private constructor(
    private readonly http: HttpClient,
    private readonly defaultOwner: string,
    private readonly defaultRepo: string,
  ) {}

  static create(): GitHubClient {
    return new GitHubClient(HttpClient.create(), config.github.defaultOwner, config.github.defaultRepo);
  }

  static createNull(options: GitHubClientNullOptions = {}): GitHubClient {
    return new GitHubClient(HttpClient.createNull(defaultNullResponses(options)), NULL_OWNER, NULL_REPO);
  }

  trackRequests() {
    return this.http.trackRequests();
  }

  async listOpenIssues(owner?: string, repo?: string): Promise<GitHubIssue[]> {
    const o = owner ?? this.defaultOwner;
    const r = repo ?? this.defaultRepo;
    const url = `https://api.github.com/repos/${o}/${r}/issues?state=open`;
    const response = await this.http.request<GitHubIssueResponseBody[]>({
      method: "GET",
      url,
      headers: authHeaders(),
    });
    if (!response.ok) {
      throw new Error(`GitHub listOpenIssues failed: ${response.status}`);
    }
    return response.data.map((issue) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      url: issue.html_url,
    }));
  }

  async createIssue(input: CreateGitHubIssueInput): Promise<GitHubIssue> {
    const owner = input.owner ?? this.defaultOwner;
    const repo = input.repo ?? this.defaultRepo;
    const url = `https://api.github.com/repos/${owner}/${repo}/issues`;
    const response = await this.http.request<GitHubIssueResponseBody>({
      method: "POST",
      url,
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: { title: input.title, body: input.body, labels: input.labels },
    });
    if (!response.ok) {
      throw new Error(`GitHub createIssue failed: ${response.status}`);
    }
    return {
      number: response.data.number,
      title: response.data.title,
      state: response.data.state,
      url: response.data.html_url,
    };
  }
}
