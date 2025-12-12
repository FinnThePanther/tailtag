'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import 'maplibre-gl/dist/maplibre-gl.css';

import { updateConventionGeofenceAction } from '@/app/(dashboard)/conventions/actions';

type Props = {
  conventionId: string;
  name: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  geofenceEnabled: boolean;
  verificationRequired: boolean;
};

type GeocodeResult = {
  id: string;
  name: string;
  place: string;
  latitude: number | null;
  longitude: number | null;
};

type MapModule = {
  Map: any;
  Marker: any;
  Source: any;
  Layer: any;
  maplibregl: any;
};

const DEFAULT_VIEW = {
  latitude: 37.7749,
  longitude: -122.4194,
  zoom: 3,
};

export function ConventionGeofenceForm({
  conventionId,
  name,
  location,
  latitude: initialLatitude,
  longitude: initialLongitude,
  radiusMeters,
  geofenceEnabled,
  verificationRequired,
}: Props) {
  const initialView = useMemo(
    () => ({
      latitude: initialLatitude ?? DEFAULT_VIEW.latitude,
      longitude: initialLongitude ?? DEFAULT_VIEW.longitude,
      zoom: initialLatitude && initialLongitude ? 14 : DEFAULT_VIEW.zoom,
    }),
    [initialLatitude, initialLongitude]
  );

  const [latitude, setLatitude] = useState<number | null>(initialLatitude);
  const [longitude, setLongitude] = useState<number | null>(initialLongitude);
  const [radius, setRadius] = useState<number>(radiusMeters ?? 500);
  const [enabled, setEnabled] = useState<boolean>(geofenceEnabled);
  const [requireVerification, setRequireVerification] = useState<boolean>(verificationRequired);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const mapRef = useRef<any>(null);

  const mapModule = useMapLibre();
  const Map = mapModule?.Map;
  const Marker = mapModule?.Marker;
  const Source = mapModule?.Source;
  const Layer = mapModule?.Layer;

  useEffect(() => {
    if (!mapRef.current) return;
    if (latitude === null || longitude === null) return;
    mapRef.current.flyTo?.({
      center: [longitude, latitude],
      zoom: 14,
      essential: true,
    });
  }, [latitude, longitude]);

  useEffect(() => {
    if (!enabled && requireVerification) {
      setRequireVerification(false);
    }
  }, [enabled, requireVerification]);

  const geofenceFeature = useMemo(() => {
    if (!enabled || latitude === null || longitude === null) {
      return null;
    }
    return buildCircleFeature(latitude, longitude, radius);
  }, [enabled, latitude, longitude, radius]);

  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error('Geocoding failed. Check MAPBOX_ACCESS_TOKEN.');
      }
      const payload = await response.json();
      setSearchResults(payload.results ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to search for that place.');
    } finally {
      setIsSearching(false);
    }
  };

  const selectResult = (result: GeocodeResult) => {
    if (result.latitude === null || result.longitude === null) {
      return;
    }
    setLatitude(result.latitude);
    setLongitude(result.longitude);
    setSearchResults([]);
  };

  const handleMapClick = (coords: { lat: number; lng: number }) => {
    if (!enabled) return;
    setLatitude(coords.lat);
    setLongitude(coords.lng);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        await updateConventionGeofenceAction({
          conventionId,
          latitude,
          longitude,
          radiusMeters: radius,
          geofenceEnabled: enabled,
          verificationRequired: requireVerification,
        });
        setMessage('Geofence saved.');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Unable to save geofence.');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
          />
          Enable geofence for this convention
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={requireVerification}
            onChange={(event) => setRequireVerification(event.target.checked)}
            disabled={!enabled}
            className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary disabled:opacity-40"
          />
          Require location verification on opt-in
        </label>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-slate-200">Search for a venue</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleSearch();
              }
            }}
            placeholder="Orange County Convention Center"
            disabled={!enabled}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary disabled:opacity-50"
          />
          <button
            type="button"
            disabled={!enabled || isSearching}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-primary disabled:opacity-50"
            onClick={() => void handleSearch()}
          >
            {isSearching ? 'Searching…' : 'Search'}
          </button>
        </div>
        {searchResults.length > 0 ? (
          <div className="rounded-lg border border-border bg-background/70">
            {searchResults.map((result) => (
              <button
                type="button"
                key={result.id}
                onClick={() => selectResult(result)}
                className="w-full border-b border-border/60 px-3 py-2 text-left text-sm text-slate-100 last:border-none hover:bg-white/5"
              >
                <span className="font-semibold">{result.name}</span>
                <br />
                <span className="text-xs text-muted">{result.place}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <div>
            <p className="font-semibold text-slate-100">{name}</p>
            <p className="text-xs text-muted">{location ?? 'Location TBD'}</p>
          </div>
          <div className="text-right text-xs text-muted">
            {latitude !== null && longitude !== null ? (
              <>
                {latitude.toFixed(5)}, {longitude.toFixed(5)}
              </>
            ) : (
              'Tap the map to drop a pin'
            )}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-background/70 p-2">
          {Map && mapModule?.maplibregl ? (
            <Map
              ref={mapRef}
              reuseMaps
              mapLib={mapModule.maplibregl}
              initialViewState={initialView}
              onClick={(event: any) => handleMapClick(event.lngLat)}
              style={{ width: '100%', height: 360 }}
              mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
            >
              {latitude !== null && longitude !== null && enabled ? (
                <>
                  {Source && Layer && geofenceFeature ? (
                    <Source id="geofence" type="geojson" data={geofenceFeature}>
                      <Layer
                        id="geofence-fill"
                        type="fill"
                        paint={{ 'fill-color': '#2563eb', 'fill-opacity': 0.15 }}
                      />
                      <Layer
                        id="geofence-line"
                        type="line"
                        paint={{ 'line-color': '#60a5fa', 'line-width': 2, 'line-opacity': 0.8 }}
                      />
                    </Source>
                  ) : null}
                  {Marker ? (
                    <Marker latitude={latitude} longitude={longitude} anchor="bottom">
                      <div className="rounded-full bg-primary px-2 py-1 text-xs font-semibold text-slate-900 shadow">
                        Pin
                      </div>
                    </Marker>
                  ) : null}
                </>
              ) : null}
            </Map>
          ) : (
            <div className="flex h-72 items-center justify-center text-sm text-muted">
              Loading map…
            </div>
          )}
        </div>
        <p className="text-xs text-muted">
          Use the search bar or click anywhere on the map to position the pin. The radius preview updates automatically.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-slate-200">Geo-fence radius: {radius} meters</label>
        <input
          type="range"
          min={100}
          max={5000}
          step={50}
          value={radius}
          onChange={(event) => setRadius(Number(event.target.value))}
          disabled={!enabled}
          className="w-full accent-primary disabled:opacity-40"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm text-slate-200">Latitude</label>
          <input
            type="number"
            step="0.00001"
            value={latitude ?? ''}
            onChange={(event) => setLatitude(event.target.value === '' ? null : Number(event.target.value))}
            disabled={!enabled}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary disabled:opacity-40"
          />
        </div>
        <div>
          <label className="text-sm text-slate-200">Longitude</label>
          <input
            type="number"
            step="0.00001"
            value={longitude ?? ''}
            onChange={(event) => setLongitude(event.target.value === '' ? null : Number(event.target.value))}
            disabled={!enabled}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary disabled:opacity-40"
          />
        </div>
      </div>
      <p className="text-xs text-muted">
        Coordinates update automatically from the map pin. Edit them manually for minor adjustments if needed.
      </p>

      <div className="flex flex-col gap-3 border-t border-border/70 pt-4 md:flex-row md:items-center md:justify-between">
        <div className="text-xs text-muted">
          {error ? (
            <span className="text-red-400">{error}</span>
          ) : message ? (
            <span className="text-primary">{message}</span>
          ) : (
            'Changes impact player opt-ins immediately.'
          )}
        </div>
        <button
          type="submit"
          disabled={isPending || (enabled && (latitude === null || longitude === null))}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save geofence'}
        </button>
      </div>
    </form>
  );
}

function useMapLibre(): MapModule | null {
  const [module, setModule] = useState<MapModule | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([import('react-map-gl/maplibre'), import('maplibre-gl')]).then(([mapGl, maplibre]) => {
      if (mounted) {
        setModule({
          Map: mapGl.default,
          Marker: mapGl.Marker,
          Source: mapGl.Source,
          Layer: mapGl.Layer,
          maplibregl: maplibre.default,
        });
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return module;
}

function buildCircleFeature(latitude: number, longitude: number, radiusMeters: number) {
  const segments = 96;
  const coordinates: [number, number][] = [];
  const earthRadius = 6378137;
  const latRad = (latitude * Math.PI) / 180;

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * 2 * Math.PI;
    const dx = radiusMeters * Math.cos(angle);
    const dy = radiusMeters * Math.sin(angle);

    const pointLat = latitude + (dy / earthRadius) * (180 / Math.PI);
    const pointLng =
      longitude + (dx / (earthRadius * Math.cos(latRad))) * (180 / Math.PI);
    coordinates.push([pointLng, pointLat]);
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [coordinates] },
        properties: {},
      },
    ],
  };
}
