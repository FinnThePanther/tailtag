import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { Card } from '@/components/card';
import { CreateConventionForm } from '@/components/create-convention-form';
import { canManageConventionConfig } from '@/lib/admin-permissions';
import { requireAdminProfile } from '@/lib/auth';

export default async function NewConventionPage() {
  const { profile } = await requireAdminProfile();

  if (!canManageConventionConfig(profile)) {
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
          subtitle="Owner or organizer access is required"
        >
          <p className="text-sm text-muted">
            Your admin role can view conventions, but it cannot create or configure them.
          </p>
        </Card>
      </div>
    );
  }

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
