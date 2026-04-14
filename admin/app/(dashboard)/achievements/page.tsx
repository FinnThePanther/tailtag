import { Card } from '@/components/card';
import { fetchAchievements } from '@/lib/data';
import { AchievementForm } from '@/components/achievement-form';

export default async function AchievementsPage() {
  const achievements = await fetchAchievements();

  return (
    <Card
      title="Manual achievements"
      subtitle="Grant or revoke achievements (audit logged)"
    >
      <AchievementForm achievements={achievements} />
    </Card>
  );
}
