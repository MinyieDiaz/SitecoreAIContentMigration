import { NextResponse } from "next/server";
import { getSession, isConnectionValid } from "@/lib/session";

export async function GET() {
  const session = await getSession();

  return NextResponse.json({
    source: isConnectionValid(session.source)
      ? { connected: true, host: session.source.host, expiresAt: session.source.expiresAt }
      : { connected: false },
    destination: isConnectionValid(session.destination)
      ? {
          connected: true,
          host: session.destination.host,
          expiresAt: session.destination.expiresAt,
        }
      : { connected: false },
  });
}
