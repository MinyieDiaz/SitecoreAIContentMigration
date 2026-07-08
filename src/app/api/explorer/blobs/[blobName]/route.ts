import { NextResponse } from "next/server";
import { getSession, requireConnection, SessionError } from "@/lib/session";
import { deleteBlob, ItemTransferError } from "@/lib/sitecore/itemTransfer";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ blobName: string }> }
) {
  const { blobName } = await params;
  try {
    const session = await getSession();
    const destination = requireConnection(session, "destination");
    await deleteBlob(destination.host, destination.token, blobName);
    return NextResponse.json({ deleted: true });
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
