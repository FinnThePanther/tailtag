import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { Card } from '@/components/card';
import { ConventionGeofenceForm } from '@/components/convention-geofence-form';
import { fetchConvention } from '@/lib/data';

export default async function ConventionLocationPage({ params }: { params: { id: string } }) {
  const { convention } = await fetchConvention(params.id);

  if (!convention) {
    notFound();
  }

  return (
    <div className="space-y-4">
      <Link
        href={`/conventions/${params.id}`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition hover:opacity-80"
      >
        <ArrowLeft size={14} /> Back to convention
      </Link>

      <Card title="Geo-fence & verification" subtitle="Define the area that counts as on-site">
        <ConventionGeofenceForm
          conventionId={convention.id}
          name={convention.name}
          location={convention.location}
          latitude={convention.latitude}
          longitude={convention.longitude}
          radiusMeters={convention.geofence_radius_meters}
          geofenceEnabled={Boolean(convention.geofence_enabled)}
          verificationRequired={Boolean(convention.location_verification_required)}
        />
      </Card>
    </div>
  );
}
