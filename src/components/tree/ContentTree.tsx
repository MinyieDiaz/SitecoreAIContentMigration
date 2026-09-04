"use client";

import { useEffect, useState } from "react";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFAULT_ROOT_PATH, type SiteSummary, type TreeNode as TreeNodeData } from "@/lib/types";
import { getItemChildren, listSites } from "@/lib/sitecore/xmcAuthoring";
import { TreeNode } from "./TreeNode";

interface ContentTreeProps {
  client: ClientSDK;
  sitecoreContextId: string;
  isSelected: (path: string) => boolean;
  onToggle: (node: TreeNodeData, checked: boolean) => void;
}

export function ContentTree({ client, sitecoreContextId, isSelected, onToggle }: ContentTreeProps) {
  const [rootNodes, setRootNodes] = useState<TreeNodeData[] | null>(null);
  const [rootCursor, setRootCursor] = useState<string | null>(null);
  const [rootHasNextPage, setRootHasNextPage] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      setRootNodes(null);
      try {
        const [page, siteList] = await Promise.all([
          getItemChildren(client, sitecoreContextId, DEFAULT_ROOT_PATH),
          listSites(client, sitecoreContextId).catch(() => []),
        ]);
        if (!cancelled) {
          setRootNodes(page.nodes);
          setRootCursor(page.endCursor);
          setRootHasNextPage(page.hasNextPage);
          setSites(siteList);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load content tree");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [client, sitecoreContextId]);

  const loadMore = async () => {
    if (!rootCursor) return;
    setLoadingMore(true);
    try {
      const page = await getItemChildren(client, sitecoreContextId, DEFAULT_ROOT_PATH, rootCursor);
      setRootNodes((nodes) => [...(nodes ?? []), ...page.nodes]);
      setRootCursor(page.endCursor);
      setRootHasNextPage(page.hasNextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more items");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-3">
      {sites.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Sites in this environment:</span>
          {sites.map((site) => (
            <Badge key={site.name} colorScheme="neutral">
              {site.name}
            </Badge>
          ))}
        </div>
      )}

      <div className="rounded-md border p-2">
        {error && <p className="p-2 text-sm text-danger-fg">{error}</p>}
        {!error && rootNodes === null && (
          <div className="space-y-2 p-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-44" />
          </div>
        )}
        {rootNodes?.map((node) => (
          <TreeNode
            key={node.itemId}
            client={client}
            sitecoreContextId={sitecoreContextId}
            node={node}
            depth={0}
            isSelected={isSelected}
            onToggle={onToggle}
          />
        ))}
        {rootHasNextPage && (
          <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        )}
      </div>
    </div>
  );
}
