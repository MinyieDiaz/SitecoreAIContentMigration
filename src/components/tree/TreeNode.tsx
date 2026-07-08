"use client";

import { mdiChevronRight, mdiFileDocumentOutline, mdiFolderOutline } from "@mdi/js";
import { useState } from "react";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { Icon } from "@/lib/icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getItemChildren } from "@/lib/sitecore/xmcAuthoring";
import type { TreeNode as TreeNodeData } from "@/lib/types";

interface TreeNodeProps {
  client: ClientSDK;
  sitecoreContextId: string;
  node: TreeNodeData;
  depth: number;
  isSelected: (path: string) => boolean;
  onToggle: (node: TreeNodeData, checked: boolean) => void;
}

export function TreeNode({ client, sitecoreContextId, node, depth, isSelected, onToggle }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [children, setChildren] = useState<TreeNodeData[] | null>(null);

  const handleExpand = async () => {
    if (!node.hasChildren) return;

    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);
    if (children !== null) return;

    setLoading(true);
    setError(null);
    try {
      const nodes = await getItemChildren(client, sitecoreContextId, node.path);
      setChildren(nodes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load children");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div
        className="flex items-center gap-1 rounded-md py-1 hover:bg-neutral-bg"
        style={{ paddingLeft: `${depth * 1.25}rem` }}
      >
        <Button
          variant="ghost"
          size="icon-xs"
          className={cn(!node.hasChildren && "invisible")}
          onClick={handleExpand}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          <Icon
            path={mdiChevronRight}
            size={0.75}
            className={cn("transition-transform", expanded && "rotate-90")}
          />
        </Button>
        <Checkbox
          checked={isSelected(node.path)}
          onCheckedChange={(checked) => onToggle(node, checked === true)}
          aria-label={`Select ${node.name}`}
        />
        <Icon
          path={node.hasChildren ? mdiFolderOutline : mdiFileDocumentOutline}
          size={0.75}
          className="text-muted-foreground shrink-0"
        />
        <button
          type="button"
          className="truncate text-left text-sm"
          onClick={handleExpand}
          title={node.path}
        >
          {node.name}
        </button>
      </div>

      {expanded && (
        <div>
          {loading && (
            <div style={{ paddingLeft: `${(depth + 1) * 1.25}rem` }} className="py-1">
              <Skeleton className="h-5 w-40" />
            </div>
          )}
          {error && (
            <p
              style={{ paddingLeft: `${(depth + 1) * 1.25}rem` }}
              className="py-1 text-sm text-danger-fg"
            >
              {error}
            </p>
          )}
          {children?.map((child) => (
            <TreeNode
              key={child.itemId}
              client={client}
              sitecoreContextId={sitecoreContextId}
              node={child}
              depth={depth + 1}
              isSelected={isSelected}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
