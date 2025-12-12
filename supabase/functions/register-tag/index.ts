/// <reference lib="deno.unstable" />
/**
 * Supabase Edge Function: register-tag
 *
 * Handles tag registration, linking, and QR management operations.
 */

// eslint-disable-next-line import/no-unresolved -- Deno Edge Functions load via remote URLs
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";
import { qrcode as createQrFactory } from "https://deno.land/x/qrcode@v2.0.0/qrcode.js";
import { decode as decodeImage, Image, GIF } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

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

const QR_BUCKET_ID = "tag-qr-codes";
const QR_TOKEN_LENGTH = 32;
const QR_TOKEN_PREFIX_LENGTH = 10;
const QR_IMAGE_TARGET_SIZE = 1024;
const QUIET_ZONE_MODULES = 4;
const QR_SIGNED_URL_TTL_SECONDS = parseInt(
  Deno.env.get("QR_SIGNED_URL_TTL") ?? "604800",
  10,
);
const DEFAULT_GENERATE_QR_ON_LINK = true;
const BASE62_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

const QR_PAYLOAD_PREFIX = "tailtag://catch?v=1&t=";

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
  | "mark_found"
  | "generate_qr"
  | "rotate_qr"
  | "revoke_qr";

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
  qr_token?: string;
  fursuit_id?: string;
  generate_qr?: boolean;
}

type ErrorCode =
  | "TAG_ALREADY_REGISTERED"
  | "TAG_BELONGS_TO_ANOTHER_USER"
  | "TAG_NOT_FOUND"
  | "NOT_TAG_OWNER"
  | "FURSUIT_NOT_OWNED"
  | "FURSUIT_ALREADY_HAS_TAG"
  | "INVALID_TAG_STATUS"
  | "INVALID_REQUEST"
  | "QR_ALREADY_EXISTS"
  | "QR_NOT_FOUND";

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

function buildQrPayload(token: string): string {
  return `${QR_PAYLOAD_PREFIX}${token}`;
}

function generateQrToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(QR_TOKEN_LENGTH));
  let token = "";
  for (const byte of bytes) {
    token += BASE62_ALPHABET[byte % BASE62_ALPHABET.length];
  }
  return token;
}

function buildQrAssetPath(tagId: string, fursuitId: string | null, token: string) {
  const prefix = token.slice(0, QR_TOKEN_PREFIX_LENGTH);
  const folder = fursuitId ?? `unlinked/${tagId}`;
  return `${folder}/${prefix}.png`;
}

async function renderQrPng(payload: string): Promise<Uint8Array> {
  const qr = createQrFactory(0, "H");
  qr.addData(payload);
  qr.make();

  const dataUrl = qr.createDataURL(1, QUIET_ZONE_MODULES);
  const [, base64Data] = dataUrl.split(",");
  if (!base64Data) {
    throw new Error("Failed to render QR code");
  }

  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const decoded = await decodeImage(bytes, true);
  let baseImage: Image;
  if (decoded instanceof Image) {
    baseImage = decoded;
  } else if (decoded instanceof GIF && decoded.length > 0) {
    baseImage = decoded[0];
  } else {
    throw new Error("Unsupported QR code image payload");
  }

  if (baseImage.width !== QR_IMAGE_TARGET_SIZE || baseImage.height !== QR_IMAGE_TARGET_SIZE) {
    baseImage = baseImage.resize(QR_IMAGE_TARGET_SIZE, QR_IMAGE_TARGET_SIZE);
  }

  return await baseImage.encode();
}

async function uploadQrAsset(assetPath: string, bytes: Uint8Array) {
  const { error } = await supabaseAdmin.storage
    .from(QR_BUCKET_ID)
    .upload(assetPath, bytes, {
      contentType: "image/png",
      upsert: true,
    });

  if (error) {
    errorLogger("uploadQrAsset", error);
    throw new Error("Failed to upload QR asset");
  }
}

async function deleteQrAsset(assetPath?: string | null) {
  if (!assetPath) return;
  const { error } = await supabaseAdmin.storage
    .from(QR_BUCKET_ID)
    .remove([assetPath]);

  if (error) {
    errorLogger("deleteQrAsset", error);
  }
}

async function createSignedQrUrl(assetPath?: string | null): Promise<string | undefined> {
  if (!assetPath) return undefined;

  const { data, error } = await supabaseAdmin.storage
    .from(QR_BUCKET_ID)
    .createSignedUrl(assetPath, QR_SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    if (error) errorLogger("createSignedQrUrl", error);
    return undefined;
  }

  return data.signedUrl;
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

async function ensureFursuitHasNoActiveTag(
  fursuitId: string,
  tagId: string,
): Promise<Response | null> {
  const { data } = await supabaseAdmin
    .from("tags")
    .select("id")
    .eq("fursuit_id", fursuitId)
    .eq("status", "active")
    .maybeSingle();

  if (data && (data as { id: string }).id !== tagId) {
    return errorResponse(
      400,
      "FURSUIT_ALREADY_HAS_TAG",
      "This fursuit already has an active tag",
    );
  }

  return null;
}

async function ensureQrForTag(
  tag: TagRow,
  options: { rotate?: boolean; desiredFursuitId?: string | null } = {},
): Promise<{ tag: TagRow; downloadUrl?: string }> {
  const shouldGenerate = options.rotate || !tag.qr_token;
  if (!shouldGenerate) {
    return { tag, downloadUrl: await createSignedQrUrl(tag.qr_asset_path) };
  }

  const token = generateQrToken();
  const payload = buildQrPayload(token);
  const pngBytes = await renderQrPng(payload);
  const assetPath = buildQrAssetPath(
    tag.id,
    options.desiredFursuitId ?? tag.fursuit_id,
    token,
  );

  await uploadQrAsset(assetPath, pngBytes);

  const previousPath = tag.qr_asset_path;
  const { data, error } = await supabaseAdmin
    .from("tags")
    .update({
      qr_token: token,
      qr_token_created_at: nowIso(),
      qr_asset_path: assetPath,
      updated_at: nowIso(),
    })
    .eq("id", tag.id)
    .select("*")
    .single();

  if (error || !data) {
    await deleteQrAsset(assetPath);
    throw new Error("Failed to persist QR token");
  }

  if (previousPath && previousPath !== assetPath) {
    await deleteQrAsset(previousPath);
  }

  const updatedTag = data as TagRow;
  const downloadUrl = await createSignedQrUrl(assetPath);
  return { tag: updatedTag, downloadUrl };
}

function formatLegacyTagResponse(tag: TagRow, extras?: Record<string, unknown>) {
  return {
    success: true,
    tag_id: tag.id,
    tag_uid: tag.nfc_uid,
    nfc_uid: tag.nfc_uid,
    status: tag.status,
    fursuit_id: tag.fursuit_id,
    qr_token: tag.qr_token,
    ...extras,
  };
}

async function handleCheck(body: RequestBody, userId: string): Promise<Response> {
  const nfcUid = normalizeNfcUid(body.nfc_uid ?? body.uid);
  const qrToken = body.qr_token?.trim();
  const tagId = body.tag_id?.trim();

  if (!nfcUid && !qrToken && !tagId) {
    return errorResponse(400, "INVALID_REQUEST", "Provide nfc_uid, qr_token, or tag_id");
  }

  let query = supabaseAdmin.from("tags").select("*").limit(1);

  if (tagId) {
    query = query.eq("id", tagId);
  } else if (nfcUid) {
    query = query.eq("nfc_uid", nfcUid);
  } else if (qrToken) {
    query = query.eq("qr_token", qrToken);
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
  const wantsQr = Boolean(body.generate_qr);

  if (!nfcUid && !wantsQr) {
    return errorResponse(
      400,
      "INVALID_REQUEST",
      "Registering a tag requires an NFC UID or generate_qr",
    );
  }

  if (nfcUid) {
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
  }

  const tagId = crypto.randomUUID();
  const insertPayload: Record<string, unknown> = {
    id: tagId,
    registered_by_user_id: userId,
    status: "pending_link",
  };

  if (nfcUid) {
    insertPayload.nfc_uid = nfcUid;
  }

  let qrAssetPath: string | null = null;
  if (wantsQr) {
    const token = generateQrToken();
    const payload = buildQrPayload(token);
    const pngBytes = await renderQrPng(payload);
    qrAssetPath = buildQrAssetPath(tagId, null, token);
    await uploadQrAsset(qrAssetPath, pngBytes);
    insertPayload.qr_token = token;
    insertPayload.qr_token_created_at = nowIso();
    insertPayload.qr_asset_path = qrAssetPath;
  }

  const { data, error } = await supabaseAdmin
    .from("tags")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error || !data) {
    if (qrAssetPath) {
      await deleteQrAsset(qrAssetPath);
    }

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

  const tag = data as TagRow;
  const qrDownloadUrl = await createSignedQrUrl(tag.qr_asset_path);

  return jsonResponse(201, formatLegacyTagResponse(tag, { qr_download_url: qrDownloadUrl }));
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

  const activeError = await ensureFursuitHasNoActiveTag(fursuitId, tag.id);
  if (activeError) return activeError;

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

  let qrDownloadUrl: string | undefined;
  if (tag.qr_token || DEFAULT_GENERATE_QR_ON_LINK) {
    const qrResult = await ensureQrForTag(tag, { desiredFursuitId: fursuitId });
    tag = qrResult.tag;
    qrDownloadUrl = qrResult.downloadUrl;
  }

  return jsonResponse(200, formatLegacyTagResponse(tag, { qr_download_url: qrDownloadUrl }));
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

  if (!tag.nfc_uid) {
    return errorResponse(400, "INVALID_REQUEST", "Cannot mark a QR-only tag as lost");
  }

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

async function handleGenerateQr(body: RequestBody, userId: string): Promise<Response> {
  const nfcUid = normalizeNfcUid(body.nfc_uid ?? body.uid);
  const tagOrResponse = await requireTagForUser(
    { tagId: body.tag_id, nfcUid },
    userId,
  );
  if (tagOrResponse instanceof Response) return tagOrResponse;
  const tag = tagOrResponse;

  if (tag.qr_token) {
    return errorResponse(400, "QR_ALREADY_EXISTS", "Tag already has a QR token");
  }

  const { tag: updatedTag, downloadUrl } = await ensureQrForTag(tag, {
    desiredFursuitId: tag.fursuit_id,
  });

  return jsonResponse(200, formatLegacyTagResponse(updatedTag, { qr_download_url: downloadUrl }));
}

async function handleRotateQr(body: RequestBody, userId: string): Promise<Response> {
  const nfcUid = normalizeNfcUid(body.nfc_uid ?? body.uid);
  const tagOrResponse = await requireTagForUser(
    { tagId: body.tag_id, nfcUid },
    userId,
  );
  if (tagOrResponse instanceof Response) return tagOrResponse;
  const tag = tagOrResponse;

  if (!tag.qr_token) {
    return errorResponse(400, "QR_NOT_FOUND", "Tag does not have a QR token to rotate");
  }

  const { tag: updatedTag, downloadUrl } = await ensureQrForTag(tag, {
    rotate: true,
    desiredFursuitId: tag.fursuit_id,
  });

  return jsonResponse(200, formatLegacyTagResponse(updatedTag, { qr_download_url: downloadUrl }));
}

async function handleRevokeQr(body: RequestBody, userId: string): Promise<Response> {
  const nfcUid = normalizeNfcUid(body.nfc_uid ?? body.uid);
  const tagOrResponse = await requireTagForUser(
    { tagId: body.tag_id, nfcUid },
    userId,
  );
  if (tagOrResponse instanceof Response) return tagOrResponse;
  const tag = tagOrResponse;

  if (!tag.qr_token) {
    return errorResponse(400, "QR_NOT_FOUND", "Tag does not have a QR token");
  }

  const { data, error } = await supabaseAdmin
    .from("tags")
    .update({
      qr_token: null,
      qr_token_created_at: null,
      qr_asset_path: null,
      updated_at: nowIso(),
    })
    .eq("id", tag.id)
    .select("*")
    .single();

  if (error || !data) {
    errorLogger("handleRevokeQr", error);
    return errorResponse(500, "INVALID_REQUEST", "Failed to revoke QR token");
  }

  await deleteQrAsset(tag.qr_asset_path);

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
    case "generate_qr":
      return handleGenerateQr(body, userId);
    case "rotate_qr":
      return handleRotateQr(body, userId);
    case "revoke_qr":
      return handleRevokeQr(body, userId);
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
