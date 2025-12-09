import { createServiceRoleClient } from './supabase/service';
import type { Database } from '@/types/database';

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
  } as Database['public']['Tables']['audit_log']['Insert']);
}
