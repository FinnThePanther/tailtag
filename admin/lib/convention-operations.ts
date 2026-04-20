import { env } from './env';

export type ConventionCloseoutSource =
  | 'admin_close'
  | 'admin_retry'
  | 'admin_regenerate'
  | 'cron_close'
  | 'cron_retry';

export type ConventionDailiesSource =
  | 'admin_manual'
  | 'admin_detail'
  | 'create_convention'
  | 'start_convention';

export type ConventionCloseoutResult = {
  convention_id: string;
  status: 'archived';
  already_archived: boolean;
  summary: Record<string, unknown>;
  recaps_generated: number;
  pending_catches_expired: number;
  profile_memberships_removed: number;
  fursuit_assignments_removed: number;
};

export async function ensureConventionDailies(
  conventionId: string,
  actorId: string,
  source: ConventionDailiesSource = 'admin_manual',
) {
  if (!env.supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to rotate daily tasks.');
  }

  const params = new URLSearchParams({
    convention_id: conventionId,
    source,
    actor_id: actorId,
  });

  const response = await fetch(`${env.supabaseUrl}/functions/v1/rotate-dailys?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.supabaseServiceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const error = body && typeof body.error === 'string' ? body.error : 'Failed to rotate dailies.';
    throw new Error(error);
  }

  return body;
}

export async function closeOutConvention(
  conventionId: string,
  actorId: string,
  source: ConventionCloseoutSource,
  options: { forceRegenerate?: boolean } = {},
): Promise<ConventionCloseoutResult> {
  if (!env.supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to close out conventions.');
  }

  const response = await fetch(`${env.supabaseUrl}/functions/v1/close-out-convention`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.supabaseServiceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      convention_id: conventionId,
      actor_id: actorId,
      source,
      force_regenerate: options.forceRegenerate === true,
    }),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const error =
      body && typeof body.error === 'string' ? body.error : 'Failed to close out convention.';
    throw new Error(error);
  }

  return body as ConventionCloseoutResult;
}
