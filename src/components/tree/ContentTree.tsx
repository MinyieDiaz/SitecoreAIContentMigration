"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFAULT_ROOT_PATH, type Role, type SiteSummary, type TreeNode as TreeNodeData } from "@/lib/types";
import { TreeNode } from "./TreeNode";

interface ContentTreeProps {
  role: Role;
  isSelected: (path: string) => boolean;
  onToggle: (node: TreeNodeData, checked: boolean) => void;
}

export function ContentTree({ role, isSelected, onToggle }: ContentTreeProps) {
  const [rootNodes, setRootNodes] = useState<TreeNodeData[] | null>(null);
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      setRootNodes(null);
      try {
        const [treeResponse, sitesResponse] = await Promise.all([
          fetch(`/api/tree?role=${role}&path=${encodeURIComponent(DEFAULT_ROOT_PATH)}`),
          fetch(`/api/sites?role=${role}`),
        ]);
        const treeBody = await treeResponse.json();
        if (!treeResponse.ok) throw new Error(treeBody.error ?? "Failed to load content tree");

        const sitesBody = await sitesResponse.json();
        if (!cancelled) {
          setRootNodes(treeBody.children as TreeNodeData[]);
          if (sitesResponse.ok) setSites(sitesBody.sites as SiteSummary[]);
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
  }, [role]);

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
            role={role}
            node={node}
            depth={0}
            isSelected={isSelected}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}
