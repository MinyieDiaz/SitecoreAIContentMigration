import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { DEFAULT_ROOT_PATH, type SiteSummary, type TreeNode } from "@/lib/types";

export { DEFAULT_ROOT_PATH };

export class GraphQLRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphQLRequestError";
  }
}

// Sites are exposed as flat { name } records by the Authoring & Management GraphQL
// schema; there's no confirmed field for a site's content root path, so navigation
// always starts at /sitecore (the full content tree, including /sitecore/templates,
// /sitecore/layouts, /sitecore/media library, /sitecore/system, etc.) and the user
// drills down from there. Site names are surfaced as a hint, not as a resolved
// shortcut path.
const SITES_QUERY = `
  query Sites {
    sites {
      name
    }
  }
`;

// `children` is paginated by the Authoring GraphQL API -- with no `first`
// passed, the server applies its own default page size, which is what capped
// the content tree at 50 items regardless of how many children an item
// actually had. `first`/`after`/`pageInfo { hasNextPage, endCursor }` is the
// standard Relay-style connection shape Sitecore's GraphQL APIs use elsewhere;
// this isn't independently confirmed for this specific field (the SDK's
// xmc.authoring.graphql bridge is a raw untyped passthrough with no local
// schema to check against), so a wrong argument name here will surface as a
// loud GraphQL error rather than a silent bad read.
const PAGE_SIZE = 100;

const CHILDREN_QUERY = `
  query ItemChildren($path: String!, $after: String) {
    item(where: { path: $path, database: "master" }) {
      itemId
      name
      path
      hasChildren
      children(first: ${PAGE_SIZE}, after: $after) {
        nodes {
          itemId
          name
          path
          hasChildren
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

// `xmc.authoring.graphql` proxies a hey-api-generated function through the
// Marketplace host, so a successful `client.mutate()` call resolves to
// `{ data: <parsed GraphQL body>, response }`, not the parsed body directly --
// and a failed one resolves to `{ data: undefined, error, response }`. This
// double layer (SDK transport result wrapping the GraphQL response body) is
// inferred from the SDK's type declarations and hasn't been exercised against a
// real Marketplace app installation yet.
async function executeAuthoringGraphQL<T>(
  client: ClientSDK,
  sitecoreContextId: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const result = await client.mutate("xmc.authoring.graphql", {
    params: { query: { sitecoreContextId }, body: { query, variables } },
  });

  if ("error" in result && result.error) {
    throw new GraphQLRequestError(
      typeof result.error === "string" ? result.error : "GraphQL request failed"
    );
  }

  const body = result.data as GraphQLResponse<T> | undefined;
  if (body?.errors?.length) {
    throw new GraphQLRequestError(body.errors.map((error) => error.message).join("; "));
  }
  if (!body?.data) {
    throw new GraphQLRequestError("GraphQL response contained no data");
  }
  return body.data;
}

export async function listSites(client: ClientSDK, sitecoreContextId: string): Promise<SiteSummary[]> {
  const data = await executeAuthoringGraphQL<{ sites: { name: string }[] }>(
    client,
    sitecoreContextId,
    SITES_QUERY
  );
  return data.sites.map((site) => ({ name: site.name, rootPath: DEFAULT_ROOT_PATH }));
}

export interface ItemChildrenPage {
  nodes: TreeNode[];
  hasNextPage: boolean;
  endCursor: string | null;
}

export async function getItemChildren(
  client: ClientSDK,
  sitecoreContextId: string,
  path: string,
  after?: string
): Promise<ItemChildrenPage> {
  const data = await executeAuthoringGraphQL<{
    item: {
      itemId: string;
      name: string;
      path: string;
      hasChildren: boolean;
      children: { nodes: TreeNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
    } | null;
  }>(client, sitecoreContextId, CHILDREN_QUERY, { path, after });

  if (!data.item) {
    throw new GraphQLRequestError(`Item not found at path "${path}"`);
  }
  return {
    nodes: data.item.children.nodes,
    hasNextPage: data.item.children.pageInfo.hasNextPage,
    endCursor: data.item.children.pageInfo.endCursor,
  };
}
