import type { Env } from "./types";

export function buildSupabaseHeaders(env: Env, initHeaders?: HeadersInit): Headers {
  const headers = new Headers(initHeaders ?? {});
  headers.set("apikey", env.SUPABASE_SERVICE_ROLE_KEY);
  headers.set("Authorization", `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  return headers;
}

export async function supabaseFetch(
  env: Env,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${env.SUPABASE_URL}${path}`;
  const headers = buildSupabaseHeaders(env, init.headers);
  const method = init.method ? init.method.toUpperCase() : "GET";

  if (method !== "GET" && method !== "HEAD" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...init, headers });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(
      `Supabase request failed (${response.status} ${response.statusText}) for ${path}: ${errorText}`,
    );
  }

  return response;
}
