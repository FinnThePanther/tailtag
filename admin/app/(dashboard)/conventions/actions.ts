'use server';

import { revalidatePath } from 'next/cache';

import { assertAdminAction } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { logAudit } from '@/lib/audit';

const CONFIG_ROLES = ['owner', 'organizer'] as const;

type ConventionConfig = {
  cooldowns?: { catch_seconds?: number | null };
  points?: { catch?: number | null };
  feature_flags?: { tag_scan?: boolean; staff_mode?: boolean };
};

export async function updateConventionConfigAction(input: {
  conventionId: string;
  catchCooldownSeconds: number | null;
  catchPoints: number | null;
  featureTagScan: boolean;
  featureStaffMode: boolean;
}) {
  const { profile } = await assertAdminAction([...CONFIG_ROLES]);
  const supabase = createServiceRoleClient();

  const { data: current } = await supabase
    .from('conventions')
    .select('config')
    .eq('id', input.conventionId)
    .single();

  const existing = (current?.config as ConventionConfig | null) ?? {};
  const next: ConventionConfig = {
    cooldowns: {
      ...existing.cooldowns,
      catch_seconds: input.catchCooldownSeconds,
    },
    points: {
      ...existing.points,
      catch: input.catchPoints,
    },
    feature_flags: {
      ...existing.feature_flags,
      tag_scan: input.featureTagScan,
      staff_mode: input.featureStaffMode,
    },
  };

  await supabase.from('conventions').update({ config: next }).eq('id', input.conventionId);

  await logAudit({
    actorId: profile.id,
    action: 'update_convention_config',
    entityType: 'convention',
    entityId: input.conventionId,
    diff: { before: existing, after: next },
  });

  revalidatePath('/conventions');
  revalidatePath(`/conventions/${input.conventionId}`);
}
