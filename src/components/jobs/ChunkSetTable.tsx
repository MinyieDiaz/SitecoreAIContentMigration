"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ChunkSetProgress } from "@/lib/types";

// Per chunk set ("part"), not per selected item -- the source decides how
// selected items are grouped into parts. Shared by the wizard's transfer job
// and Packages' install job.
export function ChunkSetTable({ chunkSets }: { chunkSets: ChunkSetProgress[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Part</TableHead>
          <TableHead>Items</TableHead>
          <TableHead>Chunks</TableHead>
          <TableHead>Destination</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {chunkSets.map((chunkSet, index) => (
          <TableRow key={chunkSet.chunkSetId}>
            <TableCell>
              {index + 1} of {chunkSets.length}
            </TableCell>
            <TableCell>{chunkSet.totalItemCount ?? "—"}</TableCell>
            <TableCell>
              {chunkSet.chunksTransferred} / {chunkSet.chunkCount}
            </TableCell>
            {/* Raw GetBlobState value, so an unexpected response shape is visible. */}
            <TableCell>{chunkSet.destinationState ?? (chunkSet.consumeRequested ? "Submitted" : "—")}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
