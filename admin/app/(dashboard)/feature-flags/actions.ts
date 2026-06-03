'use server';

import { revalidatePath } from 'next/cache';

import { assertAdminAction } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { createServiceRoleClient } from '@/lib/supabase/service';

const FEATURE_FLAG_ROLES = ['owner', 'organizer'] as const;

function parseRolloutPercentage(value: FormDataEntryValue | null) {
  const parsed = Number.parseInt(String(value ?? '0'), 10);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(100, Math.max(0, parsed));
}

export async function updateFeatureFlagAction(formData: FormData) {
  const { profile } = await assertAdminAction([...FEATURE_FLAG_ROLES]);
  const supabase = createServiceRoleClient();
  const key = String(formData.get('key') ?? '').trim();
  const enabled = formData.get('enabled') === 'on';
  const rolloutPercentage = parseRolloutPercentage(formData.get('rollout_percentage'));

  if (!key) {
    throw new Error('Feature flag key is required.');
  }

  const { error } = await (supabase as any)
    .from('feature_flags')
    .update({
      enabled,
      rollout_percentage: rolloutPercentage,
    })
    .eq('key', key);

  if (error) {
    throw error;
  }

  await logAudit({
    actorId: profile.id,
    action: 'update_feature_flag',
    entityType: 'feature_flag',
    entityId: null,
    context: {
      key,
      enabled,
      rollout_percentage: rolloutPercentage,
    },
  });

  revalidatePath('/feature-flags');
}

export async function setFeatureFlagProfileOverrideAction(formData: FormData) {
  const { profile } = await assertAdminAction([...FEATURE_FLAG_ROLES]);
  const supabase = createServiceRoleClient();
  const featureKey = String(formData.get('feature_key') ?? '').trim();
  const profileId = String(formData.get('profile_id') ?? '').trim();
  const action = String(formData.get('override_action') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim() || null;

  if (!featureKey || !profileId) {
    throw new Error('Feature key and profile id are required.');
  }

  if (action === 'clear') {
    const { error } = await (supabase as any)
      .from('feature_flag_profile_overrides')
      .delete()
      .eq('feature_key', featureKey)
      .eq('profile_id', profileId);

    if (error) {
      throw error;
    }
  } else {
    const enabled = action === 'enable';

    if (action !== 'enable' && action !== 'disable') {
      throw new Error('Invalid override action.');
    }

    const { error } = await (supabase as any).from('feature_flag_profile_overrides').upsert(
      {
        feature_key: featureKey,
        profile_id: profileId,
        enabled,
        reason,
        created_by_user_id: profile.id,
      },
      { onConflict: 'feature_key,profile_id' },
    );

    if (error) {
      throw error;
    }
  }

  await logAudit({
    actorId: profile.id,
    action: 'set_feature_flag_profile_override',
    entityType: 'profile',
    entityId: profileId,
    context: {
      feature_key: featureKey,
      override_action: action,
      reason,
    },
  });

  revalidatePath('/feature-flags');
  revalidatePath(`/players/${profileId}`);
}
