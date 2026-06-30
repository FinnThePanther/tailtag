export const OTA_RESTORE_TTL_MS = 30 * 60 * 1000;

export type OtaRestoreReason = 'ota-background-reload';

export type OtaRestoreRouteSnapshot = {
  version: 1;
  href: string;
  userId: string;
  savedAt: number;
};

export type PendingOtaRestoreSnapshot = OtaRestoreRouteSnapshot & {
  expiresAt: number;
  reason: OtaRestoreReason;
};

export type OtaRestoreResolution =
  | { action: 'restore'; href: string }
  | { action: 'clear'; reason: 'expired' | 'invalid' | 'signed-out' | 'wrong-user' }
  | { action: 'defer'; reason: 'routing-not-ready' };

export type OtaUpdateApplicationDecision = 'reload-now' | 'mark-pending-warm-update';

const DENIED_ROUTE_PREFIXES = [
  '/auth',
  '/forgot-password',
  '/reset-password',
  '/invite',
  '/onboarding',
  '/age-gate',
  '/legal-consent',
  '/change-password',
];

const MAX_RESTORE_HREF_LENGTH = 512;

type SearchParamValue = string | string[] | number | boolean | null | undefined;

export function normalizeOtaRestoreHref(href: string): string | null {
  const trimmedHref = href.trim();

  if (
    !trimmedHref ||
    trimmedHref.length > MAX_RESTORE_HREF_LENGTH ||
    !trimmedHref.startsWith('/') ||
    trimmedHref.startsWith('//') ||
    trimmedHref.includes('://')
  ) {
    return null;
  }

  try {
    const parsed = new URL(trimmedHref, 'https://tailtag.local');
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

export function isSafeOtaRestoreHref(href: string): boolean {
  const normalizedHref = normalizeOtaRestoreHref(href);

  if (!normalizedHref) {
    return false;
  }

  const pathname = normalizedHref.split('?')[0] ?? '/';

  return !DENIED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function createOtaRestoreHref(
  pathname: string,
  params: Record<string, SearchParamValue>,
): string | null {
  const normalizedPathname = normalizeOtaRestoreHref(pathname);

  if (!normalizedPathname) {
    return null;
  }

  const searchParams = new URLSearchParams();

  Object.entries(params)
    .filter(([key]) => key !== 'params' && key !== 'screen')
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .forEach(([key, value]) => {
      if (value === null || value === undefined) {
        return;
      }

      if (Array.isArray(value)) {
        value.forEach((item) => {
          searchParams.append(key, String(item));
        });
        return;
      }

      searchParams.set(key, String(value));
    });

  const queryString = searchParams.toString();
  const href = queryString ? `${normalizedPathname}?${queryString}` : normalizedPathname;

  return isSafeOtaRestoreHref(href) ? href : null;
}

export function createOtaRestoreRouteSnapshot({
  href,
  userId,
  now,
}: {
  href: string;
  userId: string;
  now: number;
}): OtaRestoreRouteSnapshot | null {
  const normalizedHref = normalizeOtaRestoreHref(href);

  if (!normalizedHref || !isSafeOtaRestoreHref(normalizedHref) || !userId) {
    return null;
  }

  return {
    version: 1,
    href: normalizedHref,
    userId,
    savedAt: now,
  };
}

export function createPendingOtaRestoreSnapshot(
  routeSnapshot: OtaRestoreRouteSnapshot | null,
  now: number,
): PendingOtaRestoreSnapshot | null {
  if (!routeSnapshot || !isSafeOtaRestoreHref(routeSnapshot.href)) {
    return null;
  }

  return {
    ...routeSnapshot,
    savedAt: now,
    expiresAt: now + OTA_RESTORE_TTL_MS,
    reason: 'ota-background-reload',
  };
}

export function resolvePendingOtaRestoreSnapshot(
  snapshot: PendingOtaRestoreSnapshot | null,
  {
    now,
    userId,
    canRestore,
  }: {
    now: number;
    userId: string | null;
    canRestore: boolean;
  },
): OtaRestoreResolution {
  if (!snapshot || snapshot.version !== 1 || !isSafeOtaRestoreHref(snapshot.href)) {
    return { action: 'clear', reason: 'invalid' };
  }

  if (!userId) {
    return { action: 'clear', reason: 'signed-out' };
  }

  if (snapshot.userId !== userId) {
    return { action: 'clear', reason: 'wrong-user' };
  }

  if (snapshot.expiresAt <= now) {
    return { action: 'clear', reason: 'expired' };
  }

  if (!canRestore) {
    return { action: 'defer', reason: 'routing-not-ready' };
  }

  return { action: 'restore', href: snapshot.href };
}

export function getOtaUpdateApplicationDecision({
  blockUi,
  appState,
}: {
  blockUi: boolean;
  appState: string;
}): OtaUpdateApplicationDecision {
  return blockUi || appState !== 'active' ? 'reload-now' : 'mark-pending-warm-update';
}
