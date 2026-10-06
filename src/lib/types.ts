// The wizard's source/destination roles, plus installTarget for Packages'
// credentialed install (see docs/plans/credentialed-install.md) -- kept
// separate from "destination" so connecting in Packages can't silently
// re-point the Explorer, which reads "destination" too.
export const ROLES = ["source", "destination", "installTarget"] as const;
export type Role = (typeof ROLES)[number];

export const DEFAULT_ROOT_PATH = "/sitecore";

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

// "done" means every .raif was either reported Transferred (via GetBlobState)
// or submitted with no status available ("unconfirmed" -- Review says so);
// "done-with-errors" means at least one finished as TransferredWithErrors --
// partial success, details in the Explorer.
export type JobStatus =
  | "pending"
  | "preparing"
  | "transferring-chunks"
  | "consuming"
  | "done"
  | "done-with-errors"
  | "failed";

// "unconfirmed": the consume was accepted, but the destination never reported
// a status for the .raif -- the pre-GetBlobState "submitted" behavior.
export type ConsumeOutcome = "transferred" | "transferred-with-errors" | "error" | "unconfirmed";

// The Content Transfer API splits a transfer into one or more chunk sets, and
// each chunk set becomes its own .raif file that the Item Transfer API consumes
// independently. Chunk sets are NOT one per selected item -- a live two-item
// transfer came back as a single chunk set -- and the status response doesn't
// say which items each one holds, so nothing here may assume chunkSets[i]
// corresponds to items[i].
//
// consumeRequested (rather than a resolved destination source name): the
// Marketplace SDK's `xmc.contentTransfer.consumeFile` has no response body and
// no headers exposed to app code, unlike the raw Item Transfer API's `location`
// header this app used to parse a `sourceName` out of. The outcome is tracked
// by blobName instead, through GetBlobState (destinationState/consumeOutcome).
export interface ChunkSetProgress {
  chunkSetId: string;
  chunkCount: number;
  // From the source's status response once the transfer is prepared -- shown
  // per chunk set on Review, and baked into package manifests.
  totalItemCount?: number;
  chunksTransferred: number;
  completed: boolean;
  blobName?: string;
  consumeRequested?: boolean;
  consumeStartedAt?: number;
  // Latest raw state GetBlobState reported -- shown as-is on Review.
  destinationState?: string;
  // Set once the destination reaches a terminal state for this chunk set.
  consumeOutcome?: ConsumeOutcome;
  // Resolved once the source transfer is prepared (resolveChunkSetIsMedia in
  // clientTransfer.ts); package manifests carry it through to install time.
  isMedia?: boolean;
  // Only populated by the credentialed install destination -- the raw Item
  // Transfer API's startConsume returns a `location` header carrying this,
  // unlike the SDK path's consumeFile which exposes no response at all (see
  // docs/plans/credentialed-install.md). Null means consume succeeded but the
  // header was missing; undefined means this chunk set hasn't consumed yet.
  sourceName?: string | null;
}

export interface TransferJob {
  jobId: string;
  createdAt: number;
  items: SelectedItem[];
  status: JobStatus;
  sourceTransferId?: string;
  // When the "preparing" phase started -- bounds how long we wait for the
  // source to finish building the transfer.
  preparingSince?: number;
  chunkSets?: ChunkSetProgress[];
  error?: string;
  // The phase whose step threw, so Resume can pick up there with the same
  // source transfer and chunk progress. Unset when the job failed because the
  // destination reported an import error -- resuming can't change that.
  failedAt?: JobStatus;
}

// Bumped whenever the package zip layout or manifest shape changes in a way
// that breaks reading older packages -- readPackageArchive refuses anything
// else rather than guessing at a shape it wasn't written for.
export const PACKAGE_FORMAT_VERSION = 1;

// isMedia is resolved at generate time (from the item path, same as the
// wizard's stepTransferringChunks) and baked into the manifest, because at
// install time the originating item path is only known through the manifest
// itself -- there is nothing left to re-derive it from.
export interface PackageChunkSetManifest {
  chunkSetId: string;
  chunkCount: number;
  totalItemCount: number;
  isMedia: boolean;
  itemIndex: number;
}

export interface PackageManifest {
  formatVersion: number;
  packageId: string;
  createdAt: string;
  sourceEnvironment: string;
  // Reused verbatim at install time -- the destination blob is named
  // contentTransfer-{transferId}-{chunkSetId}.raif, so keeping the original
  // id keeps the archived chunk bytes and their addressing consistent.
  transferId: string;
  items: SelectedItem[];
  chunkSets: PackageChunkSetManifest[];
}

export type PackageJobStatus =
  | "pending"
  | "preparing"
  | "transferring-chunks"
  | "packaging"
  | "consuming"
  | "done"
  | "done-with-errors"
  | "failed";

export interface GeneratePackageJob {
  jobId: string;
  createdAt: number;
  items: SelectedItem[];
  status: Exclude<PackageJobStatus, "consuming" | "done-with-errors">;
  sourceTransferId?: string;
  preparingSince?: number;
  chunkSets?: ChunkSetProgress[];
  error?: string;
}

export interface InstallPackageJob {
  jobId: string;
  createdAt: number;
  manifest: PackageManifest;
  status: InstallJobStatus;
  chunkSets?: ChunkSetProgress[];
  error?: string;
  // Same meaning as TransferJob.failedAt.
  failedAt?: InstallJobStatus;
}

type InstallJobStatus = Exclude<PackageJobStatus, "packaging" | "preparing">;
