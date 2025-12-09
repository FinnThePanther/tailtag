import { NextResponse } from 'next/server';

import { createServiceRoleClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServiceRoleClient();
  const conventionId = params.id;

  const { data, error } = await supabase
    .from('catches')
    .select('id, catcher_id, fursuit_id, convention_id, status, caught_at, decided_at, rejection_reason')
    .eq('convention_id', conventionId)
    .order('caught_at', { ascending: false })
    .limit(2000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const header = ['id', 'catcher_id', 'fursuit_id', 'convention_id', 'status', 'caught_at', 'decided_at', 'rejection_reason'];
  const rows = (data ?? []).map((row) =>
    [
      row.id,
      row.catcher_id,
      row.fursuit_id,
      row.convention_id,
      row.status,
      row.caught_at,
      row.decided_at,
      (row as any).rejection_reason ?? '',
    ]
      .map((value) => `"${(value ?? '').toString().replace(/"/g, '""')}"`)
      .join(',')
  );

  const csv = [header.join(','), ...rows].join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="catches_${conventionId}.csv"`,
    },
  });
}
