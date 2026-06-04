import { Card } from '@/components/card';
import { Table } from '@/components/table';
import { requireAdminDataContext } from '@/lib/auth';
import { fetchFeatureFlags } from '@/lib/data';
import { updateFeatureFlagAction } from './actions';

export default async function FeatureFlagsPage() {
  const { supabase, profile } = await requireAdminDataContext();
  const flags = await fetchFeatureFlags(supabase);
  const canManage = profile.role === 'owner' || profile.role === 'organizer';

  return (
    <div className="space-y-6">
      <Card
        title="Feature flags"
        subtitle="Control beta features and percentage rollouts"
      >
        <Table headers={['Feature', 'Enabled', 'Rollout', 'Updated', 'Actions']}>
          {flags.map((flag: any) => (
            <tr key={flag.key}>
              <td className="px-4 py-3">
                <div className="font-semibold text-white">{flag.key}</div>
                <div className="text-xs text-muted">{flag.description ?? '-'}</div>
              </td>
              <td className="px-4 py-3 text-slate-200">{flag.enabled ? 'Yes' : 'No'}</td>
              <td className="px-4 py-3 text-slate-200">{flag.rollout_percentage}%</td>
              <td className="px-4 py-3 text-slate-200">
                {flag.updated_at ? new Date(flag.updated_at).toLocaleString() : '-'}
              </td>
              <td className="px-4 py-3">
                {canManage ? (
                  <form
                    action={updateFeatureFlagAction}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input
                      type="hidden"
                      name="key"
                      value={flag.key}
                    />
                    <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        name="enabled"
                        defaultChecked={Boolean(flag.enabled)}
                        className="h-4 w-4"
                      />
                      Enabled
                    </label>
                    <input
                      name="rollout_percentage"
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={Number(flag.rollout_percentage ?? 0)}
                      className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm text-white"
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-primary/40 px-3 py-1 text-sm font-semibold text-primary"
                    >
                      Save
                    </button>
                  </form>
                ) : (
                  <span className="text-sm text-muted">View only</span>
                )}
              </td>
            </tr>
          ))}
          {flags.length === 0 ? (
            <tr>
              <td
                className="px-4 py-3 text-sm text-muted"
                colSpan={5}
              >
                No feature flags configured.
              </td>
            </tr>
          ) : null}
        </Table>
      </Card>
    </div>
  );
}
