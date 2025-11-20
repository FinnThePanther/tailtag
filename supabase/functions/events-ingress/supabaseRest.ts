const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey =
  Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase configuration for REST fetch");
}

export async function supabaseRestFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${supabaseUrl}${path}`;
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceRoleKey);
  headers.set("Authorization", `Bearer ${serviceRoleKey}`);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  try {
    const response = await fetch(url, { ...init, headers });
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(
        `Supabase REST request failed (${response.status} ${response.statusText}) for ${path}: ${errorText}`,
      );
    }
    return response;
  } catch (error) {
    console.error("[supabaseRestFetch] request failed", { path, error });
    throw error;
  }
}
