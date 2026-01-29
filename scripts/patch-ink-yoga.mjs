#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const nm = path.join(root, 'node_modules');
let patched = 0;
let scanned = 0;

function rewriteYogaImport(src) {
  // Normalize any yoga-wasm-web import to 'yoga-wasm-web/auto'
  let out = src.replace(/from ['\"]yoga-wasm-web\/asm['\"]/g, "from 'yoga-wasm-web/auto'");
  out = out.replace(/from ['\"]yoga-wasm-web\/auto['\"]/g, "from 'yoga-wasm-web/auto'");
  return out;
}

function patchFile(p, replacer) {
  try {
    const src = fs.readFileSync(p, 'utf8');
    const out = replacer(src);
    if (out && out !== src) {
      fs.writeFileSync(p, out);
      patched++;
      return true;
    }
  } catch {}
  return false;
}

function walk(dir) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const ent of ents) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(p);
    } else if (ent.isFile() && p.endsWith('.js') && p.includes(path.sep + 'ink' + path.sep) && p.includes(path.sep + 'build' + path.sep)) {
      scanned++;
      patchFile(p, rewriteYogaImport);
    }
  }
}

// 1) Patch Ink build files to import /auto (our alias will point to shim)
walk(nm);

// 2) Overwrite yoga-wasm-web/dist/node.js to avoid reading yoga.wasm and to use ASM factory instead
function findYogaNodeJsFiles() {
  const results = [];
  function walkAll(dir) {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of ents) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walkAll(p);
      else if (ent.isFile() && p.endsWith(path.join('yoga-wasm-web', 'dist', 'node.js'))) results.push(p);
    }
  }
  walkAll(path.join(nm));
  return results;
}

const yogaFiles = findYogaNodeJsFiles();
for (const file of yogaFiles) {
  try {
    const shim = "import asm from './asm.js';\nexport * from './asm.js';\nconst Yoga = asm();\nexport default Yoga;\n";
    fs.writeFileSync(file, shim);
    patched++;
  } catch {}
}

console.log(`patch-ink-yoga: scanned=${scanned} patched=${patched}`);
process.exit(0);
