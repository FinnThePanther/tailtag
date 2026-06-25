import type { Database } from '../../types/database';

export type CatchMode = Database['public']['Enums']['catch_mode'];
export type CatchStatus = Database['public']['Enums']['catch_status'];
export type CatchPhotoSource = 'camera' | 'gallery';
export type CatchPhotoUploadState = 'not_required' | 'pending_upload' | 'uploaded' | 'failed';

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
  photoUploadState?: CatchPhotoUploadState;
  reciprocalOfferId?: string | null;
  reciprocalFursuitId?: string | null;
  reciprocalFursuitName?: string | null;
  reciprocalFursuitAvatarUrl?: string | null;
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
  photoUploadState?: CatchPhotoUploadState;
};

export type ConfirmCatchResult = {
  success: boolean;
  catchId: string;
  decision: 'accept' | 'reject';
  message?: string;
  reciprocalOffer?: ReciprocalCatchOfferResult | null;
};

export type ReciprocalCatchOfferStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELED';

export type ReciprocalCatchOfferResult = {
  offerId: string | null;
  status: ReciprocalCatchOfferStatus;
  reciprocalCatchId: string | null;
  failureReason: string | null;
  eventEnqueued?: boolean;
  offeredFursuitId?: string | null;
  offeredFursuitName?: string | null;
  offeredFursuitAvatarPath?: string | null;
  offeredFursuitAvatarUrl?: string | null;
  recipientProfileId?: string | null;
};

export type CreateCatchResult = {
  catchId: string;
  clientAttemptId: string;
  status: CatchStatus;
  expiresAt: string | null;
  catchNumber: number | null;
  requiresApproval: boolean;
  fursuitOwnerId: string | null;
  conventionId: string | null;
  fursuitId?: string;
  fursuitName?: string;
  fursuitAvatarPath?: string | null;
  fursuitAvatarUrl?: string | null;
  fursuitSpeciesId?: string | null;
  fursuitSpeciesName?: string | null;
  photoUploadState: CatchPhotoUploadState;
  reciprocalOffer?: ReciprocalCatchOfferResult | null;
  edgeRequestMs: number | null;
};

export type CreateCatchParams = {
  fursuitId?: string;
  fursuitCode?: string;
  conventionId: string | null;
  clientAttemptId?: string;
  method?: 'code' | 'camera_photo' | 'gallery_photo';
  timeoutMs?: number;
  forcePending?: boolean;
  hasPhoto?: boolean;
  photoPath?: string | null;
  photoUrl?: string | null;
  photoSource?: CatchPhotoSource | null;
  photoUploadState?: Extract<CatchPhotoUploadState, 'pending_upload' | 'uploaded'> | null;
  reciprocalFursuitId?: string | null;
};

export type PhotoCatchBatchFursuit = {
  id: string;
  name: string;
  avatarUrl: string | null;
  species: string | null;
};

export type PhotoCatchBatchItemStatus =
  | 'confirmed'
  | 'pending_approval'
  | 'already_caught'
  | 'not_eligible'
  | 'failed'
  | 'photo_pending';

export type PhotoCatchBatchItemResult = {
  fursuit: PhotoCatchBatchFursuit;
  status: PhotoCatchBatchItemStatus;
  catchId?: string;
  catchResult?: CreateCatchResult;
  message?: string;
};

export type PhotoCatchBatchResult = {
  batchId: string;
  photoSource: CatchPhotoSource;
  conventionId: string | null;
  localPhotoUri: string;
  results: PhotoCatchBatchItemResult[];
};

export type UpdateCatchPhotoResult = {
  photoUploadState: Extract<CatchPhotoUploadState, 'uploaded' | 'failed'>;
  alreadyUploaded: boolean;
  photoPath: string | null;
  photoUrl: string | null;
};

export type MarkCatchPhotoUploadFailedResult = {
  photoUploadState: Extract<CatchPhotoUploadState, 'failed' | 'uploaded'>;
  alreadyUploaded: boolean;
  photoPath: string | null;
  photoUrl: string | null;
};
