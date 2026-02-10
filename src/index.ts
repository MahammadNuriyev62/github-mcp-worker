import { createMcpHandler } from "agents/mcp";
import { createServer } from "./server.js";
import {
  handleMetadata,
  handleResourceMetadata,
  handleRegister,
  handleToken,
  resolveGitHubToken,
} from "./auth.js";
import { ICON_SVG, ICON_ICO_BASE64 } from "./icon.js";

// Type for Cloudflare Worker environment
interface Env {
  GITHUB_PAT: string;
}

// Worker fetch handler
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const issuerUrl = `${url.protocol}//${url.host}`;

    // CORS preflight for all routes
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
          "Access-Control-Expose-Headers": "Mcp-Session-Id",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // OAuth metadata
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      return handleMetadata(issuerUrl);
    }

    // Protected resource metadata
    if (url.pathname.startsWith("/.well-known/oauth-protected-resource")) {
      return handleResourceMetadata(`${issuerUrl}/mcp`, issuerUrl);
    }

    // Dynamic client registration
    if (url.pathname === "/register") {
      return handleRegister(request);
    }

    // Token endpoint
    if (url.pathname === "/token") {
      return handleToken(request);
    }

    // Favicon (ICO)
    if (url.pathname === "/favicon.ico") {
      const bytes = Uint8Array.from(atob(ICON_ICO_BASE64), (c) => c.charCodeAt(0));
      return new Response(bytes, {
        headers: { "Content-Type": "image/x-icon", "Cache-Control": "public, max-age=86400" },
      });
    }

    // Favicon (SVG)
    if (url.pathname === "/favicon.svg") {
      return new Response(ICON_SVG, {
        headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
      });
    }

    // MCP endpoint
    if (url.pathname === "/mcp" || url.pathname === "/mcp/") {
      // Resolve PAT: Bearer token (user's PAT) → fallback to server's GITHUB_PAT
      const pat = resolveGitHubToken(request) || env.GITHUB_PAT;

      const server = createServer(pat);
      const handler = createMcpHandler(server);
      return handler(request, env, ctx);
    }

    return new Response("GitHub MCP Server\n\nConnect via /mcp", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  },
} satisfies ExportedHandler<Env>;
