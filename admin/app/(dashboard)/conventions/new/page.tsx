import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { Card } from '@/components/card';
import { CreateConventionForm } from '@/components/create-convention-form';

export default function NewConventionPage() {
  return (
    <div className="space-y-4">
      <Link
        href="/conventions"
        className="inline-flex items-center gap-1 text-sm text-muted transition hover:text-white"
      >
        <ArrowLeft size={14} /> Back to conventions
      </Link>
      <Card
        title="New Convention"
        subtitle="Create a convention to get started"
      >
        <CreateConventionForm />
      </Card>
    </div>
  );
}
