export type ConventionTimezoneOption = {
  value: string;
  label: string;
};

export type ConventionTimezoneGroup = {
  label: string;
  options: ConventionTimezoneOption[];
};

export const CONVENTION_TIMEZONE_GROUPS: ConventionTimezoneGroup[] = [
  {
    label: 'North America',
    options: [
      { value: 'America/New_York', label: 'Eastern - New York / Toronto' },
      { value: 'America/Chicago', label: 'Central - Chicago' },
      { value: 'America/Winnipeg', label: 'Central - Winnipeg' },
      { value: 'America/Denver', label: 'Mountain - Denver' },
      { value: 'America/Edmonton', label: 'Mountain - Edmonton / Lloydminster' },
      { value: 'America/Los_Angeles', label: 'Pacific - Los Angeles / Vancouver' },
      { value: 'America/Anchorage', label: 'Alaska - Anchorage' },
      { value: 'Pacific/Honolulu', label: 'Hawaii - Honolulu' },
    ],
  },
  {
    label: 'North America, no daylight saving time',
    options: [
      { value: 'America/Phoenix', label: 'Mountain Standard - Phoenix' },
      { value: 'America/Regina', label: 'Central Standard - Saskatchewan / Regina' },
      { value: 'America/Swift_Current', label: 'Central Standard - Swift Current' },
      { value: 'America/Whitehorse', label: 'Yukon Standard - Whitehorse' },
      { value: 'America/Dawson', label: 'Yukon Standard - Dawson' },
      { value: 'America/Creston', label: 'Mountain Standard - Creston, BC' },
      { value: 'America/Dawson_Creek', label: 'Mountain Standard - Dawson Creek, BC' },
      { value: 'America/Fort_Nelson', label: 'Mountain Standard - Fort Nelson, BC' },
      { value: 'America/Atikokan', label: 'Eastern Standard - Atikokan / Southampton Island' },
      { value: 'America/Blanc-Sablon', label: 'Atlantic Standard - Blanc-Sablon' },
    ],
  },
  {
    label: 'Canada, daylight saving time',
    options: [
      { value: 'America/St_Johns', label: 'Newfoundland - St. Johns' },
      { value: 'America/Halifax', label: 'Atlantic - Halifax' },
      { value: 'America/Moncton', label: 'Atlantic - Moncton' },
      { value: 'America/Toronto', label: 'Eastern - Toronto' },
      { value: 'America/Vancouver', label: 'Pacific - Vancouver' },
    ],
  },
  {
    label: 'International',
    options: [
      { value: 'UTC', label: 'UTC' },
      { value: 'Europe/London', label: 'London' },
      { value: 'Europe/Berlin', label: 'Berlin' },
      { value: 'Europe/Paris', label: 'Paris' },
      { value: 'Asia/Tokyo', label: 'Tokyo' },
      { value: 'Australia/Sydney', label: 'Sydney' },
    ],
  },
];

export const CONVENTION_TIMEZONE_VALUES = new Set(
  CONVENTION_TIMEZONE_GROUPS.flatMap((group) => group.options.map((option) => option.value)),
);

export function getConventionTimezoneGroups(currentTimezone?: string | null) {
  const timezone = currentTimezone?.trim();
  if (!timezone || CONVENTION_TIMEZONE_VALUES.has(timezone)) {
    return CONVENTION_TIMEZONE_GROUPS;
  }

  return [
    {
      label: 'Stored timezone',
      options: [{ value: timezone, label: `${timezone} (stored value)` }],
    },
    ...CONVENTION_TIMEZONE_GROUPS,
  ];
}

export function normalizeConventionTimezone(value: string | null | undefined) {
  const timezone = value?.trim() || 'UTC';

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error('Convention timezone must be a valid IANA timezone, such as America/Regina.');
  }

  return timezone;
}
