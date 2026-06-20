import { notFound } from 'next/navigation';
import { ShieldAlert, Activity } from 'lucide-react';

import { Card } from '@/components/card';
import { Table } from '@/components/table';
import {
  fetchConventions,
  fetchFeatureFlags,
  fetchPlayerProfile,
  fetchUserBlocks,
} from '@/lib/data';
import { ModerationPanel } from '@/components/moderation-panel';
import { requireAdminDataContext } from '@/lib/auth';
import { setFeatureFlagProfileOverrideAction } from '../../feature-flags/actions';

export default async function PlayerDetail({ params }: { params: { id: string } }) {
  const { supabase, profile: adminProfile } = await requireAdminDataContext();
  const [
    { profile, moderationSummary, actions, flagOverrides },
    featureFlags,
    conventions,
    blocks,
  ] = await Promise.all([
    fetchPlayerProfile(supabase, params.id),
    fetchFeatureFlags(supabase),
    fetchConventions(supabase),
    fetchUserBlocks(supabase, params.id),
  ]);

  if (!profile) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Card
        title={profile.username ?? 'Player'}
        subtitle={profile.id}
        actions={
          profile.is_suspended ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200">
              <ShieldAlert size={14} />
              Suspended
            </span>
          ) : null
        }
      >
        <div className="grid gap-4 md:grid-cols-4">
          <Info
            label="Role"
            value={profile.role}
          />
          <Info
            label="Created"
            value={profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
          />
          <Info
            label="Suspended until"
            value={profile.suspended_until ?? '—'}
          />
          <Info
            label="Suspension reason"
            value={profile.suspension_reason ?? '—'}
          />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card
          title="Moderation summary"
          subtitle="Counts and flags"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryMetric
              label="Active bans"
              value={(moderationSummary as any)?.active_bans ?? 0}
            />
            <SummaryMetric
              label="Reports"
              value={(moderationSummary as any)?.report_count ?? 0}
            />
            <SummaryMetric
              label="Pending reports"
              value={(moderationSummary as any)?.pending_reports ?? 0}
            />
            <SummaryMetric
              label="Blocked by others"
              value={(moderationSummary as any)?.users_blocked ?? 0}
            />
          </div>
        </Card>
        <ModerationPanel
          userId={profile.id}
          isSuspended={profile.is_suspended}
          conventions={conventions}
        />
      </div>

      <Card
        title="Feature access"
        subtitle="Per-player beta rollout overrides"
      >
        <FeatureFlagOverrideForm
          profileId={profile.id}
          canManage={adminProfile.role === 'owner' || adminProfile.role === 'organizer'}
          flags={featureFlags as FeatureFlag[]}
          overrides={flagOverrides as FeatureFlagOverride[]}
        />
      </Card>

      <Card
        title="User blocks"
        subtitle="Block relationships"
      >
        <Table headers={['Direction', 'Username', 'Date']}>
          {blocks.map((block) => (
            <tr key={block.id}>
              <td className="px-4 py-3 text-slate-200">
                {block.direction === 'blocked' ? 'Blocked' : 'Blocked by'}
              </td>
              <td className="px-4 py-3 text-slate-200">
                {block.other_username ?? block.other_user_id}
              </td>
              <td className="px-4 py-3 text-slate-200">
                {new Date(block.created_at).toLocaleString()}
              </td>
            </tr>
          ))}
          {blocks.length === 0 ? (
            <tr>
              <td
                className="px-4 py-3 text-sm text-muted"
                colSpan={3}
              >
                No block relationships.
              </td>
            </tr>
          ) : null}
        </Table>
      </Card>

      <Card
        title="Recent moderation actions"
        subtitle="Latest 10 actions"
      >
        <Table headers={['Type', 'Scope', 'Reason', 'Duration', 'Status', 'Created']}>
          {actions?.map((action) => (
            <tr key={action.id}>
              <td className="px-4 py-3 capitalize text-slate-200">{action.action_type}</td>
              <td className="px-4 py-3 text-slate-200">
                {action.scope}
                {action.convention_id ? ` (${action.convention_id})` : ''}
              </td>
              <td className="px-4 py-3 text-slate-200">{action.reason ?? '—'}</td>
              <td className="px-4 py-3 text-slate-200">
                {action.duration_hours ? `${action.duration_hours}h` : '—'}
              </td>
              <td className="px-4 py-3 text-slate-200">
                {action.is_active ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-200">
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-1 text-xs font-semibold text-slate-200">
                    Inactive
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-slate-200">
                {new Date(action.created_at).toLocaleString()}
              </td>
            </tr>
          ))}
          {!actions?.length ? (
            <tr>
              <td
                className="px-4 py-3 text-sm text-muted"
                colSpan={6}
              >
                No moderation actions recorded.
              </td>
            </tr>
          ) : null}
        </Table>
      </Card>
    </div>
  );
}

function FeatureFlagOverrideForm({
  profileId,
  canManage,
  flags,
  overrides,
}: {
  profileId: string;
  canManage: boolean;
  flags: FeatureFlag[];
  overrides: FeatureFlagOverride[];
}) {
  const overrideByFeatureKey = new Map(
    overrides.map((override) => [override.feature_key, override]),
  );

  return (
    <div className="space-y-3">
      {flags.map((flag) => {
        const override = overrideByFeatureKey.get(flag.key);
        const status = override
          ? override.enabled
            ? 'Force enabled'
            : 'Force disabled'
          : 'Default rollout';

        return (
          <div
            key={flag.key}
            className="space-y-3 rounded-xl border border-border bg-background/50 p-3"
          >
            <div className="grid gap-3 md:grid-cols-4">
              <Info
                label={flag.key}
                value={status}
              />
              <Info
                label="Global rollout"
                value={`${flag.enabled ? 'Enabled' : 'Disabled'} / ${flag.rollout_percentage}%`}
              />
              <Info
                label="Reason"
                value={override?.reason ?? '-'}
              />
              <Info
                label="Updated"
                value={override?.updated_at ? new Date(override.updated_at).toLocaleString() : '-'}
              />
            </div>
            {flag.description ? <p className="text-sm text-muted">{flag.description}</p> : null}
            {canManage ? (
              <form
                action={setFeatureFlagProfileOverrideAction}
                className="flex flex-wrap items-end gap-3"
              >
                <input
                  type="hidden"
                  name="feature_key"
                  value={flag.key}
                />
                <input
                  type="hidden"
                  name="profile_id"
                  value={profileId}
                />
                <label className="grid gap-1 text-sm text-slate-200">
                  Override
                  <select
                    name="override_action"
                    defaultValue={override ? (override.enabled ? 'enable' : 'disable') : 'clear'}
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm text-white"
                  >
                    <option value="enable">Force enable</option>
                    <option value="disable">Force disable</option>
                    <option value="clear">Use default rollout</option>
                  </select>
                </label>
                <label className="grid min-w-64 flex-1 gap-1 text-sm text-slate-200">
                  Reason
                  <input
                    name="reason"
                    defaultValue={override?.reason ?? ''}
                    placeholder="Pilot cohort, support request, or rollout note"
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm text-white"
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-md border border-primary/40 px-4 py-2 text-sm font-semibold text-primary"
                >
                  Save override
                </button>
              </form>
            ) : null}
          </div>
        );
      })}
      {flags.length === 0 ? (
        <p className="text-sm text-muted">No feature flags configured.</p>
      ) : null}
      {!canManage ? (
        <p className="text-sm text-muted">Only owners and organizers can manage feature access.</p>
      ) : null}
    </div>
  );
}

interface FeatureFlag {
  key: string;
  description: string | null;
  enabled: boolean;
  rollout_percentage: number;
}

interface FeatureFlagOverride {
  feature_key: string;
  enabled: boolean;
  reason: string | null;
  updated_at: string | null;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-base font-semibold text-white">{value}</p>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-background/50 px-3 py-2">
      <div className="flex items-center gap-2 text-sm text-slate-200">
        <Activity
          size={14}
          className="text-primary"
        />
        <span>{label}</span>
      </div>
      <span className="text-lg font-semibold text-white">{value}</span>
    </div>
  );
}
