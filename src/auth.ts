/**
 * MCP OAuth for Cloudflare Workers — simple PAT pass-through.
 *
 * Users paste their GitHub PAT into the "OAuth Client Secret" field
 * in Claude's connector UI. The server uses client_credentials grant
 * to pass it through as a bearer token. No GitHub OAuth App needed.
 *
 * Flow:
 *  1. User adds connector with URL + PAT in "OAuth Client Secret"
 *  2. Claude discovers /.well-known/oauth-authorization-server
 *  3. Claude sends POST /token with client_credentials grant
 *  4. Server returns the client_secret (the PAT) as the access_token
 *  5. Claude sends Authorization: Bearer <PAT> on /mcp requests
 *  6. Server extracts the PAT and uses it for GitHub API calls
 *
 * Users who don't provide OAuth credentials get the server's default GITHUB_PAT.
 */

// ── Helpers ──

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

function errorResponse(error: string, description: string, status = 400): Response {
  return jsonResponse({ error, error_description: description }, status);
}

function generateId(length = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ── OAuth Authorization Server Metadata ──

export function handleMetadata(issuerUrl: string): Response {
  return jsonResponse({
    issuer: issuerUrl,
    token_endpoint: `${issuerUrl}/token`,
    registration_endpoint: `${issuerUrl}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["client_credentials", "authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["client_secret_post"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["github"],
  });
}

// ── Protected Resource Metadata ──

export function handleResourceMetadata(serverUrl: string, issuerUrl: string): Response {
  return jsonResponse({
    resource: serverUrl,
    authorization_servers: [issuerUrl],
    scopes_supported: ["github"],
    bearer_methods_supported: ["header"],
  });
}

// ── Dynamic Client Registration ──
// Claude may register before requesting tokens, even when credentials are pre-filled.

export async function handleRegister(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("invalid_request", "Method must be POST", 405);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_request", "Invalid JSON body");
  }

  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return errorResponse("invalid_client_metadata", "redirect_uris is required");
  }

  const clientId = generateId(16);
  const clientSecret = generateId(32);

  return jsonResponse({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: redirectUris,
    client_name: body.client_name || "MCP Client",
    grant_types: body.grant_types || ["client_credentials", "authorization_code", "refresh_token"],
    response_types: body.response_types || ["code"],
    token_endpoint_auth_method: body.token_endpoint_auth_method || "client_secret_post",
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0,
  }, 201);
}

// ── Token Endpoint ──

export async function handleToken(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("invalid_request", "Method must be POST", 405);
  }

  const body = await parseBody(request);
  if (!body) {
    return errorResponse("invalid_request", "Invalid request body");
  }

  const grantType = body.grant_type;

  if (grantType === "client_credentials") {
    // The client_secret IS the user's GitHub PAT — pass it through as the access token
    const clientSecret = body.client_secret;
    if (!clientSecret) {
      return errorResponse("invalid_request", "client_secret is required");
    }

    return jsonResponse({
      access_token: clientSecret,
      token_type: "Bearer",
      // No expiry — PAT lifetime is managed by the user on GitHub
    });
  }

  if (grantType === "authorization_code") {
    // For authorization_code flow, the code itself may carry the PAT
    // (from a pre-filled client_secret scenario)
    const clientSecret = body.client_secret;
    if (clientSecret) {
      return jsonResponse({
        access_token: clientSecret,
        token_type: "Bearer",
      });
    }
    return errorResponse("invalid_grant", "client_secret is required for token exchange");
  }

  if (grantType === "refresh_token") {
    // The refresh token IS the PAT — just return it again
    const refreshToken = body.refresh_token;
    if (refreshToken) {
      return jsonResponse({
        access_token: refreshToken,
        token_type: "Bearer",
        refresh_token: refreshToken,
      });
    }
    return errorResponse("invalid_request", "refresh_token is required");
  }

  return errorResponse("unsupported_grant_type", `Unsupported grant_type: ${grantType}`);
}

// ── Bearer Token Resolution ──

/**
 * Extracts the Bearer token from a request.
 * Since the token IS the GitHub PAT (pass-through), return it directly.
 */
export function resolveGitHubToken(request: Request): string | undefined {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return undefined;
  }
  return authHeader.slice(7);
}

// ── Internal ──

async function parseBody(request: Request): Promise<Record<string, string> | null> {
  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      return Object.fromEntries(new URLSearchParams(await request.text()));
    }
    if (contentType.includes("application/json")) {
      return await request.json();
    }
    // Try form-urlencoded, then JSON
    const text = await request.text();
    try {
      return Object.fromEntries(new URLSearchParams(text));
    } catch {
      return JSON.parse(text);
    }
  } catch {
    return null;
  }
}
