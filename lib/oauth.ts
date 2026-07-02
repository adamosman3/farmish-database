// OAuth2 (authorization code + PKCE) client for Farmish's Doorkeeper server.

export interface FarmishUser {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  admin?: boolean;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
}

function farmishUrl(): string {
  const url = process.env.FARMISH_URL;
  if (!url) throw new Error("FARMISH_URL is not set");
  return url.replace(/\/$/, "");
}

function appUrl(): string {
  const url = process.env.APP_URL;
  if (!url) throw new Error("APP_URL is not set");
  return url.replace(/\/$/, "");
}

function clientId(): string {
  const id = process.env.FARMISH_CLIENT_ID;
  if (!id) throw new Error("FARMISH_CLIENT_ID is not set");
  return id;
}

function clientSecret(): string {
  const secret = process.env.FARMISH_CLIENT_SECRET;
  if (!secret) throw new Error("FARMISH_CLIENT_SECRET is not set");
  return secret;
}

export function redirectUri(): string {
  return `${appUrl()}/api/auth/callback`;
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return base64url(new Uint8Array(digest));
}

export function authorizeUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "public",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${farmishUrl()}/oauth/authorize?${params}`;
}

export async function exchangeCode(
  code: string,
  codeVerifier: string
): Promise<TokenResponse> {
  const response = await fetch(`${farmishUrl()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: clientId(),
      client_secret: clientSecret(),
      code_verifier: codeVerifier,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status})`);
  }
  return response.json();
}

export async function fetchCurrentUser(
  accessToken: string
): Promise<FarmishUser> {
  const response = await fetch(`${farmishUrl()}/api/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Fetching /api/me failed (${response.status})`);
  }
  return response.json();
}

export async function revokeToken(accessToken: string): Promise<void> {
  await fetch(`${farmishUrl()}/oauth/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      token: accessToken,
      client_id: clientId(),
      client_secret: clientSecret(),
    }),
    cache: "no-store",
  });
}
