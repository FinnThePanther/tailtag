/**
 * Cloudflare Worker: event-ingress
 *
 * Receives HMAC-signed events from the Supabase edge function and enqueues
 * them on the `tailtag-events` queue for asynchronous processing.
 */

interface Env {
  TAILTAG_EVENTS_QUEUE: Queue;
  EVENT_SHARED_SECRET: string;
  ALLOWED_SOURCE?: string;
}

type EventRecord = {
  event_id: string;
  user_id: string;
  type: string;
  convention_id: string | null;
  payload: Record<string, unknown>;
  occurred_at: string;
};

type EventEnvelope = {
  event: EventRecord;
  forwarded_at: string;
  source: string;
};

type QueueMessage = {
  event: EventRecord;
  received_at: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tailtag-event-signature, x-tailtag-event-id",
};

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

function isEventRecord(value: unknown): value is EventRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.event_id === "string" &&
    typeof record.user_id === "string" &&
    typeof record.type === "string" &&
    typeof record.occurred_at === "string" &&
    ("convention_id" in record ? record.convention_id === null || typeof record.convention_id === "string" : true) &&
    typeof record.payload === "object" &&
    record.payload !== null
  );
}

function isEventEnvelope(value: unknown): value is EventEnvelope {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Record<string, unknown>;
  return (
    typeof envelope.forwarded_at === "string" &&
    typeof envelope.source === "string" &&
    isEventRecord(envelope.event)
  );
}

function parseSignature(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const [prefix, digest] = trimmed.split("=");
  if (prefix.toLowerCase() !== "sha256" || !digest) {
    return null;
  }
  return digest;
}

async function verifySignature(payload: string, providedSignature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

  const payloadBytes = new TextEncoder().encode(payload);
  const expectedSignatureBuffer = await crypto.subtle.sign("HMAC", key, payloadBytes);
  const expectedSignatureHex = Array.from(new Uint8Array(expectedSignatureBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  if (expectedSignatureHex.length !== providedSignature.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < expectedSignatureHex.length; index += 1) {
    mismatch |= expectedSignatureHex.charCodeAt(index) ^ providedSignature.charCodeAt(index);
  }
  return mismatch === 0;
}

async function enqueue(env: Env, message: QueueMessage) {
  await env.TAILTAG_EVENTS_QUEUE.send(message);
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const signatureHeader = request.headers.get("x-tailtag-event-signature");
  const signature = parseSignature(signatureHeader);

  if (!signature) {
    return jsonResponse(401, { error: "Missing or invalid signature" });
  }

  const payload = await request.text();

  let parsed: EventEnvelope;

  try {
    parsed = JSON.parse(payload) as EventEnvelope;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON payload" });
  }

  if (!isEventEnvelope(parsed)) {
    return jsonResponse(400, { error: "Malformed event envelope" });
  }

  if (env.ALLOWED_SOURCE && parsed.source !== env.ALLOWED_SOURCE) {
    return jsonResponse(403, { error: "Invalid event source" });
  }

  const secret = env.EVENT_SHARED_SECRET;

  if (!secret) {
    console.error("[event-ingress] EVENT_SHARED_SECRET is not configured");
    return jsonResponse(500, { error: "Server misconfiguration" });
  }

  const validSignature = await verifySignature(payload, signature, secret);

  if (!validSignature) {
    return jsonResponse(401, { error: "Signature verification failed" });
  }

  const queueMessage: QueueMessage = {
    event: parsed.event,
    received_at: new Date().toISOString(),
  };

  try {
    await enqueue(env, queueMessage);
  } catch (error) {
    console.error("[event-ingress] Failed to enqueue message", {
      event_id: parsed.event.event_id,
      error,
    });
    return jsonResponse(502, { error: "Failed to enqueue event" });
  }

  return jsonResponse(202, {
    accepted: true,
    event_id: parsed.event.event_id,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error("[event-ingress] Unhandled error", error);
      return jsonResponse(500, { error: "Internal server error" });
    }
  },
};
