import { Card } from '@/components/card';
import { fetchAchievements } from '@/lib/data';
import { AchievementForm } from '@/components/achievement-form';
import { requireAdminDataContext } from '@/lib/auth';

export default async function AchievementsPage() {
  const { supabase } = await requireAdminDataContext();
  const achievements = await fetchAchievements(supabase);

  return (
    <Card
      title="Manual achievements"
      subtitle="Grant or revoke achievements (audit logged)"
    >
      <AchievementForm achievements={achievements} />
    </Card>
  );
}
