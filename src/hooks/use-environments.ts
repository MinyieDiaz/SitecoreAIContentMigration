"use client";

import { useCallback, useEffect, useState } from "react";
import type { Role } from "@/lib/types";

export interface EnvironmentStatus {
  connected: boolean;
  host?: string;
  expiresAt?: number;
}

export interface EnvironmentsState {
  source: EnvironmentStatus;
  destination: EnvironmentStatus;
}

const initialState: EnvironmentsState = {
  source: { connected: false },
  destination: { connected: false },
};

export function useEnvironments() {
  const [state, setState] = useState<EnvironmentsState>(initialState);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/environments", { cache: "no-store" });
      const body = await response.json();
      setState(body);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const connect = useCallback(
    async (role: Role, host: string, clientId: string, clientSecret: string) => {
      const response = await fetch(`/api/environments/${role}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, clientId, clientSecret }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Failed to connect");
      await refresh();
      return body;
    },
    [refresh]
  );

  const disconnect = useCallback(
    async (role: Role) => {
      await fetch(`/api/environments/${role}`, { method: "DELETE" });
      await refresh();
    },
    [refresh]
  );

  return { ...state, loading, refresh, connect, disconnect };
}
