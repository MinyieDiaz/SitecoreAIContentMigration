import { NextResponse } from "next/server";
import { getSession, requireConnection, SessionError } from "@/lib/session";
import { createJob } from "@/lib/sitecore/orchestrator";
import type { SelectedItem } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as { items?: SelectedItem[] };

  if (!body.items?.length) {
    return NextResponse.json({ error: "At least one item must be selected" }, { status: 400 });
  }

  try {
    const session = await getSession();
    requireConnection(session, "source");
    requireConnection(session, "destination");
  } catch (error) {
    if (error instanceof SessionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  const job = createJob(body.items);
  return NextResponse.json({ job });
}
