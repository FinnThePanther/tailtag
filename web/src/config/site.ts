export const siteConfig = {
  name: 'TailTag',
  tagline: 'A real-world convention game where you catch fursuiters at events.',
  description: 'Create a profile, register your fursuit, and collect catches, stats, and achievements at conventions.',

  links: {
    ios: 'https://testflight.apple.com/join/PLACEHOLDER',
    android: 'https://example.com/tailtag.apk',
    discord: 'https://discord.gg/PLACEHOLDER',
  },

  platforms: {
    ios: true,
    android: true,
  },

  meta: {
    url: 'https://tailtag.app',
    image: '/icon.png',
  },
} as const;
