<p align="center">
  <img src="public/favicon.svg" alt="GitHub MCP logo" width="96" height="96">
</p>

<h1 align="center">GitHub Browser (MCP)</h1>

<p align="center">Browse any public GitHub repository directly from Claude — reliably, without the access errors that usually happen when Claude tries to do it from the web. Search repositories and code, read files, explore project structures, review pull requests, and browse issues. Great for discovering open source issues to contribute to, reviewing code changes, understanding unfamiliar projects, or finding real-world code examples. Works instantly with no setup required. Optionally add a read-only GitHub Personal Access Token for higher rate limits.</p>

## Installation

### Option 1: Install Bundle (Claude Desktop)

1. Download `github-mcp.mcpb` from the [latest release](https://github.com/maganuriyev/github-mcp-worker/releases)
2. Double-click the `.mcpb` file — Claude Desktop installs it automatically
3. (Optional) Set a GitHub PAT for higher rate limits: open Claude Desktop config and add:
   ```json
   "env": { "GITHUB_PAT": "ghp_your_token_here" }
   ```

### Option 2: Build from Source

```bash
git clone https://github.com/maganuriyev/github-mcp-worker.git
cd github-mcp-worker
npm install
npm run build
```

Then add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "github": {
      "command": "node",
      "args": ["/absolute/path/to/github-mcp-worker/dist/main.js", "--stdio"],
      "env": { "GITHUB_PAT": "ghp_your_token_here" }
    }
  }
}
```

Or run as an HTTP server for other MCP clients:

```bash
GITHUB_PAT=ghp_xxx node dist/main.js --port 3001
# → http://localhost:3001/mcp
```

### Option 3: Use Remote URL

Add as a connector in Claude — no installation needed:

1. Go to **claude.ai → Settings → Connectors**
2. Click **"Add custom connector"**
3. Enter URL: `https://github-mcp.maganuriyev.workers.dev/mcp`
4. (Optional) For higher rate limits (5,000 req/hr instead of 60), add a GitHub Personal Access Token:
   - Go to [github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new)
   - Set a descriptive name (e.g. `github-mcp`) and expiration
   - Under **Repository access**, select **"Public Repositories (read-only)"**
   - No additional permissions needed — the default read-only access to public repos is sufficient
   - Click **Generate token** and copy it
   - Back in Claude, expand **Advanced settings** and paste the token into **"OAuth Client Secret"**

Works out of the box without a PAT — unauthenticated requests use the server's default GitHub token.

## Example Prompts

> What are some beginner-friendly open issues on huggingface/transformers that would make for easy open source contributions?

> Show me the files changed in the latest pull request on facebook/react and summarize what the PR does.

> Read the README of langchain-ai/langchain and give me a quick overview of the project architecture.

## CLI Options

| Flag | Description |
|------|-------------|
| `--stdio` | Use stdio transport (for Claude Desktop) |
| `--github-pat <token>` | GitHub personal access token |
| `--port <number>` | HTTP server port (default: 3001) |

## Tools (14)

| Tool | Description |
|------|-------------|
| `search_repos` | Search repositories by keyword |
| `search_code` | Search code across all public repos |
| `get_repo` | Get detailed repo info (stars, topics, etc.) |
| `list_contents` | List files/dirs at a path |
| `read_file` | Read a file's contents |
| `get_readme` | Get a repo's README |
| `list_commits` | List recent commits |
| `get_tree` | Get full recursive file tree |
| `list_issues` | List open/closed issues (filterable by labels) |
| `get_issue` | Get a specific issue with full body |
| `get_issue_comments` | Read comments on issues or PRs |
| `list_pulls` | List open/closed pull requests |
| `get_pull` | Get PR details (additions, deletions, mergeable) |
| `get_pull_files` | See files changed in a PR |

## Development

```bash
# Create .dev.vars from example
cp .dev.vars.example .dev.vars
# Add your GitHub PAT to .dev.vars

# Run Cloudflare Worker locally
npm run dev

# Run tests
npm test

# Type check
npm run typecheck        # Worker
npm run typecheck:node   # Node.js entry

# Build Node.js distribution
npm run build

# Deploy to Cloudflare Workers
npm run deploy
```

### Deploying your own instance

1. Set secrets:
   ```bash
   npx wrangler secret put GITHUB_PAT
   ```
2. Deploy: `npm run deploy`

### Creating a release

Push a version tag — GitHub Actions builds the `.mcpb` bundle and creates the release automatically:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Or manually: `npm run build && npx @anthropic-ai/mcpb pack .`

## Uptime

Check the current server status and uptime history: [status.uptimerobot.com](https://stats.uptimerobot.com/Vo2UtuhevR)

## Privacy Policy

See [PRIVACY.md](PRIVACY.md). In short: this server is read-only, collects no data, and never stores tokens.

## License

MIT
