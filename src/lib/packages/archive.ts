import { Zip, ZipDeflate, ZipPassThrough, unzipSync } from "fflate";
import { PACKAGE_FORMAT_VERSION, type PackageManifest } from "@/lib/types";

export function packageFileName(sourceEnvironment: string): string {
  const safeSource = sourceEnvironment.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${safeSource}-${timestamp}.scpkg.zip`;
}

// Marketplace apps run inside a Cloud Portal iframe, which must carry
// allow-downloads for this click to do anything -- if it doesn't, the click
// silently no-ops with no error the caller could catch. There's nothing more
// reliable to check from app code, so this stays a plain anchor-click.
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// Chunks are stored, not deflated -- they dominate package size, and
// re-compressing them in the browser costs CPU plus a second copy of the
// data for an unpredictable gain. Only manifest.json is deflated. Chunks are
// pushed and dropped as soon as each is fetched; the accumulated parts are
// only combined into one Blob at the very end, so a multi-part Blob can be
// backed by disk instead of requiring one giant in-memory ArrayBuffer.
export class PackageArchiveWriter {
  private zip: Zip;
  private parts: Uint8Array[] = [];
  private finished: Promise<Blob>;
  private resolveFinished!: (blob: Blob) => void;
  private rejectFinished!: (error: unknown) => void;

  constructor() {
    this.finished = new Promise<Blob>((resolve, reject) => {
      this.resolveFinished = resolve;
      this.rejectFinished = reject;
    });
    this.zip = new Zip((error, data, final) => {
      if (error) {
        this.rejectFinished(error);
        return;
      }
      if (data.length) this.parts.push(data);
      if (final) {
        this.resolveFinished(new Blob(this.parts as BlobPart[], { type: "application/zip" }));
      }
    });
  }

  addChunk(chunkSetId: string, chunkId: number, data: Uint8Array): void {
    const entry = new ZipPassThrough(`chunks/${chunkSetId}/${chunkId}.bin`);
    this.zip.add(entry);
    entry.push(data, true);
  }

  async finish(manifest: PackageManifest): Promise<Blob> {
    const manifestEntry = new ZipDeflate("manifest.json");
    this.zip.add(manifestEntry);
    manifestEntry.push(new TextEncoder().encode(JSON.stringify(manifest, null, 2)), true);
    this.zip.end();
    return this.finished;
  }
}

export interface ReadPackageArchiveResult {
  manifest: PackageManifest;
  getChunk: (chunkSetId: string, chunkId: number) => Uint8Array;
}

// Parses, validates, and verifies every declared chunk is present *before*
// install starts writing to a destination -- a truncated or hand-edited
// package should fail here, not mid-install with some chunk sets already
// saved to the destination.
export async function readPackageArchive(file: File): Promise<ReadPackageArchiveResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  let entries: ReturnType<typeof unzipSync>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error("Not a valid package: the file isn't a readable zip archive");
  }

  const manifestBytes = entries["manifest.json"];
  if (!manifestBytes) throw new Error("Not a valid package: manifest.json is missing");

  let manifest: PackageManifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch {
    throw new Error("Not a valid package: manifest.json is not valid JSON");
  }

  if (manifest.formatVersion !== PACKAGE_FORMAT_VERSION) {
    throw new Error(
      `Unsupported package format version ${manifest.formatVersion} (this app reads version ${PACKAGE_FORMAT_VERSION})`
    );
  }

  for (const chunkSet of manifest.chunkSets) {
    for (let chunkId = 0; chunkId < chunkSet.chunkCount; chunkId++) {
      const path = `chunks/${chunkSet.chunkSetId}/${chunkId}.bin`;
      if (!entries[path]) {
        throw new Error(`Package is missing chunk "${path}" declared in its manifest`);
      }
    }
  }

  const getChunk = (chunkSetId: string, chunkId: number): Uint8Array => {
    const path = `chunks/${chunkSetId}/${chunkId}.bin`;
    const data = entries[path];
    if (!data) throw new Error(`Missing chunk "${path}"`);
    return data;
  };

  return { manifest, getChunk };
}
