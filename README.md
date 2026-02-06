# GitHub MCP

A read-only GitHub MCP server running on Cloudflare Workers. Lets Claude browse any public GitHub repo without getting blocked by Cloudflare's bot protection or running into other access issues that normally break web-based code browsing.

## Quick Start

Add this as a custom MCP connector in Claude:

1. Go to **claude.ai → Settings → Connectors**
2. Click **"Add custom connector"**
3. Enter: `https://github-mcp.maganuriyev.workers.dev/mcp`
4. Start a new chat, enable the connector, and ask away!

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

## License

MIT
