import { NextResponse } from "next/server";
import { getSession, requireConnection, SessionError } from "@/lib/session";
import { getJob, isJobComplete, stepJob } from "@/lib/sitecore/orchestrator";

export async function POST(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (isJobComplete(job)) {
    return NextResponse.json({ job, complete: true });
  }

  try {
    const session = await getSession();
    const source = requireConnection(session, "source");
    const destination = requireConnection(session, "destination");
    const updated = await stepJob(job, source, destination);
    return NextResponse.json({ job: updated, complete: isJobComplete(updated) });
  } catch (error) {
    if (error instanceof SessionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
