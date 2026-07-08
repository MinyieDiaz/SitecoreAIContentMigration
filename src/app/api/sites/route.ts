import { NextRequest, NextResponse } from "next/server";
import { listSites, GraphQLRequestError } from "@/lib/sitecore/graphql";
import { getSession, requireConnection, SessionError } from "@/lib/session";

export async function GET(request: NextRequest) {
  const role = request.nextUrl.searchParams.get("role");
  if (role !== "source" && role !== "destination") {
    return NextResponse.json({ error: "role query param must be 'source' or 'destination'" }, { status: 400 });
  }

  try {
    const session = await getSession();
    const connection = requireConnection(session, role);
    const sites = await listSites(connection.host, connection.token);
    return NextResponse.json({ sites });
  } catch (error) {
    if (error instanceof SessionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof GraphQLRequestError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
