import { NextResponse } from "next/server";
import { getSession, requireConnection, SessionError } from "@/lib/session";
import { completeChunkSet, ContentTransferRestError } from "@/lib/sitecore/contentTransferRest";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ transferId: string; chunkSetId: string }> }
) {
  const { transferId, chunkSetId } = await params;

  try {
    const session = await getSession();
    const installTarget = requireConnection(session, "installTarget");
    const { blobName } = await completeChunkSet(installTarget.host, installTarget.token, transferId, chunkSetId);
    return NextResponse.json({ blobName });
  } catch (error) {
    if (error instanceof SessionError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ContentTransferRestError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
