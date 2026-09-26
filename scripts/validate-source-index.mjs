#!/usr/bin/env node
/**
 * 薄壳：把来源索引的校验交给公共模组（`planners-source-index`）—— **规则只有一份**。
 *
 * 这个文件本身不含任何校验规则；它存在只是为了让 Stage 文档与 evals 的调用路径保持稳定。
 * 用法：node scripts/validate-source-index.mjs <source-index.json> [--text] [--strict-files] [--stamp]
 */
import { spawnSync } from 'node:child_process';
import { moduleScript } from './lib/planners-modules.mjs';

let target;
try {
  target = moduleScript('planners-source-index', 'scripts/validate-source-index.mjs');
} catch (e) {
  console.error(String(e.message));
  process.exit(2);
}
const r = spawnSync(process.execPath, [target, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 2);
