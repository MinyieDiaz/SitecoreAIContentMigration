export type Role = "source" | "destination";

export const DEFAULT_ROOT_PATH = "/sitecore/content";

export type TransferScope = "SingleItem" | "ItemAndDescendants";

export type MergeStrategy =
  | "OverrideExistingItem"
  | "KeepExistingItem"
  | "LatestWin"
  | "OverrideExistingTree";

export interface TreeNode {
  itemId: string;
  name: string;
  path: string;
  hasChildren: boolean;
}

export interface SiteSummary {
  name: string;
  rootPath: string;
}

export interface SelectedItem {
  itemId: string;
  path: string;
  name: string;
  scope: TransferScope;
  mergeStrategy: MergeStrategy;
}

// "done" means every item's consume request was successfully submitted to the
// destination -- not that the destination has confirmed it finished writing the
// data. See the note on JobStatus below for why the job intentionally doesn't
// wait for that confirmation.
export type JobStatus = "pending" | "transferring-chunks" | "consuming" | "done" | "failed";

// The Content Transfer API creates one chunk set per nominated data tree (i.e. one
// per selected item), and each chunk set becomes its own .raif file that the Item
// Transfer API consumes independently -- there is no batched "single blob" for a
// multi-item transfer. ChunkSetProgress entries are index-aligned with
// TransferJob.items: the confirmed OpenAPI spec doesn't echo back which item a
// chunk set came from, so order-of-submission is the only correlation available.
//
// consumeRequested (rather than a resolved destination source name): the
// Marketplace SDK's `xmc.contentTransfer.consumeFile` has no response body and
// no headers exposed to app code, unlike the raw Item Transfer API's `location`
// header this app used to parse a `sourceName` out of. Nothing today actually
// correlates a wizard job to a specific Explorer transfer row, so a boolean
// "was consume requested" is all that's needed to gate the job as done.
export interface ChunkSetProgress {
  chunkSetId: string;
  chunkCount: number;
  chunksTransferred: number;
  completed: boolean;
  blobName?: string;
  consumeRequested?: boolean;
}

export interface TransferJob {
  jobId: string;
  createdAt: number;
  items: SelectedItem[];
  status: JobStatus;
  sourceTransferId?: string;
  chunkSets?: ChunkSetProgress[];
  error?: string;
}
