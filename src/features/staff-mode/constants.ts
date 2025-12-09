type UserRole = 'player' | 'staff' | 'moderator' | 'organizer' | 'owner';

export const STAFF_MODE_ROLES: UserRole[] = ['owner', 'organizer', 'staff'];

export function canUseStaffMode(role?: UserRole | null) {
  if (!role) return false;
  return STAFF_MODE_ROLES.includes(role);
}
