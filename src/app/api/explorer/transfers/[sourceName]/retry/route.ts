import { NextRequest, NextResponse } from "next/server";
import { getSession, requireConnection, SessionError } from "@/lib/session";
import { retryTransfer, ItemTransferError } from "@/lib/sitecore/itemTransfer";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sourceName: string }> }
) {
  const { sourceName } = await params;
  const database = request.nextUrl.searchParams.get("database") ?? "master";

  try {
    const session = await getSession();
    const destination = requireConnection(session, "destination");
    await retryTransfer(destination.host, destination.token, database, sourceName);
    return NextResponse.json({ retried: true });
  } catch (error) {
    if (error instanceof SessionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof ItemTransferError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
