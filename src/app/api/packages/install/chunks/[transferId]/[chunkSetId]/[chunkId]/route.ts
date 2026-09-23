import { NextRequest, NextResponse } from "next/server";
import { getSession, requireConnection, SessionError } from "@/lib/session";
import { saveChunk, ContentTransferRestError } from "@/lib/sitecore/contentTransferRest";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ transferId: string; chunkSetId: string; chunkId: string }> }
) {
  const { transferId, chunkSetId, chunkId } = await params;
  const isMedia = request.nextUrl.searchParams.get("isMedia") === "true";

  try {
    const session = await getSession();
    const installTarget = requireConnection(session, "installTarget");
    await saveChunk(
      installTarget.host,
      installTarget.token,
      transferId,
      chunkSetId,
      Number(chunkId),
      request.body ?? new Uint8Array(0),
      isMedia
    );
    return NextResponse.json({ saved: true });
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
