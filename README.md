# GitHub MCP Worker 🐙

A self-hosted, **read-only** GitHub browsing MCP server on Cloudflare Workers (free tier).  
Use it as a custom connector in Claude.ai web to browse any public GitHub repo — no third-party trust required.

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
| `list_issues` | List open/closed issues (filterable by labels) |
| `get_issue` | Get a specific issue with full body |
| `get_issue_comments` | Read comments on issues or PRs |
| `list_pulls` | List open/closed pull requests |
| `get_pull` | Get PR details (additions, deletions, mergeable) |
| `get_pull_files` | See files changed in a PR with diffs |
| `get_tree` | Get full recursive file tree |

## Quick Start

### Prerequisites

- Node.js 18+
- A free [Cloudflare account](https://dash.cloudflare.com/sign-up)
- A [GitHub fine-grained PAT](https://github.com/settings/tokens?type=beta) with **Public Repositories (read-only)** access

### Deploy in 5 minutes

```bash
git clone https://github.com/YOUR_USERNAME/github-mcp-worker.git
cd github-mcp-worker
npm install

# Login to Cloudflare (opens browser)
npx wrangler login

# First deploy
npm run deploy

# Set your GitHub PAT (one-time, CI/CD handles it after)
npx wrangler secret put GITHUB_PAT
```

Or skip the manual steps entirely — just push to `main` with CI/CD secrets configured and it deploys automatically.

Your URL: `https://github-mcp-worker.<your-account>.workers.dev`

### Connect to Claude.ai

1. Go to **claude.ai → Settings → Connectors**
2. Click **"Add custom connector"**
3. Enter: `https://github-mcp-worker.<your-account>.workers.dev/mcp`
4. Start a new chat, enable the connector, and ask away!

---

## Local Development

```bash
# 1. Copy the env example and add your PAT
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your token

# 2. Start dev server
npm run dev
# → http://localhost:8787/mcp
```

### Debugging with MCP Inspector

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) is an interactive web UI for testing your MCP server — you can list tools, call them, and see responses.

```bash
# Start your dev server first
npm run dev

# In another terminal, launch the inspector
npm run inspect
```

The inspector opens a web UI. Set:
- **Transport type**: Streamable HTTP
- **URL**: `http://localhost:8787/mcp`

Then you can click on any tool, fill in params, and test it live.

### Smoke Tests

Run the automated test suite against your local dev server:

```bash
# Terminal 1: start dev server
npm run dev

# Terminal 2: run tests
npm test
```

Test against production:

```bash
MCP_URL=https://github-mcp-worker.your-account.workers.dev/mcp npm run test:prod
```

### Type Checking

```bash
npm run typecheck
```

---

## CI/CD (GitHub Actions)

The repo includes two workflows:

### `.github/workflows/ci.yml`
Runs on **pull requests** → type checks the code.

### `.github/workflows/deploy.yml`
Runs on **push to main** → auto-deploys to Cloudflare Workers.

### Setting up CI/CD

1. **Get a Cloudflare API token**:
   - Go to [Cloudflare Dashboard → API Tokens](https://dash.cloudflare.com/profile/api-tokens)
   - Create token → Use template **"Edit Cloudflare Workers"**
   - Copy the token

2. **Get your Cloudflare Account ID**:
   - Go to any domain in your dashboard, or Workers & Pages
   - Account ID is in the right sidebar

3. **Add GitHub repo secrets** (`Settings → Secrets and variables → Actions`):

   | Secret | Value |
   |--------|-------|
   | `CLOUDFLARE_API_TOKEN` | Your Cloudflare API token |
   | `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
   | `GITHUB_PAT` | Your fine-grained GitHub token (public repos read-only) |

4. Now every push to `main` auto-deploys **and** sets the Worker secret. Fully hands-off.

> **To rotate your PAT**: Just update the `GITHUB_PAT` secret in GitHub and re-run the deploy workflow.

---

## Security

- ✅ **Read-only**: No write operations exposed
- ✅ **Your infrastructure**: PAT stored as Cloudflare encrypted secret, never in code
- ✅ **Minimal scope**: Fine-grained PAT with only public repo read access
- ✅ **No third-party**: You own the Worker, no data passes through Smithery/Pipedream/etc.
- 🔄 **Rotate regularly**: Update the `GITHUB_PAT` secret in GitHub repo settings → re-run deploy
- 🔒 **Rate limits**: GitHub gives 5,000 req/hour with a PAT (60 without)

---

## Example Prompts in Claude

```
Search GitHub for GRPO reinforcement learning implementations
Show me the file tree of huggingface/trl
Read the training loop at src/train.py in repo X
What are the recent commits on mistralai/mistral-inference?
Get the README for openai/whisper
Show me open issues labeled 'bug' in pytorch/pytorch
What are the most recent PRs on vllm-project/vllm?
Show me PR #1234 on huggingface/trl and what files it changed
Read the comments on issue #42 in repo X
```

---

## Project Structure

```
github-mcp-worker/
├── src/
│   └── index.ts          # MCP server + all tool definitions
├── test/
│   └── smoke.mjs         # Automated smoke tests
├── .github/
│   └── workflows/
│       ├── ci.yml         # PR type checking
│       └── deploy.yml     # Auto-deploy on push to main
├── .dev.vars.example      # Local dev secrets template
├── .gitignore
├── package.json
├── tsconfig.json
├── wrangler.toml          # Cloudflare Worker config
└── README.md
```

## License

MIT
