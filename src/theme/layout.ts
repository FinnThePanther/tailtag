export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
} as const;

export const typography = {
  heading: {
    fontFamily: 'System',
    fontWeight: '600' as const,
  },
  subheading: {
    fontFamily: 'System',
    fontWeight: '500' as const,
  },
  body: {
    fontFamily: 'System',
    fontWeight: '400' as const,
  },
};
