const required = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
};

export const env = {
  get supabaseUrl() {
    return required(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL');
  },
  get supabaseAnonKey() {
    return required(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
  },
  get supabaseServiceRoleKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY;
  },
};

function getSupabaseProjectRef() {
  try {
    const hostname = new URL(env.supabaseUrl).hostname;
    if (hostname.endsWith('.supabase.co')) {
      return hostname.split('.')[0] ?? null;
    }
  } catch {
    // Fall back to the anon key payload below.
  }

  return getSupabaseProjectRefFromAnonKey();
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');

  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(padded);
  }

  return Buffer.from(padded, 'base64').toString('utf8');
}

function getSupabaseProjectRefFromAnonKey() {
  try {
    const [, payload] = env.supabaseAnonKey.split('.');
    if (!payload) {
      return null;
    }

    const decoded = JSON.parse(decodeBase64Url(payload)) as { ref?: unknown };
    return typeof decoded.ref === 'string' ? decoded.ref : null;
  } catch {
    return null;
  }
}

export function isDevSupabaseProject() {
  if (process.env.ADMIN_IS_DEV_PROJECT !== 'true') {
    return false;
  }

  const expectedProjectRef = process.env.ADMIN_DEV_SUPABASE_PROJECT_REF?.trim();
  if (!expectedProjectRef) {
    return false;
  }

  try {
    return getSupabaseProjectRef() === expectedProjectRef;
  } catch {
    return false;
  }
}

export function isRepairSupabaseProject() {
  const allowedProjectRefs = process.env.ADMIN_REPAIR_SUPABASE_PROJECT_REFS?.split(',')
    .map((ref) => ref.trim())
    .filter(Boolean);

  if (!allowedProjectRefs?.length) {
    return false;
  }

  const currentProjectRef = getSupabaseProjectRef();
  return Boolean(currentProjectRef && allowedProjectRefs.includes(currentProjectRef));
}
