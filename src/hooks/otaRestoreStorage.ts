import AsyncStorage from '@react-native-async-storage/async-storage';

import { captureHandledException } from '@/lib/sentry';

import {
  createOtaRestoreRouteSnapshot,
  createPendingOtaRestoreSnapshot,
  isSafeOtaRestoreHref,
  type OtaRestoreRouteSnapshot,
  type PendingOtaRestoreSnapshot,
} from './otaRestoreState';

const LATEST_SAFE_ROUTE_KEY = 'tailtag:ota:lastSafeRoute:v1';
const PENDING_RESTORE_KEY = 'tailtag:ota:pendingRestore:v1';

function parseRouteSnapshot(raw: string | null): OtaRestoreRouteSnapshot | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<OtaRestoreRouteSnapshot>;

    if (
      parsed.version !== 1 ||
      typeof parsed.href !== 'string' ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.savedAt !== 'number' ||
      !isSafeOtaRestoreHref(parsed.href)
    ) {
      return null;
    }

    return {
      version: 1,
      href: parsed.href,
      userId: parsed.userId,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

function parsePendingSnapshot(raw: string | null): PendingOtaRestoreSnapshot | null {
  const routeSnapshot = parseRouteSnapshot(raw);

  if (!routeSnapshot || !raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PendingOtaRestoreSnapshot>;

    if (typeof parsed.expiresAt !== 'number' || parsed.reason !== 'ota-background-reload') {
      return null;
    }

    return {
      ...routeSnapshot,
      expiresAt: parsed.expiresAt,
      reason: 'ota-background-reload',
    };
  } catch {
    return null;
  }
}

export async function saveLatestOtaRestoreRoute({
  href,
  userId,
  now = Date.now(),
}: {
  href: string;
  userId: string;
  now?: number;
}): Promise<void> {
  try {
    const snapshot = createOtaRestoreRouteSnapshot({ href, userId, now });

    if (!snapshot) {
      return;
    }

    await AsyncStorage.setItem(LATEST_SAFE_ROUTE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    captureHandledException(error, { scope: 'otaRestore.saveLatestRoute' });
  }
}

export async function loadLatestOtaRestoreRoute(): Promise<OtaRestoreRouteSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(LATEST_SAFE_ROUTE_KEY);
    const snapshot = parseRouteSnapshot(raw);

    if (!snapshot && raw) {
      await AsyncStorage.removeItem(LATEST_SAFE_ROUTE_KEY);
    }

    return snapshot;
  } catch (error) {
    captureHandledException(error, { scope: 'otaRestore.loadLatestRoute' });
    return null;
  }
}

export async function savePendingOtaRestoreFromLatestRoute(now = Date.now()): Promise<boolean> {
  try {
    const latestRoute = await loadLatestOtaRestoreRoute();
    const pendingSnapshot = createPendingOtaRestoreSnapshot(latestRoute, now);

    if (!pendingSnapshot) {
      return false;
    }

    await AsyncStorage.setItem(PENDING_RESTORE_KEY, JSON.stringify(pendingSnapshot));
    return true;
  } catch (error) {
    captureHandledException(error, { scope: 'otaRestore.savePendingRestore' });
    return false;
  }
}

export async function loadPendingOtaRestore(): Promise<PendingOtaRestoreSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_RESTORE_KEY);
    const snapshot = parsePendingSnapshot(raw);

    if (!snapshot && raw) {
      await AsyncStorage.removeItem(PENDING_RESTORE_KEY);
    }

    return snapshot;
  } catch (error) {
    captureHandledException(error, { scope: 'otaRestore.loadPendingRestore' });
    return null;
  }
}

export async function clearPendingOtaRestore(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_RESTORE_KEY);
  } catch (error) {
    captureHandledException(error, { scope: 'otaRestore.clearPendingRestore' });
  }
}
