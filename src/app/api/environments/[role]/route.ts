import { NextResponse } from "next/server";
import { fetchClientCredentialsToken, normalizeHost } from "@/lib/sitecore/auth";
import { getSession, type Role } from "@/lib/session";

function parseRole(value: string): Role | null {
  return value === "source" || value === "destination" ? value : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ role: string }> }
) {
  const role = parseRole((await params).role);
  if (!role) {
    return NextResponse.json({ error: "Role must be 'source' or 'destination'" }, { status: 400 });
  }

  let body: { host?: string; clientId?: string; clientSecret?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (!body.host || !body.clientId || !body.clientSecret) {
    return NextResponse.json(
      { error: "host, clientId, and clientSecret are all required" },
      { status: 400 }
    );
  }

  try {
    const { token, expiresAt } = await fetchClientCredentialsToken(
      body.clientId,
      body.clientSecret
    );

    const session = await getSession();
    session[role] = { host: normalizeHost(body.host), token, expiresAt };
    await session.save();

    return NextResponse.json({ connected: true, expiresAt });
  } catch (error) {
    // Surface the real cause (network failure, bad response shape, auth rejection,
    // etc.) instead of a blanket "Failed to connect" — this is a diagnostic tool,
    // the person entering credentials needs to see why it failed.
    console.error(`[environments/${role}] connect failed:`, error);
    const message = error instanceof Error ? error.message : "Failed to connect";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ role: string }> }
) {
  const role = parseRole((await params).role);
  if (!role) {
    return NextResponse.json({ error: "Role must be 'source' or 'destination'" }, { status: 400 });
  }

  const session = await getSession();
  delete session[role];
  await session.save();

  return NextResponse.json({ connected: false });
}
