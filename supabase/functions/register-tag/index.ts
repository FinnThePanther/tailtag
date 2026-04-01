/// <reference lib="deno.unstable" />
/**
 * Supabase Edge Function: register-tag
 *
 * Handles NFC tag registration and management operations.
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

const errorLogger = (scope: string, error: unknown) => {
  console.error(`[register-tag] ${scope}:`, error);
};

type TagStatus = "pending_link" | "active" | "lost" | "revoked";

type TagAction =
  | "check"
  | "register"
  | "link"
  | "unlink"
  | "mark_lost"
  | "mark_found";

interface TagRow {
  id: string;
  nfc_uid: string | null;
  fursuit_id: string | null;
  registered_by_user_id: string;
  status: TagStatus;
  registered_at: string;
  linked_at: string | null;
  updated_at: string;
  qr_token: string | null;
  qr_token_created_at: string | null;
  qr_asset_path: string | null;
}

interface RequestBody {
  action: TagAction;
  tag_id?: string;
  nfc_uid?: string;
  uid?: string; // Legacy field for backwards compatibility
  fursuit_id?: string;
}

type ErrorCode =
  | "TAG_ALREADY_REGISTERED"
  | "TAG_BELONGS_TO_ANOTHER_USER"
  | "TAG_NOT_FOUND"
  | "NOT_TAG_OWNER"
  | "FURSUIT_NOT_OWNED"
  | "FURSUIT_ALREADY_HAS_TAG"
  | "INVALID_TAG_STATUS"
  | "INVALID_REQUEST";

interface ErrorResponse {
  error: string;
  code: ErrorCode;
}

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(
  httpStatus: number,
  code: ErrorCode,
  message: string,
): Response {
  return jsonResponse(httpStatus, { error: message, code });
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

function normalizeNfcUid(uid?: string | null): string | null {
  if (!uid) return null;
  return uid.toUpperCase().replace(/[:\s-]/g, "");
}

function nowIso(): string {
  return new Date().toISOString();
}

async function deleteQrAsset(assetPath?: string | null) {
  if (!assetPath) return;
  const { error } = await supabaseAdmin.storage
    .from("tag-qr-codes")
    .remove([assetPath]);

  if (error) {
    errorLogger("deleteQrAsset", error);
  }
}

async function checkFursuitOwnership(
  fursuitId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("fursuits")
    .select("owner_id")
    .eq("id", fursuitId)
    .single();

  if (error || !data) return false;
  return (data as { owner_id: string }).owner_id === userId;
}

async function getTagById(tagId: string): Promise<TagRow | null> {
  const { data } = await supabaseAdmin
    .from("tags")
    .select("*")
    .eq("id", tagId)
    .maybeSingle();

  return (data ?? null) as TagRow | null;
}

async function getTagByNfcUid(nfcUid: string): Promise<TagRow | null> {
  const { data } = await supabaseAdmin
    .from("tags")
    .select("*")
    .eq("nfc_uid", nfcUid)
    .maybeSingle();

  return (data ?? null) as TagRow | null;
}

async function requireTagForUser(
  identifier: { tagId?: string; nfcUid?: string | null },
  userId: string,
): Promise<TagRow | Response> {
  const tag = identifier.tagId
    ? await getTagById(identifier.tagId)
    : identifier.nfcUid
    ? await getTagByNfcUid(identifier.nfcUid)
    : null;

  if (!tag) {
    return errorResponse(404, "TAG_NOT_FOUND", "Tag not found");
  }

  const ownsTag = tag.registered_by_user_id === userId;
  const ownsFursuit = tag.fursuit_id
    ? await checkFursuitOwnership(tag.fursuit_id, userId)
    : false;

  if (!ownsTag && !ownsFursuit) {
    return errorResponse(403, "NOT_TAG_OWNER", "You do not have permission to manage this tag");
  }

  return tag;
}

async function ensureFursuitOwnership(
  fursuitId: string,
  userId: string,
): Promise<Response | null> {
  const ownsFursuit = await checkFursuitOwnership(fursuitId, userId);
  if (!ownsFursuit) {
    return errorResponse(
      403,
      "FURSUIT_NOT_OWNED",
      "You can only manage tags for your own fursuits",
    );
  }
  return null;
}

async function ensureFursuitCanLinkTag(
  fursuitId: string,
  tag: TagRow,
): Promise<Response | null> {
  const { data } = await supabaseAdmin
    .from("tags")
    .select("id")
    .eq("fursuit_id", fursuitId)
    .eq("status", "active")
    .not("nfc_uid", "is", null)
    .maybeSingle();

  if (data && (data as { id: string }).id !== tag.id) {
    return errorResponse(
      400,
      "FURSUIT_ALREADY_HAS_TAG",
      "This fursuit already has an active NFC tag",
    );
  }

  return null;
}

function formatLegacyTagResponse(tag: TagRow, extras?: Record<string, unknown>) {
  return {
    success: true,
    tag_id: tag.id,
    tag_uid: tag.nfc_uid,
    nfc_uid: tag.nfc_uid,
    status: tag.status,
    fursuit_id: tag.fursuit_id,
    ...extras,
  };
}

async function handleCheck(body: RequestBody, userId: string): Promise<Response> {
  const nfcUid = normalizeNfcUid(body.nfc_uid ?? body.uid);
  const tagId = body.tag_id?.trim();

  if (!nfcUid && !tagId) {
    return errorResponse(400, "INVALID_REQUEST", "Provide nfc_uid or tag_id");
  }

  let query = supabaseAdmin.from("tags").select("*").limit(1);

  if (tagId) {
    query = query.eq("id", tagId);
  } else if (nfcUid) {
    query = query.eq("nfc_uid", nfcUid);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    return jsonResponse(200, { exists: false });
  }

  const tag = data as TagRow;

  return jsonResponse(200, {
    exists: true,
    tag_id: tag.id,
    status: tag.status,
    fursuit_id: tag.fursuit_id,
    is_mine: tag.registered_by_user_id === userId,
  });
}

async function handleRegister(body: RequestBody, userId: string): Promise<Response> {
  const nfcUid = normalizeNfcUid(body.nfc_uid ?? body.uid);

  if (!nfcUid) {
    return errorResponse(400, "INVALID_REQUEST", "Registering a tag requires an NFC UID");
  }

  const { data: existing } = await supabaseAdmin
    .from("tags")
    .select("registered_by_user_id")
    .eq("nfc_uid", nfcUid)
    .maybeSingle();

  if (existing) {
    const belongsToRequestor =
      (existing as { registered_by_user_id: string }).registered_by_user_id ===
      userId;
    if (belongsToRequestor) {
      return errorResponse(
        400,
        "TAG_ALREADY_REGISTERED",
        "You have already registered this tag",
      );
    }
    return errorResponse(
      400,
      "TAG_BELONGS_TO_ANOTHER_USER",
      "This tag is registered to another user",
    );
  }

  const tagId = crypto.randomUUID();
  const insertPayload: Record<string, unknown> = {
    id: tagId,
    registered_by_user_id: userId,
    status: "pending_link",
    nfc_uid: nfcUid,
  };

  const { data, error } = await supabaseAdmin
    .from("tags")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error || !data) {
    if ((error as { code?: string } | null)?.code === "23505") {
      return errorResponse(
        400,
        "TAG_ALREADY_REGISTERED",
        "This tag is already registered",
      );
    }

    errorLogger("handleRegister", error);
    return errorResponse(500, "INVALID_REQUEST", "Failed to register tag");
  }

  return jsonResponse(201, formatLegacyTagResponse(data as TagRow));
}

async function handleLink(body: RequestBody, userId: string): Promise<Response> {
  const fursuitId = body.fursuit_id?.trim();
  if (!fursuitId) {
    return errorResponse(400, "INVALID_REQUEST", "Missing fursuit_id for link action");
  }

  const nfcUid = normalizeNfcUid(body.nfc_uid ?? body.uid);
  const tagIdentifier = { tagId: body.tag_id, nfcUid };
  const tagOrResponse = await requireTagForUser(tagIdentifier, userId);
  if (tagOrResponse instanceof Response) return tagOrResponse;
  let tag = tagOrResponse;

  const ownershipError = await ensureFursuitOwnership(fursuitId, userId);
  if (ownershipError) return ownershipError;

  const conflictError = await ensureFursuitCanLinkTag(fursuitId, tag);
  if (conflictError) return conflictError;

  const { data, error } = await supabaseAdmin
    .from("tags")
    .update({
      fursuit_id: fursuitId,
      status: "active",
      linked_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", tag.id)
    .select("*")
    .single();

  if (error || !data) {
    errorLogger("handleLink", error);
    return errorResponse(500, "INVALID_REQUEST", "Failed to link tag");
  }

  tag = data as TagRow;

  return jsonResponse(200, formatLegacyTagResponse(tag));
}

async function handleUnlink(body: RequestBody, userId: string): Promise<Response> {
  const nfcUid = normalizeNfcUid(body.nfc_uid ?? body.uid);
  const tagOrResponse = await requireTagForUser(
    { tagId: body.tag_id, nfcUid },
    userId,
  );
  if (tagOrResponse instanceof Response) return tagOrResponse;
  const tag = tagOrResponse;

  const { data, error } = await supabaseAdmin
    .from("tags")
    .update({
      fursuit_id: null,
      status: "revoked",
      linked_at: null,
      updated_at: nowIso(),
      qr_token: null,
      qr_token_created_at: null,
      qr_asset_path: null,
    })
    .eq("id", tag.id)
    .select("*")
    .single();

  if (error || !data) {
    errorLogger("handleUnlink", error);
    return errorResponse(500, "INVALID_REQUEST", "Failed to unlink tag");
  }

  await deleteQrAsset(tag.qr_asset_path);

  return jsonResponse(200, formatLegacyTagResponse(data as TagRow));
}

async function handleMarkLost(body: RequestBody, userId: string): Promise<Response> {
  const nfcUid = normalizeNfcUid(body.nfc_uid ?? body.uid);
  const tagOrResponse = await requireTagForUser(
    { tagId: body.tag_id, nfcUid },
    userId,
  );
  if (tagOrResponse instanceof Response) return tagOrResponse;
  const tag = tagOrResponse;

  if (tag.status !== "active") {
    return errorResponse(400, "INVALID_TAG_STATUS", "Only active tags can be marked as lost");
  }

  const { data, error } = await supabaseAdmin
    .from("tags")
    .update({ status: "lost", updated_at: nowIso() })
    .eq("id", tag.id)
    .select("*")
    .single();

  if (error || !data) {
    errorLogger("handleMarkLost", error);
    return errorResponse(500, "INVALID_REQUEST", "Failed to mark tag as lost");
  }

  return jsonResponse(200, formatLegacyTagResponse(data as TagRow));
}

async function handleMarkFound(body: RequestBody, userId: string): Promise<Response> {
  const nfcUid = normalizeNfcUid(body.nfc_uid ?? body.uid);
  const tagOrResponse = await requireTagForUser(
    { tagId: body.tag_id, nfcUid },
    userId,
  );
  if (tagOrResponse instanceof Response) return tagOrResponse;
  const tag = tagOrResponse;

  if (tag.status !== "lost") {
    return errorResponse(400, "INVALID_TAG_STATUS", "Only lost tags can be marked as found");
  }

  const { data, error } = await supabaseAdmin
    .from("tags")
    .update({ status: "active", updated_at: nowIso() })
    .eq("id", tag.id)
    .select("*")
    .single();

  if (error || !data) {
    errorLogger("handleMarkFound", error);
    return errorResponse(500, "INVALID_REQUEST", "Failed to mark tag as found");
  }

  return jsonResponse(200, formatLegacyTagResponse(data as TagRow));
}

async function handlePost(req: Request): Promise<Response> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return errorResponse(401, "INVALID_REQUEST", "Unauthorized");
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return errorResponse(400, "INVALID_REQUEST", "Invalid JSON payload");
  }

  if (!body || !body.action) {
    return errorResponse(400, "INVALID_REQUEST", "Missing action");
  }

  switch (body.action) {
    case "check":
      return handleCheck(body, userId);
    case "register":
      return handleRegister(body, userId);
    case "link":
      return handleLink(body, userId);
    case "unlink":
      return handleUnlink(body, userId);
    case "mark_lost":
      return handleMarkLost(body, userId);
    case "mark_found":
      return handleMarkFound(body, userId);
    default:
      return errorResponse(400, "INVALID_REQUEST", "Unsupported action");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse(405, "INVALID_REQUEST", "Method not allowed");
  }

  return handlePost(req);
});
