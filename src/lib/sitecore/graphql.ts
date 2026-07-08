import { DEFAULT_ROOT_PATH, type SiteSummary, type TreeNode } from "@/lib/types";

export { DEFAULT_ROOT_PATH };

export class GraphQLRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphQLRequestError";
  }
}

const SITES_QUERY = `
  query Sites {
    sites {
      name
    }
  }
`;

// Sites are exposed as flat { name } records by the Authoring & Management GraphQL
// schema; there's no confirmed field for a site's content root path, so navigation
// always starts at /sitecore/content and the user drills down from there. Site
// names are surfaced as a hint, not as a resolved shortcut path.
const CHILDREN_QUERY = `
  query ItemChildren($path: String!) {
    item(where: { path: $path, database: "master" }) {
      itemId
      name
      path
      hasChildren
      children {
        nodes {
          itemId
          name
          path
          hasChildren
        }
      }
    }
  }
`;

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function executeGraphQL<T>(
  host: string,
  token: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`https://${host}/sitecore/api/authoring/graphql/v1/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new GraphQLRequestError(
      `GraphQL request to ${host} failed with status ${response.status}`
    );
  }

  const body = (await response.json()) as GraphQLResponse<T>;

  if (body.errors?.length) {
    throw new GraphQLRequestError(body.errors.map((error) => error.message).join("; "));
  }
  if (!body.data) {
    throw new GraphQLRequestError("GraphQL response contained no data");
  }
  return body.data;
}

export async function listSites(host: string, token: string): Promise<SiteSummary[]> {
  const data = await executeGraphQL<{ sites: { name: string }[] }>(host, token, SITES_QUERY);
  return data.sites.map((site) => ({ name: site.name, rootPath: DEFAULT_ROOT_PATH }));
}

export async function getItemChildren(
  host: string,
  token: string,
  path: string
): Promise<TreeNode[]> {
  const data = await executeGraphQL<{
    item: {
      itemId: string;
      name: string;
      path: string;
      hasChildren: boolean;
      children: { nodes: TreeNode[] };
    } | null;
  }>(host, token, CHILDREN_QUERY, { path });

  if (!data.item) {
    throw new GraphQLRequestError(`Item not found at path "${path}"`);
  }
  return data.item.children.nodes;
}
