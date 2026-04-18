import type {
  ConventionLifecycleHealthSeverity,
  ConventionLifecycleRecommendedAction,
} from '@/lib/convention-lifecycle';

export function StatusBadge({ status }: { status: string }) {
  const className =
    status === 'live'
      ? 'border-emerald-300/40 bg-emerald-400/10 text-emerald-200'
      : status === 'scheduled'
        ? 'border-sky-300/40 bg-sky-400/10 text-sky-200'
        : status === 'draft'
          ? 'border-slate-300/30 bg-white/5 text-slate-200'
          : 'border-amber-300/40 bg-amber-400/10 text-amber-100';

  return (
    <span className={`rounded-lg border px-2.5 py-1 text-xs font-semibold capitalize ${className}`}>
      {status}
    </span>
  );
}

export function HealthBadge({ severity }: { severity: ConventionLifecycleHealthSeverity }) {
  if (severity === 'healthy') return null;

  const className =
    severity === 'critical'
      ? 'border-red-300/40 bg-red-400/10 text-red-200'
      : severity === 'warning'
        ? 'border-amber-300/40 bg-amber-400/10 text-amber-100'
        : 'border-sky-300/40 bg-sky-400/10 text-sky-200';

  return (
    <span className={`rounded-lg border px-2.5 py-1 text-xs font-semibold capitalize ${className}`}>
      {severity}
    </span>
  );
}

export function formatRecommendedAction(action: ConventionLifecycleRecommendedAction) {
  switch (action) {
    case 'start_manually':
      return 'Start manually';
    case 'close_and_archive':
      return 'Close and archive';
    case 'retry_closeout':
      return 'Retry closeout';
    case 'regenerate_recaps':
      return 'Regenerate recaps';
    case 'review_dates':
      return 'Review dates';
    case 'rotate_dailies':
      return "Rotate today's tasks";
    case 'none':
    default:
      return 'No action needed';
  }
}
