export type CatchInviteStatus =
  | 'PENDING'
  | 'CLAIMED'
  | 'APPROVED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'REPORTED'
  | 'CANCELED'
  | 'CANCELED_DUPLICATE';

export type CatchInviteCreditScope = 'full' | 'personal_only';

export type CatchInvite = {
  inviteId: string;
  status: CatchInviteStatus;
  inviterProfileId: string;
  claimedByProfileId: string | null;
  selectedFursuitId: string | null;
  conventionId: string | null;
  conventionName: string | null;
  inviteeDisplayName: string | null;
  catchPhotoPath: string | null;
  catchPhotoUrl: string | null;
  catchPhotoSource: 'camera' | 'gallery';
  caughtAt: string;
  expiresAt: string;
  creditScope: CatchInviteCreditScope;
  convertedCatchId: string | null;
  inviterUsername: string | null;
  selectedFursuitName: string | null;
  selectedFursuitAvatarPath: string | null;
  selectedFursuitAvatarUrl: string | null;
  catchId?: string | null;
  catchNumber?: number | null;
  eventEnqueued?: boolean;
};

export type CreateCatchInviteResult = {
  invite: CatchInvite;
  token: string;
  shareUrl: string;
};
