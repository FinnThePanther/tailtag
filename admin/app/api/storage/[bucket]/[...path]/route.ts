import { NextResponse } from 'next/server';

import { requireAdminProfile } from '@/lib/auth';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { ALLOWED_MEDIA_BUCKETS } from '@/lib/storage';

export const dynamic = 'force-dynamic';

type RouteParams = {
  bucket: string;
  path: string[];
};

export async function GET(_req: Request, { params }: { params: RouteParams }) {
  await requireAdminProfile();

  const bucket = params.bucket;
  const path = (params.path ?? []).join('/');

  if (!bucket || !path) {
    return NextResponse.json({ error: 'Missing storage path' }, { status: 400 });
  }

  if (!ALLOWED_MEDIA_BUCKETS.includes(bucket as (typeof ALLOWED_MEDIA_BUCKETS)[number])) {
    return NextResponse.json({ error: 'Bucket not allowed' }, { status: 403 });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage.from(bucket).download(path);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'Not found' },
      { status: error ? 500 : 404 },
    );
  }

  return new NextResponse(data, {
    status: 200,
    headers: {
      'Content-Type': data.type || 'application/octet-stream',
      'Cache-Control': 'private, max-age=60, must-revalidate',
    },
  });
}
