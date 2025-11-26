/// <reference lib="deno.unstable" />
/**
 * Supabase Edge Function: lookup-nfc-tag
 *
 * Simple endpoint for the catch flow - looks up an NFC tag UID
 * and returns the linked fursuit ID if the tag is active.
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
  status: NfcTagStatus;
}

interface RequestBody {
  uid: string;
}

interface FoundResponse {
  found: true;
  fursuit_id: string;
}

interface NotFoundResponse {
  found: false;
  reason: string;
}

type ApiResponse = FoundResponse | NotFoundResponse | { error: string };

function jsonResponse(status: number, payload: ApiResponse) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
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
  return uid.toUpperCase().replace(/[:\s-]/g, "");
}

async function handlePost(req: Request): Promise<Response> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON payload" });
  }

  if (!body.uid || typeof body.uid !== "string") {
    return jsonResponse(400, { error: "Missing or invalid uid" });
  }

  const normalizedUid = normalizeTagUid(body.uid);

  // Look up the tag
  const { data: tag, error } = await supabaseAdmin
    .from("nfc_tags")
    .select("uid, fursuit_id, status")
    .eq("uid", normalizedUid)
    .single();

  if (error || !tag) {
    return jsonResponse(200, {
      found: false,
      reason: "TAG_NOT_REGISTERED",
    });
  }

  const typedTag = tag as NfcTagRow;

  // Check tag status
  if (typedTag.status === "pending_link") {
    return jsonResponse(200, {
      found: false,
      reason: "TAG_NOT_LINKED",
    });
  }

  if (typedTag.status === "lost") {
    return jsonResponse(200, {
      found: false,
      reason: "TAG_LOST",
    });
  }

  if (typedTag.status === "revoked") {
    return jsonResponse(200, {
      found: false,
      reason: "TAG_REVOKED",
    });
  }

  // Tag is active
  if (!typedTag.fursuit_id) {
    // Shouldn't happen for active tags, but handle gracefully
    return jsonResponse(200, {
      found: false,
      reason: "TAG_NOT_LINKED",
    });
  }

  return jsonResponse(200, {
    found: true,
    fursuit_id: typedTag.fursuit_id,
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
