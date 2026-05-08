import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTICE_VERSION = 'v1';

const migrationNoticeKey = (userId: string) =>
  `tailtag:suits:auto-enroll-migration-notice:${NOTICE_VERSION}:${userId}`;

const pendingJoinNoticeKey = (userId: string) =>
  `tailtag:suits:auto-enroll-pending-join-notice:${NOTICE_VERSION}:${userId}`;

export type SuitAutoEnrollNotice = {
  conventionId?: string | null;
  conventionName?: string | null;
};

export async function queueSuitAutoEnrollNotice(
  userId: string,
  notice: SuitAutoEnrollNotice,
): Promise<void> {
  try {
    await AsyncStorage.setItem(pendingJoinNoticeKey(userId), JSON.stringify(notice));
  } catch (error) {
    console.warn('Failed to queue suit auto-enroll notice', error);
  }
}

export async function consumeSuitAutoEnrollNotice(
  userId: string,
): Promise<SuitAutoEnrollNotice | null> {
  try {
    const key = pendingJoinNoticeKey(userId);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      return null;
    }

    await AsyncStorage.removeItem(key);
    const parsed = JSON.parse(raw) as SuitAutoEnrollNotice;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('Failed to consume suit auto-enroll notice', error);
    return null;
  }
}

export async function hasSeenSuitAutoEnrollMigrationNotice(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(migrationNoticeKey(userId))) === 'true';
  } catch (error) {
    console.warn('Failed to read suit auto-enroll migration notice', error);
    return true;
  }
}

export async function markSuitAutoEnrollMigrationNoticeSeen(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(migrationNoticeKey(userId), 'true');
  } catch (error) {
    console.warn('Failed to mark suit auto-enroll migration notice seen', error);
  }
}
