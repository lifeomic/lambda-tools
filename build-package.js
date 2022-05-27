const { execSync } = require('child_process');

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

run('rm -rf dist/');

run('yarn tsc');

for (const file of ['package.json', 'LICENSE', 'CHANGELOG.md', 'README.md']) {
  run(`cp ${file} dist/`);
}

// Explicitly copy 'js' patch files because they are not
// compiled + moved by typescript
run('cp src/patches/*.js dist/src/patches');

console.log('✔️ Successfully built library to dist folder');
