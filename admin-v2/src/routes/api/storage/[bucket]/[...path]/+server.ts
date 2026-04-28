import { json } from '@sveltejs/kit';
import { requireAdminProfile } from '$lib/server/auth';
import { ALLOWED_MEDIA_BUCKETS } from '$lib/server/storage';
import { createServiceRoleClient } from '$lib/server/supabase/service';

export async function GET({ cookies, params }) {
  await requireAdminProfile(cookies);
  const bucket = params.bucket;
  const path = params.path;

  if (!bucket || !path) return json({ error: 'Missing storage path' }, { status: 400 });
  if (!ALLOWED_MEDIA_BUCKETS.includes(bucket as (typeof ALLOWED_MEDIA_BUCKETS)[number])) {
    return json({ error: 'Bucket not allowed' }, { status: 403 });
  }

  const { data, error } = await createServiceRoleClient().storage.from(bucket).download(path);
  if (error || !data)
    return json({ error: error?.message ?? 'Not found' }, { status: error ? 500 : 404 });

  return new Response(data, {
    status: 200,
    headers: {
      'Content-Type': data.type || 'application/octet-stream',
      'Cache-Control': 'private, max-age=60, must-revalidate',
    },
  });
}
