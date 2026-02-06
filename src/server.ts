import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// GitHub API helper
async function githubFetch(path: string, pat?: string) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "github-mcp",
  };
  if (pat) {
    headers.Authorization = `Bearer ${pat}`;
  }
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return res.json();
}

// Raw content fetcher (for file contents)
async function githubRawFetch(path: string, pat?: string): Promise<string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3.raw",
    "User-Agent": "github-mcp",
  };
  if (pat) {
    headers.Authorization = `Bearer ${pat}`;
  }
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return res.text();
}

// Factory: creates a fresh McpServer with all tools bound to the given PAT
export function createServer(pat?: string): McpServer {
  const server = new McpServer({
    name: "GitHub Browser",
    version: "1.0.0",
  });

  // Tool 1: Search repositories
  server.tool(
    "search_repos",
    "Search GitHub repositories by keyword",
    {
      query: z.string().describe("Search query (e.g. 'GRPO reinforcement learning')"),
      per_page: z.number().optional().default(10).describe("Results per page (max 30)"),
    },
    async ({ query, per_page }) => {
      const data: any = await githubFetch(
        `/search/repositories?q=${encodeURIComponent(query)}&per_page=${Math.min(per_page, 30)}`,
        pat,
      );
      const results = data.items.map((r: any) => ({
        name: r.full_name,
        description: r.description,
        stars: r.stargazers_count,
        language: r.language,
        url: r.html_url,
        updated: r.updated_at,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] };
    },
  );

  // Tool 2: Search code across repos
  server.tool(
    "search_code",
    "Search code across all public GitHub repositories",
    {
      query: z.string().describe("Code search query (e.g. 'GRPO loss function language:python')"),
      per_page: z.number().optional().default(10).describe("Results per page (max 30)"),
    },
    async ({ query, per_page }) => {
      const data: any = await githubFetch(
        `/search/code?q=${encodeURIComponent(query)}&per_page=${Math.min(per_page, 30)}`,
        pat,
      );
      const results = data.items.map((r: any) => ({
        file: r.name,
        path: r.path,
        repo: r.repository.full_name,
        url: r.html_url,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] };
    },
  );

  // Tool 3: Get repository info
  server.tool(
    "get_repo",
    "Get detailed information about a repository",
    {
      owner: z.string().describe("Repository owner (e.g. 'huggingface')"),
      repo: z.string().describe("Repository name (e.g. 'transformers')"),
    },
    async ({ owner, repo }) => {
      const data: any = await githubFetch(`/repos/${owner}/${repo}`, pat);
      const info = {
        name: data.full_name,
        description: data.description,
        stars: data.stargazers_count,
        forks: data.forks_count,
        language: data.language,
        topics: data.topics,
        default_branch: data.default_branch,
        created: data.created_at,
        updated: data.updated_at,
        license: data.license?.name,
        url: data.html_url,
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(info, null, 2) }] };
    },
  );

  // Tool 4: List directory contents
  server.tool(
    "list_contents",
    "List files and directories in a repository path",
    {
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      path: z.string().optional().default("").describe("Path within repo (empty for root)"),
      branch: z.string().optional().describe("Branch name (defaults to repo default branch)"),
    },
    async ({ owner, repo, path, branch }) => {
      const branchParam = branch ? `?ref=${branch}` : "";
      const data: any = await githubFetch(
        `/repos/${owner}/${repo}/contents/${path}${branchParam}`,
        pat,
      );
      const items = Array.isArray(data)
        ? data.map((item: any) => ({
            name: item.name,
            type: item.type,
            size: item.size,
            path: item.path,
          }))
        : [{ name: data.name, type: data.type, size: data.size, path: data.path }];
      return { content: [{ type: "text" as const, text: JSON.stringify(items, null, 2) }] };
    },
  );

  // Tool 5: Read file contents
  server.tool(
    "read_file",
    "Read the contents of a file from a repository",
    {
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      path: z.string().describe("File path (e.g. 'src/train.py')"),
      branch: z.string().optional().describe("Branch name (defaults to repo default branch)"),
    },
    async ({ owner, repo, path, branch }) => {
      const branchParam = branch ? `?ref=${branch}` : "";
      const content = await githubRawFetch(
        `/repos/${owner}/${repo}/contents/${path}${branchParam}`,
        pat,
      );
      return { content: [{ type: "text" as const, text: content }] };
    },
  );

  // Tool 6: Get README
  server.tool(
    "get_readme",
    "Get the README file of a repository",
    {
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
    },
    async ({ owner, repo }) => {
      const content = await githubRawFetch(`/repos/${owner}/${repo}/readme`, pat);
      return { content: [{ type: "text" as const, text: content }] };
    },
  );

  // Tool 7: List recent commits
  server.tool(
    "list_commits",
    "List recent commits in a repository",
    {
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      path: z.string().optional().describe("Filter by file path"),
      per_page: z.number().optional().default(10).describe("Number of commits (max 30)"),
    },
    async ({ owner, repo, path, per_page }) => {
      let url = `/repos/${owner}/${repo}/commits?per_page=${Math.min(per_page, 30)}`;
      if (path) url += `&path=${encodeURIComponent(path)}`;
      const data: any = await githubFetch(url, pat);
      const commits = data.map((c: any) => ({
        sha: c.sha.substring(0, 7),
        message: c.commit.message.split("\n")[0],
        author: c.commit.author.name,
        date: c.commit.author.date,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(commits, null, 2) }] };
    },
  );

  // Tool 8: Get repo tree (recursive directory listing)
  server.tool(
    "get_tree",
    "Get full directory tree of a repository (recursive)",
    {
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      branch: z.string().optional().default("HEAD").describe("Branch name"),
    },
    async ({ owner, repo, branch }) => {
      const data: any = await githubFetch(
        `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        pat,
      );
      const tree = data.tree
        .filter((t: any) => t.type === "blob")
        .map((t: any) => t.path);
      return { content: [{ type: "text" as const, text: tree.join("\n") }] };
    },
  );

  // Tool 9: List issues
  server.tool(
    "list_issues",
    "List issues in a repository",
    {
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      state: z.enum(["open", "closed", "all"]).optional().default("open").describe("Issue state"),
      labels: z.string().optional().describe("Comma-separated label names"),
      per_page: z.number().optional().default(10).describe("Results per page (max 30)"),
    },
    async ({ owner, repo, state, labels, per_page }) => {
      let url = `/repos/${owner}/${repo}/issues?state=${state}&per_page=${Math.min(per_page, 30)}`;
      if (labels) url += `&labels=${encodeURIComponent(labels)}`;
      const data: any = await githubFetch(url, pat);
      const issues = data
        .filter((i: any) => !i.pull_request)
        .map((i: any) => ({
          number: i.number,
          title: i.title,
          state: i.state,
          labels: i.labels.map((l: any) => l.name),
          author: i.user.login,
          created: i.created_at,
          comments: i.comments,
        }));
      return { content: [{ type: "text" as const, text: JSON.stringify(issues, null, 2) }] };
    },
  );

  // Tool 10: Get single issue
  server.tool(
    "get_issue",
    "Get details of a specific issue",
    {
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      issue_number: z.number().describe("Issue number"),
    },
    async ({ owner, repo, issue_number }) => {
      const data: any = await githubFetch(`/repos/${owner}/${repo}/issues/${issue_number}`, pat);
      const issue = {
        number: data.number,
        title: data.title,
        state: data.state,
        body: data.body,
        labels: data.labels.map((l: any) => l.name),
        author: data.user.login,
        created: data.created_at,
        comments: data.comments,
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(issue, null, 2) }] };
    },
  );

  // Tool 11: Get issue comments
  server.tool(
    "get_issue_comments",
    "Get comments on an issue",
    {
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      issue_number: z.number().describe("Issue number"),
      per_page: z.number().optional().default(10).describe("Results per page (max 30)"),
    },
    async ({ owner, repo, issue_number, per_page }) => {
      const data: any = await githubFetch(
        `/repos/${owner}/${repo}/issues/${issue_number}/comments?per_page=${Math.min(per_page, 30)}`,
        pat,
      );
      const comments = data.map((c: any) => ({
        author: c.user.login,
        body: c.body,
        created: c.created_at,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(comments, null, 2) }] };
    },
  );

  // Tool 12: List pull requests
  server.tool(
    "list_pulls",
    "List pull requests in a repository",
    {
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      state: z.enum(["open", "closed", "all"]).optional().default("open").describe("PR state"),
      per_page: z.number().optional().default(10).describe("Results per page (max 30)"),
    },
    async ({ owner, repo, state, per_page }) => {
      const data: any = await githubFetch(
        `/repos/${owner}/${repo}/pulls?state=${state}&per_page=${Math.min(per_page, 30)}`,
        pat,
      );
      const pulls = data.map((p: any) => ({
        number: p.number,
        title: p.title,
        state: p.state,
        author: p.user.login,
        created: p.created_at,
        draft: p.draft,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(pulls, null, 2) }] };
    },
  );

  // Tool 13: Get single pull request
  server.tool(
    "get_pull",
    "Get details of a specific pull request",
    {
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      pull_number: z.number().describe("Pull request number"),
    },
    async ({ owner, repo, pull_number }) => {
      const data: any = await githubFetch(`/repos/${owner}/${repo}/pulls/${pull_number}`, pat);
      const pr = {
        number: data.number,
        title: data.title,
        state: data.state,
        body: data.body,
        author: data.user.login,
        created: data.created_at,
        merged: data.merged,
        additions: data.additions,
        deletions: data.deletions,
        changed_files: data.changed_files,
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(pr, null, 2) }] };
    },
  );

  // Tool 14: Get pull request files
  server.tool(
    "get_pull_files",
    "Get list of files changed in a pull request",
    {
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      pull_number: z.number().describe("Pull request number"),
    },
    async ({ owner, repo, pull_number }) => {
      const data: any = await githubFetch(
        `/repos/${owner}/${repo}/pulls/${pull_number}/files`,
        pat,
      );
      const files = data.map((f: any) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
      }));
      return { content: [{ type: "text" as const, text: JSON.stringify(files, null, 2) }] };
    },
  );

  return server;
}
