import type { AdminProfile } from '@/lib/auth';

export function canManageConventionConfig(profile: Pick<AdminProfile, 'role'>) {
  return profile.role === 'owner' || profile.role === 'organizer';
}

export function canReviewEventSuggestions(profile: Pick<AdminProfile, 'role'>) {
  return profile.role === 'owner' || profile.role === 'organizer' || profile.role === 'moderator';
}
