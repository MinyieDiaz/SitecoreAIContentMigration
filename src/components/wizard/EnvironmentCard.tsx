"use client";

import { useState } from "react";
import { mdiCheckCircle } from "@mdi/js";
import { toast } from "sonner";
import { Icon } from "@/lib/icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { EnvironmentStatus } from "@/hooks/use-environments";
import type { Role } from "@/lib/types";

interface EnvironmentCardProps {
  role: Role;
  title: string;
  description: string;
  status: EnvironmentStatus;
  onConnect: (host: string, clientId: string, clientSecret: string) => Promise<unknown>;
  onDisconnect: () => Promise<void>;
}

export function EnvironmentCard({
  role,
  title,
  description,
  status,
  onConnect,
  onDisconnect,
}: EnvironmentCardProps) {
  const [host, setHost] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await onConnect(host, clientId, clientSecret);
      setClientSecret("");
      toast.success(`${title} connected`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to connect");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          {status.connected && (
            <Badge colorScheme="success">
              <Icon path={mdiCheckCircle} size={0.7} className="mr-1" />
              Connected
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        {status.connected ? (
          <div className="space-y-3">
            <p className="text-sm">
              Host: <span className="font-medium">{status.host}</span>
            </p>
            <Button variant="outline" size="sm" onClick={onDisconnect}>
              Disconnect
            </Button>
          </div>
        ) : (
          <FieldGroup className="mt-0">
            <Field>
              <FieldContent>
                <FieldLabel htmlFor={`${role}-host`}>Environment host</FieldLabel>
              </FieldContent>
              <Input
                id={`${role}-host`}
                placeholder="my-environment.sitecorecloud.io"
                value={host}
                onChange={(event) => setHost(event.target.value)}
              />
            </Field>
            <Field>
              <FieldContent>
                <FieldLabel htmlFor={`${role}-client-id`}>Client ID</FieldLabel>
              </FieldContent>
              <Input
                id={`${role}-client-id`}
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
              />
            </Field>
            <Field>
              <FieldContent>
                <FieldLabel htmlFor={`${role}-client-secret`}>Client secret</FieldLabel>
              </FieldContent>
              <Input
                id={`${role}-client-secret`}
                type="password"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
              />
            </Field>
            <Button
              onClick={handleConnect}
              disabled={connecting || !host || !clientId || !clientSecret}
            >
              {connecting && <Spinner className="mr-2 size-4" />}
              Test connection
            </Button>
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  );
}
