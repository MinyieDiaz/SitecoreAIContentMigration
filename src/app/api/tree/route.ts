import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_ROOT_PATH, getItemChildren, GraphQLRequestError } from "@/lib/sitecore/graphql";
import { getSession, requireConnection, SessionError } from "@/lib/session";

export async function GET(request: NextRequest) {
  const role = request.nextUrl.searchParams.get("role");
  const path = request.nextUrl.searchParams.get("path") ?? DEFAULT_ROOT_PATH;

  if (role !== "source" && role !== "destination") {
    return NextResponse.json({ error: "role query param must be 'source' or 'destination'" }, { status: 400 });
  }

  try {
    const session = await getSession();
    const connection = requireConnection(session, role);
    const children = await getItemChildren(connection.host, connection.token, path);
    return NextResponse.json({ path, children });
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
