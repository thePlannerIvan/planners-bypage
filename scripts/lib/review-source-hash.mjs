import {createHash} from 'node:crypto';
import {readFileSync, realpathSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export function reviewSourceHash({copy, audit = '', manifest = null}) {
  if (typeof copy !== 'string' || typeof audit !== 'string'
      || (manifest !== null && typeof manifest !== 'string')) {
    throw new Error('Review binding inputs must be UTF-8 text');
  }
  const hash = createHash('sha256').update(copy).update('\n---FACT-AUDIT---\n').update(audit);
  if (manifest !== null) hash.update('\n---ASSET-MANIFEST---\n').update(manifest);
  return hash.digest('hex');
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  process.stdout.write(`${reviewSourceHash(JSON.parse(readFileSync(0, 'utf8')))}\n`);
}
