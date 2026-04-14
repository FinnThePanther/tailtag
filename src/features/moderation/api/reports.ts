import { supabase } from '../../../lib/supabase';
import type { ReportInput } from '../types';

export async function submitReport(input: ReportInput): Promise<string> {
  const { data, error } = await (supabase as any).rpc('submit_user_report', {
    p_reported_user_id: input.reportedUserId ?? null,
    p_reported_fursuit_id: input.reportedFursuitId ?? null,
    p_report_type: input.reportType,
    p_description: input.description,
    p_convention_id: input.conventionId ?? null,
  });

  if (error) {
    if (error.message?.includes('Report limit reached')) {
      throw new Error('You have reached the report limit. Please try again later.');
    }
    throw new Error(`Could not submit report: ${error.message}`);
  }

  return data as string;
}
