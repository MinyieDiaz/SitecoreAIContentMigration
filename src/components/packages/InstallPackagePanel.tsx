"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { mdiFolderZipOutline, mdiKeyVariant, mdiShieldCheckOutline } from "@mdi/js";
import type { ClientSDK } from "@sitecore-marketplace-sdk/client";
import { Icon } from "@/lib/icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyStates } from "@/components/ui/empty-states";
import { ErrorStates } from "@/components/ui/error-states";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { CardTabsList, CardTabsTrigger } from "@/components/common/CardTabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EnvironmentSelect } from "@/components/environments/EnvironmentSelect";
import { EnvironmentCard } from "@/components/wizard/EnvironmentCard";
import { ChunkSetTable } from "@/components/jobs/ChunkSetTable";
import { JobProgress } from "@/components/jobs/JobProgress";
import { useMarketplaceContext } from "@/components/marketplace/MarketplaceProvider";
import { useEnvironments } from "@/hooks/use-environments";
import { useInstallPackage } from "@/hooks/use-install-package";
import { credentialedInstallDestination, sdkInstallDestination } from "@/lib/packages/installDestination";
import { hasUnconfirmedConsume } from "@/lib/consume";
import { installPackageProgress } from "@/lib/jobs";
import { MERGE_STRATEGY_LABELS, SCOPE_LABELS } from "@/lib/labels";
import { readPackageArchive } from "@/lib/packages/archive";
import { getSitecoreContextId } from "@/lib/sitecore/xmcContext";
import type { ResourceAccessEntry } from "@/hooks/use-marketplace-client";
import type { InstallPackageJob, PackageManifest } from "@/lib/types";

type AuthMode = "granted" | "credentials";

export function InstallPackagePanel() {
  const { client, resourceAccess, isLoading, isInitialized, error, notEmbedded, initialize } =
    useMarketplaceContext();
  const { installTarget, connect, disconnect } = useEnvironments();
  const [authMode, setAuthMode] = useState<AuthMode>("granted");
  const [target, setTarget] = useState<ResourceAccessEntry | null>(null);
  const [manifest, setManifest] = useState<PackageManifest | null>(null);
  const [getChunk, setGetChunk] = useState<((chunkSetId: string, chunkId: number) => Uint8Array) | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const destinationContextId = target ? getSitecoreContextId(target) : "";
  // Hooks must run every render regardless of the early returns below; client
  // is only null before the Marketplace handshake completes, by which point
  // `target` (and therefore the Install button) can't be set yet either.
  const destination = useMemo(
    () =>
      authMode === "credentials"
        ? credentialedInstallDestination()
        : sdkInstallDestination(client as ClientSDK, destinationContextId),
    [authMode, client, destinationContextId]
  );
  const canInstall = authMode === "credentials" ? installTarget.connected : !!target;
  const { job, running, start, canResume, resume, startOver } = useInstallPackage(
    destination,
    getChunk ??
      (() => {
        throw new Error("No package loaded");
      })
  );
  const notifiedRef = useRef<InstallPackageJob["status"] | null>(null);

  useEffect(() => {
    if (!job || !running) return;
    if (job.status !== "done" && job.status !== "done-with-errors" && job.status !== "failed") return;
    if (notifiedRef.current === job.status) return;
    notifiedRef.current = job.status;
    if (job.status === "failed") toast.error("Install failed");
    else if (job.status === "done-with-errors") toast.warning("Install finished with errors");
    else if (hasUnconfirmedConsume(job.chunkSets)) toast.success("Package submitted for install");
    else toast.success("Package installed");
  }, [job, running]);

  const handleFile = async (file: File | null) => {
    setFileError(null);
    setManifest(null);
    setGetChunk(null);
    setFileName(file?.name ?? null);
    if (!file) return;
    try {
      const result = await readPackageArchive(file);
      setManifest(result.manifest);
      setGetChunk(() => result.getChunk);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Failed to read package file");
    }
  };

  if (notEmbedded) {
    return (
      <ErrorStates
        variant="generic"
        title="Open this app from the Sitecore Cloud Portal"
        description="Packages reads its connected environments from the Marketplace host, so it only works when opened inside Sitecore Cloud Portal."
        actions={<></>}
      />
    );
  }

  if (isLoading || !isInitialized) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (error) {
    return (
      <ErrorStates
        variant="generic"
        title="Couldn't connect to the Marketplace host"
        description={error.message}
        actions={
          <Button variant="link" onClick={() => initialize()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <FieldGroup className="mt-0">
        <Field>
          <FieldContent>
            <FieldLabel htmlFor="package-file">Package file</FieldLabel>
          </FieldContent>
          <input
            ref={fileInputRef}
            id="package-file"
            type="file"
            accept=".zip"
            className="sr-only"
            onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
          />
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Icon path={mdiFolderZipOutline} size={0.85} />
              {fileName ? "Choose a different file" : "Choose file"}
            </Button>
            <p className="text-sm text-muted-foreground">
              {fileName ?? "No file selected — pick a .scpkg.zip generated from Packages → Generate"}
            </p>
          </div>
        </Field>
      </FieldGroup>
      {fileError && <p className="text-sm text-danger-fg">{fileError}</p>}

      {manifest && (
        <div className="space-y-4">
          <Card style="outline" padding="sm">
            <CardHeader>
              <CardTitle>Package summary</CardTitle>
              <CardDescription>
                Scope and merge strategy were fixed when this package was generated and can&apos;t be changed
                here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">
                <span className="font-medium">Source: </span>
                {manifest.sourceEnvironment}
              </p>
              <p className="text-sm">
                <span className="font-medium">Created: </span>
                {new Date(manifest.createdAt).toLocaleString()}
              </p>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Merge strategy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {manifest.items.map((item) => (
                    <TableRow key={item.path}>
                      <TableCell>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">{item.path}</p>
                      </TableCell>
                      <TableCell>{SCOPE_LABELS[item.scope]}</TableCell>
                      <TableCell>{MERGE_STRATEGY_LABELS[item.mergeStrategy]}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Tabs value={authMode} onValueChange={(value) => setAuthMode(value as AuthMode)}>
            <CardTabsList columns={2}>
              <CardTabsTrigger
                value="granted"
                icon={mdiShieldCheckOutline}
                title="Granted environment"
                description="Install into an environment this app is already authorized for"
              />
              <CardTabsTrigger
                value="credentials"
                icon={mdiKeyVariant}
                title="Connect with credentials"
                description="Install into any environment using automation client credentials"
              />
            </CardTabsList>

            <TabsContent value="granted" className="space-y-3">
              {resourceAccess.length === 0 ? (
                <EmptyStates
                  variant="nothing-created"
                  title="No environments granted"
                  description="This app installation has no granted environments to install into. Use Connect with credentials instead."
                  actions={<></>}
                />
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Limited to environments this app installation was granted — that&apos;s why the credentials
                    option exists.
                  </p>
                  <div className="max-w-md">
                    <EnvironmentSelect
                      label="Target environment"
                      placeholder="Select the environment to install into"
                      resourceAccess={resourceAccess}
                      value={target}
                      onChange={setTarget}
                    />
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="credentials" className="space-y-3">
              <p className="text-sm text-muted-foreground">
                The credential needs Content Transfer <em>and</em> Item Transfer access on the target
                environment — an Explorer-only credential that only proves Item Transfer access may not be
                enough to authorize this install.
              </p>
              <div className="max-w-md">
                <EnvironmentCard
                  role="installTarget"
                  title="Install target"
                  description="Automation client credentials for the environment to install into."
                  status={installTarget}
                  onConnect={(host, clientId, clientSecret) =>
                    connect("installTarget", host, clientId, clientSecret)
                  }
                  onDisconnect={() => disconnect("installTarget")}
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {job && (
        <Card style="outline" padding="sm">
          <CardHeader>
            <CardTitle>Install job</CardTitle>
          </CardHeader>
          <CardContent>
            <JobProgress
              status={job.status}
              progress={installPackageProgress(job)}
              error={job.error}
              onRetry={canResume ? resume : startOver}
              retryLabel={canResume ? "Resume" : "Retry"}
              onStartOver={canResume ? startOver : undefined}
              doneContent={
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    {hasUnconfirmedConsume(job.chunkSets)
                      ? "All parts were submitted to the destination, which doesn't report import status on this route — it can take a few moments to finish landing. Check the "
                      : "The destination finished importing every part. See the "}
                    <Link href="/explorer" className="underline">
                      Explorer
                    </Link>{" "}
                    for transfer status and history.
                  </p>
                  {job.chunkSets?.some((chunkSet) => chunkSet.sourceName) && (
                    <ul className="list-inside list-disc">
                      {job.chunkSets
                        .filter((chunkSet) => chunkSet.sourceName)
                        .map((chunkSet) => (
                          <li key={chunkSet.chunkSetId}>
                            <Link href="/explorer" className="underline">
                              {chunkSet.sourceName}
                            </Link>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              }
            />
            {job.chunkSets && <ChunkSetTable chunkSets={job.chunkSets} />}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-end gap-3">
        <p className="text-sm text-muted-foreground">
          If an install fails partway, Resume continues from the failed step while this page stays open.
        </p>
        <Button
          onClick={() => manifest && start(manifest)}
          disabled={!manifest || !canInstall || running || job?.status === "done" || job?.status === "done-with-errors"}
        >
          Install package
        </Button>
      </div>
    </div>
  );
}
