'use server';

import { revalidatePath } from 'next/cache';

import { assertAdminAction } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { logAudit } from '@/lib/audit';

const REPORT_ROLES = ['owner', 'organizer', 'moderator'] as const;

export async function resolveReportAction(input: {
  reportId: string;
  status: 'resolved' | 'dismissed';
  resolutionNotes?: string | null;
}) {
  const { profile } = await assertAdminAction([...REPORT_ROLES]);
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

  revalidatePath('/reports');
}
