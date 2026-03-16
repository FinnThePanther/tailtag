export type UserBlock = {
  id: string;
  blockerId: string;
  blockedId: string;
  blockedUsername: string | null;
  blockedAvatarUrl: string | null;
  createdAt: string;
};

export type ReportType =
  | 'inappropriate_conduct'
  | 'harassment'
  | 'inappropriate_content'
  | 'cheating'
  | 'impersonation'
  | 'other';

export type ReportInput = {
  reportedUserId?: string;
  reportedFursuitId?: string;
  reportType: ReportType;
  description: string;
  conventionId?: string;
};

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  inappropriate_conduct: 'Inappropriate conduct',
  harassment: 'Harassment',
  inappropriate_content: 'Inappropriate content',
  cheating: 'Cheating',
  impersonation: 'Impersonation',
  other: 'Other',
};
