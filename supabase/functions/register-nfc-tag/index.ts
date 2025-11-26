/// <reference lib="deno.unstable" />
/**
 * Supabase Edge Function: register-nfc-tag
 *
 * Handles NFC tag registration, linking, and management operations.
 *
 * Actions:
 * - check: Check if a tag exists and its ownership status
 * - register: Register a new tag (pending_link status)
 * - link: Link a pending tag to a fursuit (active status)
 * - unlink: Unlink a tag from its fursuit (revoked status)
 * - mark_lost: Mark a tag as lost
 * - mark_found: Mark a lost tag as found/active
 */

// eslint-disable-next-line import/no-unresolved -- Deno edge functions import via remote URL
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

type NfcTagStatus = "pending_link" | "active" | "lost" | "revoked";

interface NfcTagRow {
  uid: string;
  fursuit_id: string | null;
  registered_by_user_id: string;
  status: NfcTagStatus;
  registered_at: string;
  linked_at: string | null;
  updated_at: string;
}

interface RequestBody {
  action: "check" | "register" | "link" | "unlink" | "mark_lost" | "mark_found";
  uid: string;
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

interface CheckResponse {
  exists: boolean;
  status?: NfcTagStatus;
  fursuit_id?: string | null;
  is_mine?: boolean;
}

interface SuccessResponse {
  success: true;
  tag_uid: string;
  status: NfcTagStatus;
  fursuit_id?: string | null;
}

type ApiResponse = CheckResponse | SuccessResponse | ErrorResponse;

function jsonResponse(status: number, payload: ApiResponse) {
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
  message: string
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

function normalizeTagUid(uid: string): string {
  // Normalize to uppercase hex, remove any colons or spaces
  return uid.toUpperCase().replace(/[:\s-]/g, "");
}

async function checkFursuitOwnership(
  fursuitId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("fursuits")
    .select("owner_id")
    .eq("id", fursuitId)
    .single();

  if (error || !data) return false;
  return data.owner_id === userId;
}

async function handleCheck(
  uid: string,
  userId: string
): Promise<Response> {
  const normalizedUid = normalizeTagUid(uid);

  const { data: tag, error } = await supabaseAdmin
    .from("nfc_tags")
    .select("*")
    .eq("uid", normalizedUid)
    .single();

  if (error || !tag) {
    return jsonResponse(200, { exists: false });
  }

  const typedTag = tag as NfcTagRow;
  const isMine = typedTag.registered_by_user_id === userId;

  return jsonResponse(200, {
    exists: true,
    status: typedTag.status,
    fursuit_id: typedTag.fursuit_id,
    is_mine: isMine,
  });
}

async function handleRegister(
  uid: string,
  userId: string
): Promise<Response> {
  const normalizedUid = normalizeTagUid(uid);

  // Check if tag already exists
  const { data: existingTag } = await supabaseAdmin
    .from("nfc_tags")
    .select("registered_by_user_id, status")
    .eq("uid", normalizedUid)
    .single();

  if (existingTag) {
    const typedTag = existingTag as Pick<NfcTagRow, "registered_by_user_id" | "status">;

    if (typedTag.registered_by_user_id === userId) {
      return errorResponse(
        400,
        "TAG_ALREADY_REGISTERED",
        "You have already registered this tag"
      );
    } else {
      return errorResponse(
        400,
        "TAG_BELONGS_TO_ANOTHER_USER",
        "This tag is registered to another user"
      );
    }
  }

  // Insert new tag with pending_link status
  const { error: insertError } = await supabaseAdmin.from("nfc_tags").insert({
    uid: normalizedUid,
    registered_by_user_id: userId,
    status: "pending_link",
  });

  if (insertError) {
    console.error("[register-nfc-tag] Insert error:", insertError);

    // Handle race condition where tag was inserted between check and insert
    if (insertError.code === "23505") {
      return errorResponse(
        400,
        "TAG_ALREADY_REGISTERED",
        "This tag was just registered by someone else"
      );
    }

    return errorResponse(500, "INVALID_REQUEST", "Failed to register tag");
  }

  return jsonResponse(201, {
    success: true,
    tag_uid: normalizedUid,
    status: "pending_link",
  });
}

async function handleLink(
  uid: string,
  fursuitId: string,
  userId: string
): Promise<Response> {
  const normalizedUid = normalizeTagUid(uid);

  // Check tag exists and user owns it
  const { data: tag, error: tagError } = await supabaseAdmin
    .from("nfc_tags")
    .select("*")
    .eq("uid", normalizedUid)
    .single();

  if (tagError || !tag) {
    return errorResponse(404, "TAG_NOT_FOUND", "Tag not found");
  }

  const typedTag = tag as NfcTagRow;

  if (typedTag.registered_by_user_id !== userId) {
    return errorResponse(
      403,
      "NOT_TAG_OWNER",
      "You do not own this tag"
    );
  }

  // Check user owns the fursuit
  const ownsFursuit = await checkFursuitOwnership(fursuitId, userId);
  if (!ownsFursuit) {
    return errorResponse(
      403,
      "FURSUIT_NOT_OWNED",
      "You can only link tags to your own fursuits"
    );
  }

  // Check fursuit doesn't already have an active tag
  const { data: existingActiveTag } = await supabaseAdmin
    .from("nfc_tags")
    .select("uid")
    .eq("fursuit_id", fursuitId)
    .eq("status", "active")
    .single();

  if (existingActiveTag && (existingActiveTag as { uid: string }).uid !== normalizedUid) {
    return errorResponse(
      400,
      "FURSUIT_ALREADY_HAS_TAG",
      "This fursuit already has an active NFC tag. Unlink it first."
    );
  }

  // Update tag to active and link to fursuit
  const { error: updateError } = await supabaseAdmin
    .from("nfc_tags")
    .update({
      fursuit_id: fursuitId,
      status: "active",
      linked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("uid", normalizedUid);

  if (updateError) {
    console.error("[register-nfc-tag] Update error:", updateError);

    // Handle unique constraint violation (one active tag per fursuit)
    if (updateError.code === "23505") {
      return errorResponse(
        400,
        "FURSUIT_ALREADY_HAS_TAG",
        "This fursuit already has an active NFC tag"
      );
    }

    return errorResponse(500, "INVALID_REQUEST", "Failed to link tag");
  }

  return jsonResponse(200, {
    success: true,
    tag_uid: normalizedUid,
    status: "active",
    fursuit_id: fursuitId,
  });
}

async function handleUnlink(
  uid: string,
  userId: string
): Promise<Response> {
  const normalizedUid = normalizeTagUid(uid);

  // Check tag exists
  const { data: tag, error: tagError } = await supabaseAdmin
    .from("nfc_tags")
    .select("*")
    .eq("uid", normalizedUid)
    .single();

  if (tagError || !tag) {
    return errorResponse(404, "TAG_NOT_FOUND", "Tag not found");
  }

  const typedTag = tag as NfcTagRow;

  // Check user owns the tag or the fursuit
  const ownsTag = typedTag.registered_by_user_id === userId;
  const ownsFursuit = typedTag.fursuit_id
    ? await checkFursuitOwnership(typedTag.fursuit_id, userId)
    : false;

  if (!ownsTag && !ownsFursuit) {
    return errorResponse(
      403,
      "NOT_TAG_OWNER",
      "You do not have permission to manage this tag"
    );
  }

  // Update tag to revoked and clear fursuit_id
  const { error: updateError } = await supabaseAdmin
    .from("nfc_tags")
    .update({
      fursuit_id: null,
      status: "revoked",
      updated_at: new Date().toISOString(),
    })
    .eq("uid", normalizedUid);

  if (updateError) {
    console.error("[register-nfc-tag] Update error:", updateError);
    return errorResponse(500, "INVALID_REQUEST", "Failed to unlink tag");
  }

  return jsonResponse(200, {
    success: true,
    tag_uid: normalizedUid,
    status: "revoked",
  });
}

async function handleMarkLost(
  uid: string,
  userId: string
): Promise<Response> {
  const normalizedUid = normalizeTagUid(uid);

  // Check tag exists
  const { data: tag, error: tagError } = await supabaseAdmin
    .from("nfc_tags")
    .select("*")
    .eq("uid", normalizedUid)
    .single();

  if (tagError || !tag) {
    return errorResponse(404, "TAG_NOT_FOUND", "Tag not found");
  }

  const typedTag = tag as NfcTagRow;

  // Check user owns the tag or the fursuit
  const ownsTag = typedTag.registered_by_user_id === userId;
  const ownsFursuit = typedTag.fursuit_id
    ? await checkFursuitOwnership(typedTag.fursuit_id, userId)
    : false;

  if (!ownsTag && !ownsFursuit) {
    return errorResponse(
      403,
      "NOT_TAG_OWNER",
      "You do not have permission to manage this tag"
    );
  }

  if (typedTag.status !== "active") {
    return errorResponse(
      400,
      "INVALID_TAG_STATUS",
      "Only active tags can be marked as lost"
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("nfc_tags")
    .update({
      status: "lost",
      updated_at: new Date().toISOString(),
    })
    .eq("uid", normalizedUid);

  if (updateError) {
    console.error("[register-nfc-tag] Update error:", updateError);
    return errorResponse(500, "INVALID_REQUEST", "Failed to mark tag as lost");
  }

  return jsonResponse(200, {
    success: true,
    tag_uid: normalizedUid,
    status: "lost",
    fursuit_id: typedTag.fursuit_id,
  });
}

async function handleMarkFound(
  uid: string,
  userId: string
): Promise<Response> {
  const normalizedUid = normalizeTagUid(uid);

  // Check tag exists
  const { data: tag, error: tagError } = await supabaseAdmin
    .from("nfc_tags")
    .select("*")
    .eq("uid", normalizedUid)
    .single();

  if (tagError || !tag) {
    return errorResponse(404, "TAG_NOT_FOUND", "Tag not found");
  }

  const typedTag = tag as NfcTagRow;

  // Check user owns the tag or the fursuit
  const ownsTag = typedTag.registered_by_user_id === userId;
  const ownsFursuit = typedTag.fursuit_id
    ? await checkFursuitOwnership(typedTag.fursuit_id, userId)
    : false;

  if (!ownsTag && !ownsFursuit) {
    return errorResponse(
      403,
      "NOT_TAG_OWNER",
      "You do not have permission to manage this tag"
    );
  }

  if (typedTag.status !== "lost") {
    return errorResponse(
      400,
      "INVALID_TAG_STATUS",
      "Only lost tags can be marked as found"
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("nfc_tags")
    .update({
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("uid", normalizedUid);

  if (updateError) {
    console.error("[register-nfc-tag] Update error:", updateError);
    return errorResponse(500, "INVALID_REQUEST", "Failed to mark tag as found");
  }

  return jsonResponse(200, {
    success: true,
    tag_uid: normalizedUid,
    status: "active",
    fursuit_id: typedTag.fursuit_id,
  });
}

async function handlePost(req: Request): Promise<Response> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return jsonResponse(401, { error: "Unauthorized", code: "INVALID_REQUEST" });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return errorResponse(400, "INVALID_REQUEST", "Invalid JSON payload");
  }

  if (!body.action) {
    return errorResponse(400, "INVALID_REQUEST", "Missing action");
  }

  if (!body.uid || typeof body.uid !== "string") {
    return errorResponse(400, "INVALID_REQUEST", "Missing or invalid uid");
  }

  switch (body.action) {
    case "check":
      return handleCheck(body.uid, userId);

    case "register":
      return handleRegister(body.uid, userId);

    case "link":
      if (!body.fursuit_id || typeof body.fursuit_id !== "string") {
        return errorResponse(
          400,
          "INVALID_REQUEST",
          "Missing fursuit_id for link action"
        );
      }
      return handleLink(body.uid, body.fursuit_id, userId);

    case "unlink":
      return handleUnlink(body.uid, userId);

    case "mark_lost":
      return handleMarkLost(body.uid, userId);

    case "mark_found":
      return handleMarkFound(body.uid, userId);

    default:
      return errorResponse(400, "INVALID_REQUEST", "Invalid action");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed", code: "INVALID_REQUEST" });
  }

  return handlePost(req);
});
