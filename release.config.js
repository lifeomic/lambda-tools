module.exports = {
  branches: ['master'],
  plugins: [
    ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }],
    ['@semantic-release/npm', { pkgRoot: 'dist/' }],
    [
      '@semantic-release/github',
      {
        // Setting this to false disables the default behavior
        // of opening a GitHub issue when a release fails.
        // We have other methods of tracking these failures.
        failComment: false
      }
    ]
  ]
};
