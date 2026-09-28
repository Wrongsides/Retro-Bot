import { config } from "../config.js";
import { HttpClient, type ResponseMap } from "./httpClient.js";

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

export interface GitHubSearchResult {
  number: number;
  title: string;
  state: string;
  url: string;
  repository: string;
}

export interface GitHubCodeSearchResult {
  path: string;
  url: string;
  repository: string;
}

export interface GitHubCommitSearchResult {
  sha: string;
  message: string;
  url: string;
  repository: string;
}

export interface GitHubClientNullOptions {
  openIssues?: GitHubIssue[];
  searchResults?: GitHubSearchResult[];
  codeSearchResults?: GitHubCodeSearchResult[];
  codeSearchFailureStatus?: number;
  codeSearchIncomplete?: boolean;
  commitSearchResults?: GitHubCommitSearchResult[];
  commitSearchFailureStatus?: number;
  commitSearchIncomplete?: boolean;
}

const NULL_OWNER = "example-org";
const NULL_REPO = "example-repo";

interface GitHubIssueResponseBody {
  number: number;
  title: string;
  state: string;
  html_url: string;
}

interface GitHubSearchResponseBody {
  items: Array<{
    number: number;
    title: string;
    state: string;
    html_url: string;
    repository_url: string;
  }>;
}

interface GitHubCodeSearchResponseBody {
  incomplete_results: boolean;
  items: Array<{
    path: string;
    html_url: string;
    repository: { full_name: string };
  }>;
}

interface GitHubCommitSearchResponseBody {
  incomplete_results: boolean;
  items: Array<{
    sha: string;
    html_url: string;
    commit: { message: string };
    repository: { full_name: string };
  }>;
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

function defaultSearchResults(): GitHubSearchResult[] {
  return [
    {
      number: 17,
      title: "Flaky pipeline fails intermittently on the checkout suite",
      state: "open",
      url: `https://github.com/${NULL_OWNER}/${NULL_REPO}/issues/17`,
      repository: `${NULL_OWNER}/${NULL_REPO}`,
    },
  ];
}

function defaultCodeSearchResults(): GitHubCodeSearchResult[] {
  return [
    {
      path: "src/clients/githubClient.ts",
      url: `https://github.com/${NULL_OWNER}/${NULL_REPO}/blob/main/src/clients/githubClient.ts`,
      repository: `${NULL_OWNER}/${NULL_REPO}`,
    },
  ];
}

function defaultCommitSearchResults(): GitHubCommitSearchResult[] {
  return [
    {
      sha: "abc1234",
      message: "Add retry/backoff to broadband availability lookup",
      url: `https://github.com/${NULL_OWNER}/${NULL_REPO}/commit/abc1234`,
      repository: `${NULL_OWNER}/${NULL_REPO}`,
    },
  ];
}

function defaultNullResponses(options: GitHubClientNullOptions): ResponseMap {
  const issues = options.openIssues ?? defaultOpenIssues();
  const searchResults = options.searchResults ?? defaultSearchResults();
  const codeSearchResults = options.codeSearchResults ?? defaultCodeSearchResults();
  const commitSearchResults = options.commitSearchResults ?? defaultCommitSearchResults();
  let counter = 43;

  return {
    "GET /search/issues": {
      body: {
        items: searchResults.map((result) => ({
          number: result.number,
          title: result.title,
          state: result.state,
          html_url: result.url,
          repository_url: `https://api.github.com/repos/${result.repository}`,
        })),
      } satisfies GitHubSearchResponseBody,
    },
    "GET /search/code": options.codeSearchFailureStatus
      ? { status: options.codeSearchFailureStatus }
      : {
          body: {
            incomplete_results: options.codeSearchIncomplete ?? false,
            items: codeSearchResults.map((result) => ({
              path: result.path,
              html_url: result.url,
              repository: { full_name: result.repository },
            })),
          } satisfies GitHubCodeSearchResponseBody,
        },
    "GET /search/commits": options.commitSearchFailureStatus
      ? { status: options.commitSearchFailureStatus }
      : {
          body: {
            incomplete_results: options.commitSearchIncomplete ?? false,
            items: commitSearchResults.map((result) => ({
              sha: result.sha,
              html_url: result.url,
              commit: { message: result.message },
              repository: { full_name: result.repository },
            })),
          } satisfies GitHubCommitSearchResponseBody,
        },
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

export class GitHubSearchIncompleteError extends Error {
  constructor(kind: "code" | "commit", query: string) {
    super(`GitHub ${kind} search results are incomplete for query "${query}" (the repository's index may still be building)`);
    this.name = "GitHubSearchIncompleteError";
  }
}

function repositoryFromApiUrl(repositoryUrl: string): string {
  const match = /\/repos\/(.+)$/.exec(repositoryUrl);
  return match ? match[1] : repositoryUrl;
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

  async searchIssues(query: string, owner?: string, repo?: string): Promise<GitHubSearchResult[]> {
    const o = owner ?? this.defaultOwner;
    const scope = repo ? `repo:${o}/${repo}` : `org:${o}`;
    const q = `${query} ${scope}`;
    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}`;
    const response = await this.http.request<GitHubSearchResponseBody>({
      method: "GET",
      url,
      headers: authHeaders(),
    });
    if (!response.ok) {
      throw new Error(`GitHub searchIssues failed: ${response.status}`);
    }
    return response.data.items.map((item) => ({
      number: item.number,
      title: item.title,
      state: item.state,
      url: item.html_url,
      repository: repositoryFromApiUrl(item.repository_url),
    }));
  }

  async searchCode(query: string, owner?: string, repo?: string): Promise<GitHubCodeSearchResult[]> {
    const o = owner ?? this.defaultOwner;
    const scope = repo ? `repo:${o}/${repo}` : `org:${o}`;
    const q = `${query} ${scope}`;
    const url = `https://api.github.com/search/code?q=${encodeURIComponent(q)}`;
    const response = await this.http.request<GitHubCodeSearchResponseBody>({
      method: "GET",
      url,
      headers: authHeaders(),
    });
    if (!response.ok) {
      throw new Error(`GitHub searchCode failed: ${response.status}`);
    }
    if (response.data.incomplete_results) {
      throw new GitHubSearchIncompleteError("code", query);
    }
    return response.data.items.map((item) => ({
      path: item.path,
      url: item.html_url,
      repository: item.repository.full_name,
    }));
  }

  async searchCommits(query: string, owner?: string, repo?: string): Promise<GitHubCommitSearchResult[]> {
    const o = owner ?? this.defaultOwner;
    const scope = repo ? `repo:${o}/${repo}` : `org:${o}`;
    const q = `${query} ${scope}`;
    const url = `https://api.github.com/search/commits?q=${encodeURIComponent(q)}`;
    const response = await this.http.request<GitHubCommitSearchResponseBody>({
      method: "GET",
      url,
      headers: authHeaders(),
    });
    if (!response.ok) {
      throw new Error(`GitHub searchCommits failed: ${response.status}`);
    }
    if (response.data.incomplete_results) {
      throw new GitHubSearchIncompleteError("commit", query);
    }
    return response.data.items.map((item) => ({
      sha: item.sha,
      message: item.commit.message,
      url: item.html_url,
      repository: item.repository.full_name,
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
