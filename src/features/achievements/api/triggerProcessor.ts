import { supabase } from '../../../lib/supabase';
import { captureHandledException } from '../../../lib/sentry';

type TriggerOptions = {
  limit?: number;
  maxBatches?: number;
};

export async function triggerAchievementProcessor(options?: TriggerOptions): Promise<void> {
  try {
    await supabase.functions.invoke('achievements-processor', {
      body: {
        limit: options?.limit,
        max_batches: options?.maxBatches,
      },
    });
  } catch (error) {
    captureHandledException(error, {
      scope: 'achievements.triggerProcessor',
      action: 'invoke',
      limit: options?.limit ?? null,
      maxBatches: options?.maxBatches ?? null,
    });
  }
}
