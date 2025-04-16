/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  collectCoverage: false,
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.js'], // Adjust this path if your run.js is elsewhere
  coverageReporters: ['text', 'lcov']
}
