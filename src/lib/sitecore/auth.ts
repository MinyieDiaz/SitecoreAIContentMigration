const TOKEN_URL =
  process.env.SITECORE_AUTH_TOKEN_URL ?? "https://auth.sitecorecloud.io/oauth/token";
const AUDIENCE = process.env.SITECORE_AUTH_AUDIENCE ?? "https://api.sitecorecloud.io";

export interface TokenResult {
  token: string;
  expiresAt: number;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export async function fetchClientCredentialsToken(
  clientId: string,
  clientSecret: string
): Promise<TokenResult> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience: AUDIENCE,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new AuthError(
      `Token request failed with status ${response.status}. Check the client ID/secret and that this credential has Organization Admin or Owner access.`
    );
  }

  const body = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  return {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
}

export function normalizeHost(host: string): string {
  return host
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}
