import type { Cookies } from '@sveltejs/kit';
import { assertAdminAction } from '$lib/server/auth';
import { createServiceRoleClient } from '$lib/server/supabase/service';
import { logAudit } from '$lib/server/audit';

const REPORT_ROLES = ['owner', 'organizer', 'moderator'] as const;

export async function resolveReportAction(
  cookies: Cookies,
  input: {
    reportId: string;
    status: 'resolved' | 'dismissed';
    resolutionNotes?: string | null;
  },
) {
  const { profile } = await assertAdminAction(cookies, [...REPORT_ROLES]);
  const supabase = createServiceRoleClient();

  await supabase
    .from('user_reports')
    .update({
      status: input.status,
      resolved_by_user_id: profile.id,
      resolved_at: new Date().toISOString(),
      resolution_notes: input.resolutionNotes ?? null,
    })
    .eq('id', input.reportId);

  await logAudit({
    actorId: profile.id,
    action: 'resolve_report',
    entityType: 'user_report',
    entityId: input.reportId,
    context: { status: input.status, notes: input.resolutionNotes ?? null },
  });
}
