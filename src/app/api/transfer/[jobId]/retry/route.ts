import { NextResponse } from "next/server";
import { getJob, resetJob } from "@/lib/sitecore/orchestrator";

export async function POST(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const updated = resetJob(job);
  return NextResponse.json({ job: updated });
}
