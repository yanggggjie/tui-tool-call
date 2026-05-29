#!/usr/bin/env node
/**
 * Post-install script to set up node-pty native bindings.
 * Uses node-pty's own bundled prebuilds when available, falls back to source build.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const platform = process.platform;
const platformKey = `${platform}-${process.arch}`;
const nodePtyDir = path.join(__dirname, '..', 'node_modules', 'node-pty');

function testNodePty() {
  // Run in a subprocess so the native addon loads fresh after any file changes.
  // Use a temp file to avoid shell quoting issues with paths.
  const tmpScript = path.join(os.tmpdir(), 'ttc-test-pty.js');
  try {
    fs.writeFileSync(tmpScript, `
      const pty = require(${JSON.stringify(nodePtyDir)});
      const p = pty.spawn('/bin/sh', ['-c', 'exit'], { name: 'xterm' });
      p.kill();
    `);
    execSync(`node ${tmpScript}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  } finally {
    try { fs.unlinkSync(tmpScript); } catch {}
  }
}

function installPrebuild() {
  const prebuildPath = path.join(nodePtyDir, 'prebuilds', platformKey, 'pty.node');
  if (!fs.existsSync(prebuildPath)) {
    console.log(`[ttc] No prebuild for ${platformKey}`);
    return false;
  }

  const prebuildDir = path.dirname(prebuildPath);
  const targetDir = path.join(nodePtyDir, 'build', 'Release');

  try {
    fs.mkdirSync(targetDir, { recursive: true });
    // Copy pty.node and spawn-helper (both required for PTY spawning)
    for (const file of ['pty.node', 'spawn-helper']) {
      const src = path.join(prebuildDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(targetDir, file));
        fs.chmodSync(path.join(targetDir, file), 0o755);
      }
    }
    console.log(`[ttc] Installed prebuilt binary for ${platformKey}`);
    return true;
  } catch (err) {
    console.error(`[ttc] Failed to install prebuild: ${err.message}`);
    return false;
  }
}

function buildFromSource() {
  console.log('[ttc] Building node-pty from source (this may take a minute)...');
  try {
    execSync('npx node-gyp rebuild', { stdio: 'inherit', cwd: nodePtyDir });
    return true;
  } catch {
    return false;
  }
}

function exitWithBuildError() {
  const fixes = {
    darwin: '  xcode-select --install\n  npm install -g tui-tool-call',
    linux:  '  sudo apt-get install build-essential python3 g++\n  npm install -g tui-tool-call',
  };
  const fix = fixes[platform] ?? '  npm install -g tui-tool-call';
  console.error(`[ttc] node-pty native binding failed to load.\n\n[ttc] To fix:\n${fix}`);
  process.exit(1);
}

function main() {
  console.log(`[ttc] Platform: ${platformKey}`);

  if (testNodePty()) {
    console.log('[ttc] node-pty is ready');
    return;
  }

  if (installPrebuild() && testNodePty()) {
    console.log('[ttc] Prebuilt binary works');
    return;
  }

  if (buildFromSource() && testNodePty()) {
    console.log('[ttc] node-pty built successfully');
    return;
  }

  exitWithBuildError();
}

main();
