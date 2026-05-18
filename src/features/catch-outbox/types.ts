import type { CatchPhotoSource } from '@/features/catch-confirmations/types';

export type CatchOutboxStatus =
  | 'queued'
  | 'uploading'
  | 'syncing'
  | 'confirmed'
  | 'pending_approval'
  | 'failed';

export type CatchOutboxItem = {
  clientAttemptId: string;
  method: 'code' | 'camera_photo' | 'gallery_photo';
  status: CatchOutboxStatus;
  fursuitCode?: string;
  fursuitId?: string;
  fursuitOwnerId?: string;
  fursuitName?: string;
  fursuitAvatarUrl?: string | null;
  fursuitAvatarPath?: string | null;
  fursuitSpeciesName?: string | null;
  reciprocalFursuitId?: string | null;
  localPhotoUri?: string;
  photoSource?: CatchPhotoSource;
  photoPath?: string;
  photoUrl?: string | null;
  conventionId?: string | null;
  catchId?: string;
  catchNumber?: number | null;
  createdAt: string;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  resolvedAt?: string;
  retryCount: number;
  errorCode?: string;
  errorMessage?: string;
};

export type CatchOutboxResolution = {
  item: CatchOutboxItem;
  previousStatus: CatchOutboxStatus;
};
