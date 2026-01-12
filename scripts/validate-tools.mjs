#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { pathToFileURL } from 'url';

function validateModuleLoad(toolPath) {
  try {
    const out = execSync(
      `node -e "(async()=>{const {pathToFileURL}=require('url');try{const m=await import(pathToFileURL(process.argv[1]).href);const ok=typeof m.execute==='function' && m.definition && m.definition.function && m.definition.function.name;console.log(JSON.stringify({ ok, def: m.definition?.function || null }));}catch(e){console.log(JSON.stringify({ ok:false, err:e.message }));}})().catch(()=>{})" "${toolPath}"`,
      { encoding: 'utf8' }
    );
    return JSON.parse(out.trim());
  } catch (e) {
    return { ok: false, err: e.message };
  }
}

function validateSchema(def) {
  const issues = [];
  if (!def || typeof def !== 'object') {
    issues.push('missing definition.function');
    return issues;
  }
  const { name, description, parameters } = def;
  if (!name || typeof name !== 'string') issues.push('missing function.name');
  if (!description || typeof description !== 'string') issues.push('missing function.description');
  if (!parameters || parameters.type !== 'object') issues.push("parameters.type must be 'object'");
  if (!parameters || typeof parameters.properties !== 'object') issues.push('parameters.properties must be an object');
  if (!parameters || !Array.isArray(parameters.required)) issues.push('parameters.required must be an array');
  return issues;
}

function main() {
  const toolsDir = path.join(process.cwd(), 'tools');
  const files = fs.readdirSync(toolsDir).filter(f => f.endsWith('.mjs'));
  const results = {};
  let failures = 0;

  for (const f of files) {
    const full = path.join(toolsDir, f);
    const load = validateModuleLoad(full);
    const errors = [];
    if (!load.ok) {
      errors.push(load.err || 'failed to import module');
    }
    const schemaIssues = validateSchema(load.def);
    errors.push(...schemaIssues);
    if (errors.length) failures++;
    results[f] = { ok: errors.length === 0, errors };
  }

  const summary = { ok: failures === 0, failures, results };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(failures === 0 ? 0 : 1);
}

main();
