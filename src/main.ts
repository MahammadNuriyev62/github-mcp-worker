import { createServer } from "./server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";

// Parse CLI args
const args = process.argv.slice(2);
const useStdio = args.includes("--stdio");

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const pat = getArg("--github-pat") || process.env.GITHUB_PAT || undefined;
const port = parseInt(getArg("--port") || "3001", 10);

async function runStdio() {
  const server = createServer(pat);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });
}

function setCorsHeaders(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  res.setHeader("Access-Control-Max-Age", "86400");
}

async function runHttp() {
  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://localhost:${port}`);

    // CORS preflight
    if (req.method === "OPTIONS") {
      setCorsHeaders(res);
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === "/mcp" || url.pathname === "/mcp/") {
      setCorsHeaders(res);

      // Stateless: fresh server + transport per request
      const mcpServer = createServer(pat);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
      });

      await mcpServer.connect(transport);

      // handleRequest takes raw Node.js req/res directly
      await transport.handleRequest(req, res);
      return;
    }

    // Health check / info
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("GitHub MCP Server\n\nConnect via /mcp");
  });

  httpServer.listen(port, () => {
    console.log(`GitHub MCP server listening on http://localhost:${port}/mcp`);
    if (pat) {
      console.log("Using provided GitHub PAT for authenticated API access");
    } else {
      console.log("No GitHub PAT configured — using unauthenticated access (60 req/hr)");
    }
  });

  process.on("SIGINT", () => {
    httpServer.close();
    process.exit(0);
  });
}

if (useStdio) {
  runStdio().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
} else {
  runHttp().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
