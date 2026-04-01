export const siteConfig = {
  name: 'TailTag',
  tagline: 'A real-world convention game where you catch fursuiters using NFC tags.',
  description: 'Create a profile, register your fursuit, and scan NFC tags at conventions to collect catches, stats, and achievements.',

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
