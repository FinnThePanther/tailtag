export const MAX_INTERACTION_BADGES = 6;

export const SOCIAL_SIGNAL_KEYS = [
  'open_to_interaction',
  'ask_first',
  'not_social_right_now',
] as const;

export type SocialSignalKey = (typeof SOCIAL_SIGNAL_KEYS)[number];

export type SocialSignalDefinition = {
  key: SocialSignalKey;
  label: string;
  description: string;
  iconName: 'chatbubble-ellipses-outline' | 'hand-left-outline' | 'moon-outline';
  tone: 'open' | 'ask' | 'closed';
};

export const SOCIAL_SIGNAL_OPTIONS: SocialSignalDefinition[] = [
  {
    key: 'open_to_interaction',
    label: 'Open to interaction',
    description: 'Players can say hi and start a conversation.',
    iconName: 'chatbubble-ellipses-outline',
    tone: 'open',
  },
  {
    key: 'ask_first',
    label: 'Ask first',
    description: 'Good for friends-first, low-energy, or situational interaction.',
    iconName: 'hand-left-outline',
    tone: 'ask',
  },
  {
    key: 'not_social_right_now',
    label: 'Not social right now',
    description: 'Shows others you need space.',
    iconName: 'moon-outline',
    tone: 'closed',
  },
];

export const INTERACTION_BADGE_KEYS = [
  'ask_before_touching',
  'no_touching',
  'ask_before_hugs',
  'no_hugs',
  'photos_ok',
  'ask_before_photos',
  'silent_suiter',
  'hard_of_hearing',
  'low_visibility',
  'please_be_patient',
  'needs_space',
  'prone_to_overheating',
  'sensory_sensitive',
  'please_say_hi',
  'awkward_but_friendly',
  'socially_anxious',
] as const;

export type InteractionBadgeKey = (typeof INTERACTION_BADGE_KEYS)[number];

export type InteractionBadgeCategory = 'contact' | 'photos' | 'communication' | 'space' | 'social';

export type InteractionBadgeDefinition = {
  key: InteractionBadgeKey;
  label: string;
  description: string;
  category: InteractionBadgeCategory;
  priority: number;
};

export const INTERACTION_BADGE_DEFINITIONS: InteractionBadgeDefinition[] = [
  {
    key: 'no_touching',
    label: 'No touching',
    description: 'Do not touch this suit.',
    category: 'contact',
    priority: 10,
  },
  {
    key: 'ask_before_touching',
    label: 'Ask before touching',
    description: 'Ask before touching paws, tails, props, or costume parts.',
    category: 'contact',
    priority: 20,
  },
  {
    key: 'no_hugs',
    label: 'No hugs',
    description: 'Do not hug this suit.',
    category: 'contact',
    priority: 30,
  },
  {
    key: 'ask_before_hugs',
    label: 'Ask before hugs',
    description: 'Ask before offering a hug.',
    category: 'contact',
    priority: 40,
  },
  {
    key: 'ask_before_photos',
    label: 'Ask before photos',
    description: 'Ask before taking or posting photos.',
    category: 'photos',
    priority: 50,
  },
  {
    key: 'photos_ok',
    label: 'Photos OK',
    description: 'Photos are usually welcome when the situation is clear.',
    category: 'photos',
    priority: 60,
  },
  {
    key: 'needs_space',
    label: 'Needs space',
    description: 'Give this suit extra room.',
    category: 'space',
    priority: 70,
  },
  {
    key: 'prone_to_overheating',
    label: 'Prone to overheating',
    description: 'Be patient if they need breaks or airflow.',
    category: 'space',
    priority: 80,
  },
  {
    key: 'sensory_sensitive',
    label: 'Sensory sensitive',
    description: 'Avoid crowding, shouting, or sudden contact.',
    category: 'space',
    priority: 90,
  },
  {
    key: 'silent_suiter',
    label: 'Silent suiter',
    description: 'They may communicate nonverbally.',
    category: 'communication',
    priority: 100,
  },
  {
    key: 'hard_of_hearing',
    label: 'Hard of hearing',
    description: 'They may not hear you clearly.',
    category: 'communication',
    priority: 110,
  },
  {
    key: 'low_visibility',
    label: 'Low visibility',
    description: 'They may not see you approach.',
    category: 'communication',
    priority: 120,
  },
  {
    key: 'please_be_patient',
    label: 'Please be patient',
    description: 'Give them extra time to respond.',
    category: 'communication',
    priority: 130,
  },
  {
    key: 'please_say_hi',
    label: 'Please say hi',
    description: 'Friendly greetings are welcome.',
    category: 'social',
    priority: 140,
  },
  {
    key: 'awkward_but_friendly',
    label: 'Awkward but friendly',
    description: 'They may be shy, but they are friendly.',
    category: 'social',
    priority: 150,
  },
  {
    key: 'socially_anxious',
    label: 'Socially anxious',
    description: 'Gentle, low-pressure interaction helps.',
    category: 'social',
    priority: 160,
  },
];

export const INTERACTION_BADGE_GROUPS: {
  category: InteractionBadgeCategory;
  label: string;
  badgeKeys: InteractionBadgeKey[];
}[] = [
  {
    category: 'contact',
    label: 'Contact',
    badgeKeys: ['ask_before_touching', 'no_touching', 'ask_before_hugs', 'no_hugs'],
  },
  {
    category: 'photos',
    label: 'Photos',
    badgeKeys: ['photos_ok', 'ask_before_photos'],
  },
  {
    category: 'communication',
    label: 'Communication',
    badgeKeys: ['silent_suiter', 'hard_of_hearing', 'low_visibility', 'please_be_patient'],
  },
  {
    category: 'space',
    label: 'Space & sensory',
    badgeKeys: ['needs_space', 'prone_to_overheating', 'sensory_sensitive'],
  },
  {
    category: 'social',
    label: 'Social',
    badgeKeys: ['please_say_hi', 'awkward_but_friendly', 'socially_anxious'],
  },
];

const INTERACTION_BADGE_DEFINITION_BY_KEY = new Map(
  INTERACTION_BADGE_DEFINITIONS.map((definition) => [definition.key, definition]),
);

const SOCIAL_SIGNAL_DEFINITION_BY_KEY = new Map(
  SOCIAL_SIGNAL_OPTIONS.map((definition) => [definition.key, definition]),
);

const EXCLUSIVE_BADGE_BY_KEY: Partial<Record<InteractionBadgeKey, InteractionBadgeKey>> = {
  ask_before_touching: 'no_touching',
  no_touching: 'ask_before_touching',
  ask_before_hugs: 'no_hugs',
  no_hugs: 'ask_before_hugs',
  photos_ok: 'ask_before_photos',
  ask_before_photos: 'photos_ok',
};

export function getSocialSignalDefinition(
  key: SocialSignalKey | null | undefined,
): SocialSignalDefinition | null {
  return key ? (SOCIAL_SIGNAL_DEFINITION_BY_KEY.get(key) ?? null) : null;
}

export function getInteractionBadgeDefinition(
  key: InteractionBadgeKey,
): InteractionBadgeDefinition {
  return INTERACTION_BADGE_DEFINITION_BY_KEY.get(key)!;
}

export function normalizeSocialSignal(value: unknown): SocialSignalKey | null {
  return SOCIAL_SIGNAL_KEYS.includes(value as SocialSignalKey) ? (value as SocialSignalKey) : null;
}

export function normalizeInteractionBadges(value: unknown): InteractionBadgeKey[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueKeys = new Set<InteractionBadgeKey>();
  value.forEach((item) => {
    if (INTERACTION_BADGE_KEYS.includes(item as InteractionBadgeKey)) {
      uniqueKeys.add(item as InteractionBadgeKey);
    }
  });

  return sortInteractionBadges(Array.from(uniqueKeys)).slice(0, MAX_INTERACTION_BADGES);
}

export function sortInteractionBadges(keys: InteractionBadgeKey[]): InteractionBadgeKey[] {
  return [...keys].sort(
    (left, right) =>
      getInteractionBadgeDefinition(left).priority - getInteractionBadgeDefinition(right).priority,
  );
}

export function toggleInteractionBadge(
  currentKeys: InteractionBadgeKey[],
  key: InteractionBadgeKey,
): InteractionBadgeKey[] {
  const currentSet = new Set(currentKeys);

  if (currentSet.has(key)) {
    currentSet.delete(key);
    return sortInteractionBadges(Array.from(currentSet));
  }

  const exclusiveKey = EXCLUSIVE_BADGE_BY_KEY[key];
  if (exclusiveKey) {
    currentSet.delete(exclusiveKey);
  }

  if (currentSet.size >= MAX_INTERACTION_BADGES) {
    return sortInteractionBadges(Array.from(currentSet));
  }

  currentSet.add(key);
  return sortInteractionBadges(Array.from(currentSet));
}

export function canToggleInteractionBadge(
  currentKeys: InteractionBadgeKey[],
  key: InteractionBadgeKey,
): boolean {
  const currentSet = new Set(currentKeys);
  if (currentSet.has(key)) {
    return true;
  }

  const exclusiveKey = EXCLUSIVE_BADGE_BY_KEY[key];
  return (
    currentSet.size < MAX_INTERACTION_BADGES ||
    Boolean(exclusiveKey && currentSet.has(exclusiveKey))
  );
}

export function hasInteractionPreferences(
  socialSignal: SocialSignalKey | null | undefined,
  badgeKeys: InteractionBadgeKey[] | null | undefined,
): boolean {
  return Boolean(socialSignal) || Boolean(badgeKeys?.length);
}

export function getInteractionPreferencesError(badgeKeys: InteractionBadgeKey[]): string | null {
  if (badgeKeys.length > MAX_INTERACTION_BADGES) {
    return `Pick up to ${MAX_INTERACTION_BADGES} interaction badges.`;
  }

  return null;
}
