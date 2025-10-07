import { supabase } from '../../../lib/supabase';

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
    console.error('Failed to trigger achievements processor', error);
  }
}

