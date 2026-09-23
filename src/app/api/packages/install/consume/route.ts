import { NextResponse } from "next/server";
import { getSession, requireConnection, SessionError } from "@/lib/session";
import { startConsume, ContentTransferRestError } from "@/lib/sitecore/contentTransferRest";

const DATABASE_NAME = "master";

export async function POST(request: Request) {
  let body: { blobName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  if (!body.blobName) {
    return NextResponse.json({ error: "blobName is required" }, { status: 400 });
  }

  try {
    const session = await getSession();
    const installTarget = requireConnection(session, "installTarget");
    const { sourceName } = await startConsume(
      installTarget.host,
      installTarget.token,
      DATABASE_NAME,
      body.blobName
    );
    return NextResponse.json({ sourceName });
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
