import { json } from '@sveltejs/kit';
import { requireAdminProfile } from '$lib/server/auth';
import { createServiceRoleClient } from '$lib/server/supabase/service';

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET({ cookies, params }) {
  await requireAdminProfile(cookies);
  if (!params.id) return json({ error: 'Missing convention id' }, { status: 400 });

  const { data, error } = await createServiceRoleClient()
    .from('catches')
    .select(
      'id, convention_id, catcher_id, fursuit_id, status, points_awarded, created_at, accepted_at',
    )
    .eq('convention_id', params.id)
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) return json({ error: error.message }, { status: 500 });

  const headers = [
    'id',
    'convention_id',
    'catcher_id',
    'fursuit_id',
    'status',
    'points_awarded',
    'created_at',
    'accepted_at',
  ];
  const csv = [
    headers.join(','),
    ...(data ?? []).map((row: any) => headers.map((header) => csvEscape(row[header])).join(',')),
  ].join('\n');

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="convention-${params.id}-catches.csv"`,
    },
  });
}
