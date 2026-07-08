"use client";

import { useCallback, useEffect, useState } from "react";
import { mdiRefresh } from "@mdi/js";
import { toast } from "sonner";
import { Icon } from "@/lib/icon";
import { Button } from "@/components/ui/button";
import { EmptyStates } from "@/components/ui/empty-states";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BlobSummary } from "@/lib/sitecore/itemTransfer";

export function BlobManager() {
  const [blobs, setBlobs] = useState<BlobSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/explorer/blobs", { cache: "no-store" });
      const body = await response.json();
      if (response.ok) setBlobs(body.blobs);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (blobName: string) => {
    const response = await fetch(`/api/explorer/blobs/${encodeURIComponent(blobName)}`, {
      method: "DELETE",
    });
    const body = await response.json();
    if (!response.ok) {
      toast.error(body.error ?? "Failed to delete blob");
      return;
    }
    toast.success("Blob deleted");
    load();
  };

  const refreshButton = (
    <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
      <Icon path={mdiRefresh} size={0.8} className={refreshing ? "animate-spin" : undefined} />
      Refresh
    </Button>
  );

  if (blobs === null) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (blobs.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{refreshButton}</div>
        <EmptyStates
          variant="nothing-created"
          title="No blobs"
          description="Uploaded and generated transfer packages will appear here."
          actions={<></>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">{refreshButton}</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Blob name</TableHead>
            <TableHead>State</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {blobs.map((blob) => (
            <TableRow key={blob.blobName}>
              <TableCell className="font-mono text-sm">{blob.blobName}</TableCell>
              <TableCell>{blob.state}</TableCell>
              <TableCell>
                <Button variant="outline" size="sm" onClick={() => handleDelete(blob.blobName)}>
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
