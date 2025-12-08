import { createServiceRoleClient } from './supabase/service';

type AuditEntry = {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  diff?: Record<string, unknown> | null;
  context?: Record<string, unknown> | null;
};

export async function logAudit(entry: AuditEntry) {
  const supabase = createServiceRoleClient();
  await supabase.from('audit_log').insert({
    actor_id: entry.actorId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    diff: entry.diff ?? null,
    context: entry.context ?? null,
  });
}
