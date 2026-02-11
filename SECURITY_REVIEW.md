# Security Review: github-mcp-worker

**Date:** 2026-02-11
**Scope:** Full source code review of all files in src/

---

## Summary

The codebase is small and focused, which limits attack surface. All tools are read-only
and dependencies are minimal. However, several security concerns were identified,
primarily around the shared server PAT, lack of input sanitization on path parameters,
and the unenforced OAuth layer.

| Severity | Count |
|----------|-------|
| Critical | 1     |
| High     | 2     |
| Medium   | 3     |
| Low      | 3     |

---

## CRITICAL

### 1. Shared Server PAT Exposed to All Anonymous Users

**Location:** `src/index.ts:59`

```ts
const pat = resolveGitHubToken(request) || env.GITHUB_PAT;
```

Any unauthenticated request to `/mcp` receives the server's own `GITHUB_PAT` as a
fallback. This means:

- Every anonymous user shares the PAT's 5,000 req/hr rate limit, enabling rate-limit
  exhaustion by a single abuser.
- If the server PAT has permissions beyond public repo read access (e.g. a classic token
  with `repo` scope), those elevated permissions are silently granted to every caller.
- An attacker can probe GitHub API responses for `X-RateLimit-*` headers to confirm the
  token's authenticated status.

**Recommendation:** Remove the fallback PAT, or require authentication for all `/mcp`
requests. If anonymous access is desired, use a dedicated fine-grained token scoped to
only public repository read access and add rate-limit monitoring.

---

## HIGH

### 2. No Input Sanitization on Path Parameters — Path/Query Injection

**Location:** `src/server.ts` — multiple tools (lines 105, 135–137, 165–166, 200, 224, 248, 277, 304, 329, 356, 384)

The `owner`, `repo`, `path`, and `branch` parameters are interpolated directly into
GitHub API URLs with minimal or no encoding:

```ts
// owner/repo — validated only as z.string()
await githubFetch(`/repos/${owner}/${repo}`, pat);

// branch — NOT URL-encoded, allows query parameter injection
const branchParam = branch ? `?ref=${branch}` : "";
await githubFetch(`/repos/${owner}/${repo}/contents/${path}${branchParam}`, pat);
```

**Impact:**
- `owner` set to `foo/bar` changes the API path structure.
- `branch` set to `main&per_page=100` injects arbitrary query parameters.
- `path` segments are not encoded, allowing traversal attempts.

While GitHub's API is the only target (limiting SSRF scope), this can still produce
unexpected API calls authenticated with the server's token.

**Recommendation:** Add regex validation for `owner`/`repo` (e.g.
`/^[a-zA-Z0-9._-]+$/`) and apply `encodeURIComponent()` to `branch` and all
path segments.

### 3. Stateless OAuth with No Validation

**Location:** `src/auth.ts:67–155`

The OAuth implementation is entirely stateless and performs no validation:

- `/register` generates `client_id`/`client_secret` but never stores them.
- `/token` returns `client_secret` directly as `access_token` without verifying the
  `client_id` was previously registered.
- The `authorization_code` grant ignores the `code` parameter entirely.
- The `refresh_token` grant returns `refresh_token` as the new `access_token` without
  any validation.

The OAuth layer provides zero access control. Anyone calling `POST /token` with
`grant_type=client_credentials&client_secret=<any-string>` gets that string back as
a bearer token.

**Recommendation:** If intentional (PAT pass-through), remove the pretense of client
registration and document clearly that the OAuth layer provides no access control. If
access control is desired, implement proper token validation with persistent storage.

---

## MEDIUM

### 4. Wildcard CORS Allows Cross-Origin Exploitation

**Location:** `src/index.ts:27`, `src/main.ts:35`

```ts
"Access-Control-Allow-Origin": "*"
```

Both deployments set wildcard CORS. Combined with `Authorization` in
`Access-Control-Allow-Headers`, any website can make authenticated cross-origin
requests to the MCP endpoint. If a user runs the Node.js server locally with their
PAT, a malicious webpage could call `http://localhost:3001/mcp` and use their token.

**Recommendation:** Restrict allowed origins to known clients (e.g. Claude's domains).
For the local Node.js server, bind to `127.0.0.1` and consider removing CORS entirely.

### 5. GitHub API Error Messages Leaked to Clients

**Location:** `src/server.ts:15–16, 32–33`

```ts
throw new Error(`GitHub API ${res.status}: ${text}`);
```

Full GitHub API error responses are propagated to MCP clients. These may contain rate
limit information, access details, or internal error messages.

**Recommendation:** Return generic error messages to clients; log details server-side.

### 6. No Rate Limiting on Server Endpoints

The server has no rate limiting on `/register`, `/token`, or `/mcp`. An attacker can
exhaust the server PAT's rate limit, spam client registration, or cause denial of
service.

**Recommendation:** Add per-IP rate limiting. On Cloudflare Workers, use Cloudflare Rate
Limiting rules. On Node.js, use a middleware like `express-rate-limit` or equivalent.

---

## LOW

### 7. No HTTPS Enforcement in Node.js Mode

**Location:** `src/main.ts:43`

The Node.js HTTP server runs plain HTTP. GitHub PATs in `Authorization` headers are
transmitted in cleartext if accessed over a network.

**Recommendation:** Document that the Node.js mode is for local development only, or add
TLS support for network deployments.

### 8. Synchronous File Reads in HTTP Handler

**Location:** `src/main.ts:56–67`

```ts
const buf = readFileSync(resolve(publicDir, "favicon.ico"));
```

`readFileSync` blocks the event loop during request handling, contributing to
latency-based denial of service under high concurrency.

**Recommendation:** Switch to async `readFile` or pre-load favicon buffers at startup.

### 9. Grant Type Value Reflected in Error Response

**Location:** `src/auth.ts:154`

```ts
return errorResponse("unsupported_grant_type", `Unsupported grant_type: ${grantType}`);
```

User-controlled input is reflected in the response body. While the JSON content type
prevents XSS in modern browsers, reflecting user input is best avoided.

**Recommendation:** Use a static error message or sanitize the reflected value.

---

## Positive Observations

- All tools correctly marked `readOnlyHint: true`, `destructiveHint: false`
- `.dev.vars` is properly gitignored
- Secrets stored via `wrangler secret`, not in source code
- `per_page` capped at 30 via `Math.min()`
- Zod schema validation on all tool inputs
- Server-side fetch scoped to `https://api.github.com` only
- Minimal dependencies (3 production) reducing supply chain risk
- CI pipeline includes type checking and smoke tests
