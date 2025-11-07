/// <reference lib="deno.unstable" />
/**
 * Supabase Edge Function: events-ingress
 *
 * Environment variables:
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_ANON_KEY: Anon key for validating the caller JWT
 * - SERVICE_ROLE_KEY: Service role key (or SUPABASE_SERVICE_ROLE_KEY) for privileged inserts
 * - CF_EVENT_INGRESS_URL: Cloudflare Worker endpoint that accepts event payloads
 * - CF_EVENT_INGRESS_SECRET: HMAC signing secret shared with the Cloudflare Worker
 */
// eslint-disable-next-line import/no-unresolved -- Supabase Edge Functions use remote esm.sh imports.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

type Json = Record<string, unknown>;

type EventRequestBody = {
  type?: unknown;
  convention_id?: unknown;
  payload?: unknown;
  occurred_at?: unknown;
};

type InsertableEventRow = {
  event_id: string;
  user_id: string;
  type: string;
  convention_id: string | null;
  payload: Json;
  occurred_at: string;
};

type ForwardResult =
  | { ok: true; status: number }
  | { ok: false; status: number; error: string };

const encoder = new TextEncoder();

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("ANON_KEY");
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const cloudflareEventIngressUrl = Deno.env.get("CF_EVENT_INGRESS_URL");
const cloudflareIngressSecret = Deno.env.get("CF_EVENT_INGRESS_SECRET");

if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
  throw new Error("Missing Supabase configuration (SUPABASE_URL / SUPABASE_ANON_KEY / SERVICE_ROLE_KEY)");
}

if (!cloudflareEventIngressUrl || !cloudflareIngressSecret) {
  throw new Error("Missing Cloudflare configuration (CF_EVENT_INGRESS_URL / CF_EVENT_INGRESS_SECRET)");
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function jsonResponse(status: number, payload: Json) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeEventType(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 128) {
    return null;
  }
  if (!/^[a-z0-9_.:-]+$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function normalizeConventionId(input: unknown): string | null {
  if (input === null || input === undefined || input === "") {
    return null;
  }
  if (typeof input !== "string") {
    return null;
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed;
}

function normalizeOccurredAt(input: unknown): string | null {
  if (input === null || input === undefined || input === "") {
    return new Date().toISOString();
  }

  if (typeof input === "number") {
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return new Date().toISOString();
    }
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}

function coercePayload(value: unknown): Json {
  if (!isRecord(value)) {
    return {};
  }

  return value;
}

function extractBearerAuthorization(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!header) {
    return null;
  }
  const parts = header.trim().split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return null;
  }
  return `Bearer ${parts[1]}`;
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let result = "";
  for (const byte of bytes) {
    result += byte.toString(16).padStart(2, "0");
  }
  return result;
}

function generateUuidV7(): string {
  const now = BigInt(Date.now());
  const random = crypto.getRandomValues(new Uint8Array(10));
  const bytes = new Uint8Array(16);

  bytes[0] = Number((now >> 40n) & 0xffn);
  bytes[1] = Number((now >> 32n) & 0xffn);
  bytes[2] = Number((now >> 24n) & 0xffn);
  bytes[3] = Number((now >> 16n) & 0xffn);
  bytes[4] = Number((now >> 8n) & 0xffn);
  bytes[5] = Number(now & 0xffn);

  bytes.set(random, 6);

  bytes[6] = (bytes[6] & 0x0f) | 0x70; // Version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant RFC 4122

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const token = extractBearerAuthorization(req);

  if (!token) {
    return null;
  }

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: token,
      },
    },
  });

  const { data, error } = await supabaseUserClient.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return data.user.id;
}

async function signPayload(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(cloudflareIngressSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `sha256=${toHex(signature)}`;
}

async function forwardEvent(event: InsertableEventRow): Promise<ForwardResult> {
  const envelope = {
    event,
    forwarded_at: new Date().toISOString(),
    source: "supabase-edge",
  };

  const payload = JSON.stringify(envelope);
  const signature = await signPayload(payload);

  try {
    const response = await fetch(cloudflareEventIngressUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Connection": "keep-alive",
        "X-Tailtag-Event-Id": event.event_id,
        "X-Tailtag-Event-Signature": signature,
      },
      body: payload,
      keepalive: true,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      return {
        ok: false,
        status: response.status,
        error: errorText || response.statusText || "Unknown error from Cloudflare ingress",
      };
    }

    return { ok: true, status: response.status };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "Unknown network error",
    };
  }
}

async function handlePost(req: Request): Promise<Response> {
  const userId = await getUserIdFromRequest(req);

  if (!userId) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  let parsed: EventRequestBody;

  try {
    parsed = (await req.json()) as EventRequestBody;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON payload" });
  }

  const type = normalizeEventType(parsed.type);

  if (!type) {
    return jsonResponse(400, { error: "Missing or invalid event type" });
  }

  const conventionId = normalizeConventionId(parsed.convention_id);
  const occurredAt = normalizeOccurredAt(parsed.occurred_at);

  if (!occurredAt) {
    return jsonResponse(400, { error: "Invalid occurred_at value" });
  }

  const payload = coercePayload(parsed.payload);
  const eventId = generateUuidV7();

  const eventRow: InsertableEventRow = {
    event_id: eventId,
    user_id: userId,
    type,
    convention_id: conventionId,
    payload,
    occurred_at: occurredAt,
  };

  const { error: insertError } = await supabaseAdmin
    .from("events")
    .insert([eventRow]);

  if (insertError) {
    console.error("[events-ingress] Failed inserting event", insertError);
    return jsonResponse(500, { error: "Failed to persist event" });
  }

  const forwardResult = await forwardEvent(eventRow);

  if (!forwardResult.ok) {
    console.error("[events-ingress] Failed forwarding event", {
      event_id: eventId,
      status: forwardResult.status,
      error: forwardResult.error,
    });
  }

  return jsonResponse(201, {
    event_id: eventId,
    forwarded: forwardResult.ok,
    forward_status: forwardResult.status,
    forward_error: forwardResult.ok ? null : forwardResult.error,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  return handlePost(req);
});
