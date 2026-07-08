import { randomUUID } from "node:crypto";
import { getIronSession, type IronSession } from "iron-session";
import { cookies } from "next/headers";
import type { Role } from "@/lib/types";

export type { Role };

export interface EnvironmentConnection {
  host: string;
  token: string;
  expiresAt: number;
}

export interface SessionData {
  source?: EnvironmentConnection;
  destination?: EnvironmentConnection;
}

function requireSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET env var must be set to a random string of at least 32 characters. See .env.example."
    );
  }
  return secret;
}

const SESSION_TTL_MS = 60 * 60 * 4 * 1000;

const cookieOptions = {
  cookieName: "content-migration-session",
  password: requireSessionSecret(),
  ttl: SESSION_TTL_MS / 1000,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
  },
};

interface SessionCookieData {
  sessionId?: string;
}

// Sitecore client-credentials JWTs can carry enough org/resource-access claims to
// be several KB on their own -- sealing even one of them already overflows
// iron-session's ~4KB cookie ceiling ("Cookie length is too big"), so the
// connection data (host + JWT) can't live in the cookie at all. The cookie now
// holds only a small opaque session ID; the connections themselves live in this
// single-process, in-memory store -- the same acceptable-for-an-internal-tool
// tradeoff already used for the job store in orchestrator.ts (cleared on
// restart, never touches disk or a database, not multi-instance-safe).
//
// Pinned to globalThis rather than plain module scope: in dev, Next.js
// recompiles a route handler's module graph on edits (and can evict/reload
// on-demand entries even without edits), which would otherwise silently reset
// these Maps -- symptom: a successful connect immediately "loses" the session
// on the very next request.
interface SessionStoreGlobal {
  contentMigrationSessionStore?: Map<string, SessionData>;
  contentMigrationSessionLastSeen?: Map<string, number>;
}

const globalForSession = globalThis as unknown as SessionStoreGlobal;

const store = globalForSession.contentMigrationSessionStore ?? new Map<string, SessionData>();
globalForSession.contentMigrationSessionStore = store;

const lastSeenAt =
  globalForSession.contentMigrationSessionLastSeen ?? new Map<string, number>();
globalForSession.contentMigrationSessionLastSeen = lastSeenAt;

function sweepExpiredSessions(): void {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, seenAt] of lastSeenAt) {
    if (seenAt < cutoff) {
      lastSeenAt.delete(id);
      store.delete(id);
    }
  }
}

export async function getSession(): Promise<IronSession<SessionData>> {
  sweepExpiredSessions();

  const cookieStore = await cookies();
  const cookieSession = await getIronSession<SessionCookieData>(cookieStore, cookieOptions);

  let sessionId = cookieSession.sessionId;
  if (!sessionId) {
    sessionId = randomUUID();
    cookieSession.sessionId = sessionId;
    await cookieSession.save();
  }
  lastSeenAt.set(sessionId, Date.now());

  let data = store.get(sessionId);
  if (!data) {
    data = {};
    store.set(sessionId, data);
  }

  return new Proxy(data as IronSession<SessionData>, {
    get(target, prop) {
      if (prop === "save") {
        return async () => {
          await cookieSession.save();
        };
      }
      return Reflect.get(target, prop);
    },
    set(target, prop, value) {
      return Reflect.set(target, prop, value);
    },
    deleteProperty(target, prop) {
      return Reflect.deleteProperty(target, prop);
    },
  });
}

export function isConnectionValid(
  connection?: EnvironmentConnection
): connection is EnvironmentConnection {
  return !!connection && connection.expiresAt > Date.now();
}

export function requireConnection(
  session: SessionData,
  role: Role
): EnvironmentConnection {
  const connection = session[role];
  if (!isConnectionValid(connection)) {
    throw new SessionError(role, `${role} environment is not connected`);
  }
  return connection;
}

export class SessionError extends Error {
  constructor(
    public readonly role: Role,
    message: string
  ) {
    super(message);
    this.name = "SessionError";
  }
}
