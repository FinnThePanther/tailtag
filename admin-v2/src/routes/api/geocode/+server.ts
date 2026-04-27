import { json } from '@sveltejs/kit';
import { env } from '$lib/server/env';

export async function GET({ url }) {
  const query = url.searchParams.get('q')?.trim();
  if (!query) return json({ error: 'Missing query' }, { status: 400 });
  if (!env.mapboxAccessToken)
    return json({ error: 'Mapbox token not configured' }, { status: 500 });

  const endpoint = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
  );
  endpoint.searchParams.set('access_token', env.mapboxAccessToken);
  endpoint.searchParams.set('limit', '5');
  endpoint.searchParams.set('types', 'poi,address,place,locality,neighborhood');

  const response = await fetch(endpoint.toString(), { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    return json({ error: 'Geocoding failed' }, { status: response.status });
  }

  const payload = await response.json();
  const results = (payload.features ?? []).map((feature: any) => ({
    id: feature.id,
    name: feature.text,
    place: feature.place_name,
    longitude: feature.center?.[0] ?? null,
    latitude: feature.center?.[1] ?? null,
  }));

  return json({ results });
}
