import { NextResponse } from "next/server";
import { getSession, isConnectionValid } from "@/lib/session";
import { ROLES } from "@/lib/types";

export async function GET() {
  const session = await getSession();

  const body = Object.fromEntries(
    ROLES.map((role) => {
      const connection = session[role];
      return [
        role,
        isConnectionValid(connection)
          ? { connected: true, host: connection.host, expiresAt: connection.expiresAt }
          : { connected: false },
      ];
    })
  );

  return NextResponse.json(body);
}
