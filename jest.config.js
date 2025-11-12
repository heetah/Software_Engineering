export default {
  testEnvironment: 'node',
  // Keep transforms empty (native ESM) but allow future customization
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(axios)/)'
  ]
};