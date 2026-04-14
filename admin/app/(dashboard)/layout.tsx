import { Sidebar } from '@/components/sidebar';
import { TopBar } from '@/components/topbar';
import { requireAdminProfile } from '@/lib/auth';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAdminProfile();

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar profile={profile} />
      <div className="flex min-h-screen flex-1 flex-col">
        <TopBar profile={profile} />
        <main className="flex-1 space-y-6 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
