import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { RequestBudget } from "./budget.js";

/**
 * Minimal login for a handful of known users, no database.
 *
 * Users live in AUTH_USERS ("name:hash,name:hash"; hashes from
 * `npm run hash-password -w @jelph/api`). A session is a signed cookie; the
 * signature covers the user's password hash, so removing a user or changing
 * their password ends their sessions. Changing AUTH_SECRET ends all sessions.
 */

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const COOKIE_NAME = "jelph_session";
const SESSION_MS = 90 * 24 * 60 * 60 * 1000;
const KEY_LENGTH = 32;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt.${salt.toString("base64url")}.${hash.toString("base64url")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split(".");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password, Buffer.from(salt, "base64url"), expected.length);
  return timingSafeEqual(actual, expected);
}

function parseUsers(raw: string): Map<string, string> {
  const users = new Map<string, string>();
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const [name, hash] = trimmed.split(":");
    if (!name || !hash?.startsWith("scrypt.")) {
      throw new Error(`AUTH_USERS: invalid entry "${trimmed.slice(0, 20)}…"`);
    }
    users.set(name.toLowerCase(), hash);
  }
  return users;
}

function readCookie(request: FastifyRequest, name: string): string | undefined {
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

const LoginBodySchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

export async function registerAuth(app: FastifyInstance): Promise<void> {
  const production = process.env.NODE_ENV === "production";
  const users = parseUsers(process.env.AUTH_USERS ?? "");

  if (users.size === 0) {
    if (production) {
      throw new Error("AUTH_USERS is required in production (see .env.example).");
    }
    app.log.warn("AUTH_USERS not set: login disabled (development only).");
    app.get("/api/me", async () => ({ user: null, auth: "disabled" as const }));
    return;
  }

  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters (openssl rand -base64 32).");
  }

  // Compared against when the username is unknown, so timing doesn't reveal
  // which usernames exist.
  const dummyHash = await hashPassword(randomBytes(16).toString("hex"));
  // Global on purpose: valid sessions keep working while login is throttled.
  const loginBudget = new RequestBudget(10, 5 * 60 * 1000);

  function sign(payload: string, passwordHash: string): string {
    return createHmac("sha256", secret)
      .update(`${payload}|${passwordHash}`)
      .digest("base64url");
  }

  function sessionUser(request: FastifyRequest): string | null {
    const token = readCookie(request, COOKIE_NAME);
    const [payload, signature] = token?.split(".") ?? [];
    if (!payload || !signature) return null;
    try {
      const { u, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
        u?: string;
        exp?: number;
      };
      const passwordHash = u ? users.get(u) : undefined;
      if (!passwordHash || typeof exp !== "number" || exp < Date.now()) return null;
      const expected = Buffer.from(sign(payload, passwordHash));
      const actual = Buffer.from(signature);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        return null;
      }
      return u!;
    } catch {
      return null;
    }
  }

  function setSession(reply: FastifyReply, user: string): void {
    const payload = Buffer.from(
      JSON.stringify({ u: user, exp: Date.now() + SESSION_MS }),
    ).toString("base64url");
    const token = `${payload}.${sign(payload, users.get(user)!)}`;
    reply.header("Set-Cookie", cookie(token, SESSION_MS / 1000));
  }

  function cookie(value: string, maxAgeSeconds: number): string {
    return [
      `${COOKIE_NAME}=${value}`,
      "Path=/",
      `Max-Age=${maxAgeSeconds}`,
      "HttpOnly",
      "SameSite=Lax",
      ...(production ? ["Secure"] : []),
    ].join("; ");
  }

  const publicPaths = new Set(["/api/login", "/api/logout", "/api/me"]);

  // Runs before route-level hooks, so anonymous requests never touch the
  // request budget or the upstream APIs.
  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0]!;
    if (!path.startsWith("/api/") || publicPaths.has(path)) return;
    if (!sessionUser(request)) {
      return reply.code(401).send({ error: "Log eerst in." });
    }
  });

  app.get("/api/me", async (request, reply) => {
    const user = sessionUser(request);
    // Sliding session: regular use keeps you logged in.
    if (user) setSession(reply, user);
    return { user: user ? { name: user } : null, auth: "enabled" as const };
  });

  app.post("/api/login", async (request, reply) => {
    const budget = loginBudget.take();
    if (!budget.ok) {
      request.log.warn("login attempts throttled");
      return reply
        .code(429)
        .header("Retry-After", String(budget.retryAfterSeconds))
        .send({ error: "Te veel inlogpogingen. Probeer het over een paar minuten opnieuw." });
    }

    const parsed = LoginBodySchema.safeParse(request.body);
    const name = parsed.success ? parsed.data.username.trim().toLowerCase() : "";
    const stored = users.get(name);
    const valid =
      parsed.success &&
      (await verifyPassword(parsed.data.password, stored ?? dummyHash)) &&
      stored !== undefined;

    if (!valid) {
      request.log.warn({ username: name }, "login failed");
      return reply.code(401).send({ error: "Onbekende gebruiker of verkeerd wachtwoord." });
    }

    request.log.info({ username: name }, "login");
    setSession(reply, name);
    return { user: { name } };
  });

  app.post("/api/logout", async (_request, reply) => {
    reply.header("Set-Cookie", cookie("", 0));
    return { ok: true };
  });
}
