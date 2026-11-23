export default [
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      // Node build and evidence scripts run outside the Lightning runtime.
      '@lwc/lwc-platform/no-aura-libs': 'off',
      '@lwc/lwc-platform/no-process-env': 'off',
      '@lwc/lwc-platform/no-dynamic-import-identifier': 'off',
      'no-undef': 'error',
    },
  },
];
