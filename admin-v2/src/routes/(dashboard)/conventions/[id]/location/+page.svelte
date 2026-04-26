<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft } from 'lucide-svelte';
  import Card from '$lib/components/Card.svelte';
  import 'maplibre-gl/dist/maplibre-gl.css';

  let { data, form } = $props();
  function initialConvention() {
    return data.convention;
  }

  let latitude = $state<number | null>(initialConvention().latitude);
  let longitude = $state<number | null>(initialConvention().longitude);
  let radiusMeters = $state<number>(initialConvention().geofence_radius_meters ?? 500);
  let geofenceEnabled = $state(Boolean(initialConvention().geofence_enabled));
  let searchQuery = $state('');
  let searchResults = $state<any[]>([]);
  let searchError = $state<string | null>(null);
  let mapContainer: HTMLDivElement;
  let map: any;
  let marker: any;

  onMount(async () => {
    const maplibregl = await import('maplibre-gl');
    map = new maplibregl.Map({
      container: mapContainer,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [longitude ?? -122.4194, latitude ?? 37.7749],
      zoom: latitude && longitude ? 14 : 3
    });
    marker = new maplibregl.Marker({ draggable: true });
    if (latitude !== null && longitude !== null) marker.setLngLat([longitude, latitude]).addTo(map);
    marker.on('dragend', () => {
      const pos = marker.getLngLat();
      latitude = pos.lat;
      longitude = pos.lng;
    });
    map.on('click', (event: any) => {
      if (!geofenceEnabled) return;
      latitude = event.lngLat.lat;
      longitude = event.lngLat.lng;
      marker.setLngLat([longitude, latitude]).addTo(map);
    });
  });

  async function search() {
    if (!searchQuery.trim()) return;
    searchError = null;
    const response = await fetch(`/api/geocode?q=${encodeURIComponent(searchQuery.trim())}`);
    if (!response.ok) {
      searchError = 'Geocoding failed. Check MAPBOX_ACCESS_TOKEN.';
      return;
    }
    const payload = await response.json();
    searchResults = payload.results ?? [];
  }

  function selectResult(result: any) {
    latitude = result.latitude;
    longitude = result.longitude;
    searchResults = [];
    if (map && latitude !== null && longitude !== null) {
      map.flyTo({ center: [longitude, latitude], zoom: 14, essential: true });
      marker.setLngLat([longitude, latitude]).addTo(map);
    }
  }
</script>

<div class="space-y-4">
  <a href={`/conventions/${data.convention.id}`} class="inline-flex items-center gap-2 text-sm font-semibold text-primary transition hover:opacity-80"><ArrowLeft size={14} /> Back to convention</a>
  <Card title="Geo-fence & verification" subtitle="Define the area that counts as on-site">
    {#if form?.error}<div class="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{form.error}</div>{/if}
    {#if form?.message}<div class="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{form.message}</div>{/if}
    {#if searchError}<div class="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{searchError}</div>{/if}
    <form class="space-y-6" method="POST" action="?/save">
      <label class="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" name="geofenceEnabled" bind:checked={geofenceEnabled} class="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary" /> Enable geofence for this convention</label>
      <p class="text-xs text-muted">When enabled, players must pass on-site location verification before they can join this convention.</p>
      <div class="space-y-2">
        <p class="text-sm text-slate-200">Search for a venue</p>
        <div class="flex gap-2">
          <input bind:value={searchQuery} placeholder="Orange County Convention Center" class="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary disabled:opacity-50" disabled={!geofenceEnabled} />
          <button type="button" onclick={search} class="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-primary disabled:opacity-50" disabled={!geofenceEnabled}>Search</button>
        </div>
        {#if searchResults.length}
          <div class="rounded-lg border border-border bg-background/70">
            {#each searchResults as result}<button type="button" onclick={() => selectResult(result)} class="w-full border-b border-border/60 px-3 py-2 text-left text-sm text-slate-100 last:border-none hover:bg-white/5"><span class="font-semibold">{result.name}</span><br /><span class="text-xs text-muted">{result.place}</span></button>{/each}
          </div>
        {/if}
      </div>
      <div class="space-y-3">
        <div class="flex items-center justify-between text-sm"><div><p class="font-semibold text-slate-100">{data.convention.name}</p><p class="text-xs text-muted">{data.convention.location ?? 'Location TBD'}</p></div><div class="text-right text-xs text-muted">{latitude !== null && longitude !== null ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` : 'Tap the map to drop a pin'}</div></div>
        <div class="rounded-xl border border-border bg-background/70 p-2"><div bind:this={mapContainer} style="width: 100%; height: 360px"></div></div>
      </div>
      <div class="grid gap-3 sm:grid-cols-3">
        <label class="text-xs text-slate-200">Latitude<input name="latitude" bind:value={latitude} class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary" /></label>
        <label class="text-xs text-slate-200">Longitude<input name="longitude" bind:value={longitude} class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary" /></label>
        <label class="text-xs text-slate-200">Radius meters<input name="radiusMeters" type="number" min="50" step="10" bind:value={radiusMeters} class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary" /></label>
      </div>
      <button class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-accent">Save geofence</button>
    </form>
  </Card>
</div>
