import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q');
  if (!query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'Mapbox token not configured' }, { status: 500 });
  }

  const endpoint = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`
  );
  endpoint.searchParams.set('access_token', token);
  endpoint.searchParams.set('limit', '5');

  const response = await fetch(endpoint.toString(), {
    headers: {
      'User-Agent': 'tailtag-admin',
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: `Geocoding failed (${response.status})` },
      { status: response.status }
    );
  }

  const payload = await response.json();
  const results =
    payload?.features?.map((feature: any) => ({
      id: feature.id,
      name: feature.text ?? feature.place_name,
      place: feature.place_name ?? feature.text,
      latitude: feature.center?.[1] ?? null,
      longitude: feature.center?.[0] ?? null,
    })) ?? [];

  return NextResponse.json({ results });
}
