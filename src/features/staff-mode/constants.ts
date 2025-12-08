import type { Database } from '../../types/database';

export const STAFF_MODE_ROLES: Database['public']['Enums']['user_role'][] = [
  'owner',
  'organizer',
  'staff',
];

export function canUseStaffMode(role?: Database['public']['Enums']['user_role'] | null) {
  if (!role) return false;
  return STAFF_MODE_ROLES.includes(role);
}
