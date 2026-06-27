module.exports = {
  root: true,
  extends: ['expo'],
  ignorePatterns: ['.expo/**', 'dist/**', 'build/**', 'node_modules/**', 'admin/**', 'docs/**'],
  overrides: [
    {
      files: ['app/conventions/**/*.{js,jsx,ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '../src/**',
                  '../../src/**',
                  '../../../src/**',
                  '../../../../src/**',
                  '../../../../../src/**',
                ],
                message: 'Use the @/ alias for imports from src/** in app/** files.',
              },
            ],
          },
        ],
      },
    },
  ],
};
