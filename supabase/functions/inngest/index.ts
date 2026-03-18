import { Inngest } from "https://esm.sh/inngest";
import { serve } from "https://esm.sh/inngest/edge";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export const inngest = new Inngest({ id: "tailtag" });

const healthCheck = inngest.createFunction(
  { id: "health-check" },
  { event: "tailtag/health.check" },
  async () => {
    return { ok: true };
  },
);

const functions = [healthCheck];

Deno.serve(
  serve({ client: inngest, functions, servePath: "/functions/v1/inngest" }),
);
