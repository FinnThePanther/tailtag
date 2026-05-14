import type { Database } from '../../types/database';

export type CatchMode = Database['public']['Enums']['catch_mode'];
export type CatchStatus = Database['public']['Enums']['catch_status'];
export type CatchPhotoSource = 'camera' | 'gallery';

export type PendingCatch = {
  catchId: string;
  catcherId: string;
  catcherUsername: string;
  catcherAvatarPath?: string | null;
  catcherAvatarUrl: string | null;
  fursuitId: string;
  fursuitName: string;
  fursuitAvatarPath?: string | null;
  fursuitAvatarUrl: string | null;
  conventionId: string;
  conventionName: string;
  caughtAt: string;
  expiresAt: string;
  timeRemaining: string;
  catchPhotoPath?: string | null;
  catchPhotoUrl: string | null;
  catchPhotoSource?: CatchPhotoSource | null;
};

/** Catches the current user made that are awaiting owner approval (catcher's view). */
export type MyPendingCatch = {
  catchId: string;
  fursuitId: string;
  fursuitName: string;
  fursuitAvatarPath?: string | null;
  fursuitAvatarUrl: string | null;
  conventionId: string | null;
  conventionName: string;
  caughtAt: string;
  expiresAt: string | null;
  catchPhotoSource?: CatchPhotoSource | null;
};

export type ConfirmCatchResult = {
  success: boolean;
  catchId: string;
  decision: 'accept' | 'reject';
  message?: string;
};

export type CreateCatchResult = {
  catchId: string;
  clientAttemptId: string;
  status: CatchStatus;
  expiresAt: string | null;
  catchNumber: number | null;
  requiresApproval: boolean;
  fursuitOwnerId: string;
  edgeRequestMs: number | null;
};

export type CreateCatchParams = {
  fursuitId: string;
  conventionId: string | null;
  clientAttemptId?: string;
  method?: 'code' | 'camera_photo' | 'gallery_photo';
  isTutorial?: boolean;
  forcePending?: boolean;
  hasPhoto?: boolean;
  photoPath?: string | null;
  photoUrl?: string | null;
  photoSource?: CatchPhotoSource | null;
};
