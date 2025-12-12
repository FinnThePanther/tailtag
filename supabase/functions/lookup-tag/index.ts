/// <reference lib="deno.unstable" />
/**
 * Supabase Edge Function: lookup-tag
 *
 * Looks up tags by NFC UID or QR token for the catch flow and logs scans.
 */

// eslint-disable-next-line import/no-unresolved -- Deno Edge Functions load via remote URLs
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey =
  Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("ANON_KEY");
const serviceRoleKey =
  Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
  throw new Error("Missing Supabase configuration");
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

type TagStatus = "pending_link" | "active" | "lost" | "revoked";

type LookupFailureReason =
  | "TAG_NOT_REGISTERED"
  | "TAG_NOT_LINKED"
  | "TAG_LOST"
  | "TAG_REVOKED";

type ScanResult = "success" | "cooldown" | "invalid" | "not_found" | "lost" | "revoked";

type ScanMethod = "nfc" | "qr";

interface LookupRequestBody {
  nfc_uid?: string;
  qr_token?: string;
  metadata?: Record<string, unknown>;
}

interface LookupSuccessResponse {
  found: true;
  fursuit_id: string;
  tag_id: string;
}

interface LookupFailureResponse {
  found: false;
  reason: LookupFailureReason;
}

function jsonResponse(status: number, payload: LookupSuccessResponse | LookupFailureResponse | { error: string }) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizeNfcUid(uid?: string | null): string | null {
  if (!uid) return null;
  return uid.toUpperCase().replace(/[:\s-]/g, "");
}

async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const supabaseUserClient = createClient(supabaseUrl!, supabaseAnonKey!, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const { data, error } = await supabaseUserClient.auth.getUser();
  if (error || !data.user) return null;

  return data.user.id;
}

function mapFailureReasonToScanResult(reason: LookupFailureReason): ScanResult {
  switch (reason) {
    case "TAG_NOT_REGISTERED":
      return "not_found";
    case "TAG_NOT_LINKED":
      return "invalid";
    case "TAG_LOST":
      return "lost";
    case "TAG_REVOKED":
      return "revoked";
    default:
      return "invalid";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function logTagScan(params: {
  tagId?: string | null;
  identifier: string;
  method: ScanMethod;
  result: ScanResult;
  userId: string;
  metadata?: Record<string, unknown>;
}) {
  const payload = {
    tag_id: params.tagId ?? null,
    scanned_identifier: params.identifier,
    scan_method: params.method,
    result: params.result,
    scanner_user_id: params.userId,
    metadata: params.metadata ?? {},
  };

  const { error } = await supabaseAdmin.from("tag_scans").insert(payload);
  if (error) {
    console.error("[lookup-tag] Failed to log scan", error);
  }
}

async function handlePost(req: Request): Promise<Response> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  let body: LookupRequestBody;
  try {
    body = (await req.json()) as LookupRequestBody;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON payload" });
  }

  const nfcUid = normalizeNfcUid(body.nfc_uid);
  const qrToken = body.qr_token?.trim();
  const metadata = isPlainObject(body.metadata) ? body.metadata : undefined;

  if ((nfcUid && qrToken) || (!nfcUid && !qrToken)) {
    return jsonResponse(400, { error: "Provide either nfc_uid or qr_token" });
  }

  const method: ScanMethod = qrToken ? "qr" : "nfc";
  const identifier = qrToken ?? nfcUid!;

  const column = method === "qr" ? "qr_token" : "nfc_uid";
  const { data, error } = await supabaseAdmin
    .from("tags")
    .select("id, fursuit_id, status")
    .eq(column, identifier)
    .maybeSingle();

  if (error) {
    console.error("[lookup-tag] Lookup error", error);
    return jsonResponse(500, { error: "Lookup failed" });
  }

  if (!data) {
    await logTagScan({
      tagId: null,
      identifier,
      method,
      result: "not_found",
      userId,
      metadata,
    });

    return jsonResponse(200, {
      found: false,
      reason: "TAG_NOT_REGISTERED",
    });
  }

  const tag = data as { id: string; fursuit_id: string | null; status: TagStatus };

  if (!tag.fursuit_id || tag.status === "pending_link") {
    await logTagScan({
      tagId: tag.id,
      identifier,
      method,
      result: mapFailureReasonToScanResult("TAG_NOT_LINKED"),
      userId,
      metadata,
    });

    return jsonResponse(200, {
      found: false,
      reason: "TAG_NOT_LINKED",
    });
  }

  if (tag.status === "revoked") {
    await logTagScan({
      tagId: tag.id,
      identifier,
      method,
      result: mapFailureReasonToScanResult("TAG_REVOKED"),
      userId,
      metadata,
    });

    return jsonResponse(200, {
      found: false,
      reason: "TAG_REVOKED",
    });
  }

  if (tag.status === "lost" && method === "nfc") {
    await logTagScan({
      tagId: tag.id,
      identifier,
      method,
      result: mapFailureReasonToScanResult("TAG_LOST"),
      userId,
      metadata,
    });

    return jsonResponse(200, {
      found: false,
      reason: "TAG_LOST",
    });
  }

  await logTagScan({
    tagId: tag.id,
    identifier,
    method,
    result: "success",
    userId,
    metadata,
  });

  return jsonResponse(200, {
    found: true,
    fursuit_id: tag.fursuit_id,
    tag_id: tag.id,
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
