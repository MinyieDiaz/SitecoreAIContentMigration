import { NextResponse } from "next/server";
import { getSession, requireConnection, SessionError } from "@/lib/session";
import { listTransfers, ItemTransferError } from "@/lib/sitecore/itemTransfer";

export async function GET() {
  try {
    const session = await getSession();
    const destination = requireConnection(session, "destination");
    const transfers = await listTransfers(destination.host, destination.token);
    return NextResponse.json({ transfers });
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
