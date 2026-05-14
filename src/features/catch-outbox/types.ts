export type CatchOutboxStatus = 'queued' | 'syncing' | 'confirmed' | 'pending_approval' | 'failed';

export type CatchOutboxItem = {
  clientAttemptId: string;
  method: 'code';
  status: CatchOutboxStatus;
  fursuitCode: string;
  fursuitId?: string;
  fursuitName?: string;
  fursuitAvatarUrl?: string | null;
  fursuitAvatarPath?: string | null;
  fursuitSpeciesName?: string | null;
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
