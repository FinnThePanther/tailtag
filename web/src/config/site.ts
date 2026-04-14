export const siteConfig = {
  name: 'TailTag',
  tagline: 'A real-world convention game where you catch fursuiters at events.',
  description:
    'Create a profile, register your fursuit, and collect catches, stats, and achievements at conventions.',

  links: {
    ios: 'https://finnthepanther.com',
    android: 'https://finnthepanther.com',
    discord: 'https://discord.gg/Fv7NPJNTP2',
    supportEmail: 'finn@finnthepanther.com',
    deleteAccountMailto: 'mailto:finn@finnthepanther.com?subject=TailTag%20Account%20Deletion',
  },

  platforms: {
    ios: true,
    android: true,
  },

  meta: {
    url: 'https://playtailtag.com',
    image: '/icon.png',
  },
} as const;
