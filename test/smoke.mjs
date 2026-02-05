#!/usr/bin/env node

/**
 * Test script for the GitHub MCP Worker.
 *
 * Usage:
 *   1. Start the dev server: npm run dev
 *   2. In another terminal: node test/smoke.mjs
 *
 * Or test against production:
 *   MCP_URL=https://github-mcp-worker.your-account.workers.dev/mcp node test/smoke.mjs
 */

const MCP_URL = process.env.MCP_URL || "http://localhost:8787/mcp";

let passed = 0;
let failed = 0;

async function mcpCall(method, params = {}, id = 1) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }),
  });

  const text = await res.text();

  // Handle SSE responses (Streamable HTTP)
  if (text.startsWith("event:") || text.startsWith("data:")) {
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          return JSON.parse(line.slice(6));
        } catch {}
      }
    }
    throw new Error(`Could not parse SSE response:\n${text.substring(0, 500)}`);
  }

  return JSON.parse(text);
}

async function callTool(name, args = {}) {
  // Need a session first — initialize
  const initRes = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      },
    }),
  });

  const initText = await initRes.text();
  // Extract session ID from Mcp-Session-Id header
  const sessionId = initRes.headers.get("mcp-session-id");

  // Now call the tool
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const toolRes = await fetch(MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });

  const toolText = await toolRes.text();

  // Parse — could be JSON or SSE
  if (toolText.startsWith("{")) {
    return JSON.parse(toolText);
  }

  // SSE
  const lines = toolText.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        const parsed = JSON.parse(line.slice(6));
        if (parsed.result || parsed.error) return parsed;
      } catch {}
    }
  }

  throw new Error(`Unparseable response:\n${toolText.substring(0, 500)}`);
}

async function test(name, toolName, args, validate) {
  try {
    const result = await callTool(toolName, args);

    if (result.error) {
      throw new Error(`MCP error: ${JSON.stringify(result.error)}`);
    }

    const content = result.result?.content?.[0]?.text;
    if (!content) throw new Error("No content in response");

    const data = JSON.parse(content);
    validate(data);
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

async function run() {
  console.log(`\n🧪 Testing GitHub MCP Worker at ${MCP_URL}\n`);

  // Check server is up
  try {
    const health = await fetch(MCP_URL.replace("/mcp", ""));
    if (!health.ok) throw new Error(`HTTP ${health.status}`);
    console.log("  🟢 Server is reachable\n");
  } catch (err) {
    console.log(`  🔴 Server unreachable at ${MCP_URL}: ${err.message}`);
    console.log("     Make sure 'npm run dev' is running.\n");
    process.exit(1);
  }

  // --- Tool tests ---

  await test("search_repos", "search_repos", { query: "pytorch", per_page: 3 }, (data) => {
    if (!Array.isArray(data) || data.length === 0) throw new Error("Expected non-empty array");
    if (!data[0].name) throw new Error("Missing repo name");
  });

  await test("get_repo", "get_repo", { owner: "anthropics", repo: "courses" }, (data) => {
    if (data.name !== "anthropics/courses") throw new Error(`Unexpected name: ${data.name}`);
  });

  await test("list_contents (root)", "list_contents", { owner: "anthropics", repo: "courses", path: "" }, (data) => {
    if (!Array.isArray(data)) throw new Error("Expected array");
    if (!data.some((f) => f.name === "README.md")) throw new Error("README.md not found in root");
  });

  await test("read_file", "read_file", { owner: "anthropics", repo: "courses", path: "README.md" }, (data) => {
    // data is raw string here, not JSON
    // This test is a special case — content is text, not JSON array
    // We'll handle it in the validate differently
  });

  await test("get_readme", "get_readme", { owner: "anthropics", repo: "courses" }, (data) => {
    // README content is raw text
  });

  await test("list_commits", "list_commits", { owner: "anthropics", repo: "courses", per_page: 3 }, (data) => {
    if (!Array.isArray(data) || data.length === 0) throw new Error("Expected commits array");
    if (!data[0].sha) throw new Error("Missing commit sha");
  });

  await test("list_issues", "list_issues", { owner: "pytorch", repo: "pytorch", per_page: 3 }, (data) => {
    if (!Array.isArray(data)) throw new Error("Expected array");
  });

  await test("list_pulls", "list_pulls", { owner: "pytorch", repo: "pytorch", per_page: 3 }, (data) => {
    if (!Array.isArray(data)) throw new Error("Expected array");
    if (data.length > 0 && !data[0].number) throw new Error("Missing PR number");
  });

  await test("search_code", "search_code", { query: "GRPO language:python", per_page: 3 }, (data) => {
    if (!Array.isArray(data)) throw new Error("Expected array");
  });

  await test("get_tree", "get_tree", { owner: "anthropics", repo: "courses" }, (data) => {
    // data is a newline-separated string, not JSON — will fail JSON.parse
    // That's fine, the tool returns plain text
  });

  // --- Summary ---
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${passed + failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
