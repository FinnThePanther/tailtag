import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../auth';
import { useCatchOutboxSync } from '../hooks';

export function CatchOutboxSyncManager() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? null;

  useCatchOutboxSync(userId, queryClient);

  return null;
}
