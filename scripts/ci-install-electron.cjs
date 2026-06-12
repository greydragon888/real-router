#!/usr/bin/env node
// Reliable Electron binary installer for CI (#812).
//
// electron's own postinstall (`install.js`) fires the download as an
// *un-awaited* promise: `downloadArtifact(...).then(extractFile).catch(...)`.
// `path.txt` is written only inside `extractFile`, after the download and
// unzip resolve. On the GitHub ubuntu runner the process was observed to exit
// 0 *before* that chain settled — leaving `path.txt` absent — so
// `_electron.launch` then failed with `ENOENT … electron/path.txt`. The
// explicit `node install.js` step inherited the exact same flaw (it re-ran the
// same fire-and-forget script).
//
// This wrapper performs the same work but *awaits* every stage, then asserts
// the postcondition, so the step can never exit green without a usable binary.
// It also clears any partial `dist/` first, avoiding the EEXIST that a
// half-populated dist throws on re-extract.
//
// Run from a consumer example so module resolution finds its electron:
//   pnpm --filter electron-react-example exec node scripts/ci-install-electron.cjs

const fs = require('fs');
const path = require('path');

// Resolve from the consumer's perspective (cwd = the example dir under
// `pnpm --filter <example> exec`), not from this script's location.
const fromCwd = { paths: [process.cwd()] };
const electronDir = path.dirname(require.resolve('electron/package.json', fromCwd));
const fromElectron = { paths: [electronDir] };
const { downloadArtifact } = require(require.resolve('@electron/get', fromElectron));
const extract = require(require.resolve('extract-zip', fromElectron));

const { version } = require(path.join(electronDir, 'package.json'));
const distPath = path.join(electronDir, 'dist');
const pathTxt = path.join(electronDir, 'path.txt');

// Mirrors electron/install.js getPlatformPath().
function platformPathFor(platform) {
  switch (platform) {
    case 'mas':
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron';
    case 'freebsd':
    case 'openbsd':
    case 'linux':
      return 'electron';
    case 'win32':
      return 'electron.exe';
    default:
      throw new Error(`Electron builds are not available on platform: ${platform}`);
  }
}

(async () => {
  const platform = process.platform;
  const arch = process.arch;
  const platformPath = platformPathFor(platform);

  // Clear any partial state so extract can't fail with EEXIST.
  fs.rmSync(distPath, { recursive: true, force: true });
  fs.rmSync(pathTxt, { force: true });

  console.log(`Installing electron ${version} (${platform}/${arch}) …`);
  const zip = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform,
    arch,
    checksums: require(path.join(electronDir, 'checksums.json')),
  });
  await extract(zip, { dir: distPath });
  fs.writeFileSync(pathTxt, platformPath);

  const binary = path.join(distPath, platformPath);
  if (!fs.existsSync(pathTxt) || !fs.existsSync(binary)) {
    throw new Error('Electron install incomplete: path.txt or binary missing after extract');
  }
  console.log(`Electron ${version} installed: ${binary}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
