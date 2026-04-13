export type UserBlock = {
  id: string;
  blockerId: string;
  blockedId: string;
  blockedUsername: string | null;
  blockedAvatarUrl: string | null;
  createdAt: string;
};

export type ReportType = 'inappropriate_content' | 'harassment' | 'cheating' | 'spam' | 'other';

export type ReportInput = {
  reportedUserId?: string;
  reportedFursuitId?: string;
  reportType: ReportType;
  description: string;
  conventionId?: string;
};

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  inappropriate_content: 'Inappropriate content',
  harassment: 'Harassment',
  cheating: 'Cheating',
  spam: 'Spam',
  other: 'Other',
};
