import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function writeAuditFixture(dir, copy) {
  const source = join(dir, 'fixture-source-index.json');
  const audit = `${copy}.fact-audit.json`;
  writeFileSync(source, JSON.stringify({ contract_version: 'source-index/2.0.0', source_root: '.', sources: [] }));
  writeFileSync(audit, JSON.stringify({ contract_version: 'fact-audit/1.0.0',
    artifact: { path: copy, sha256: createHash('sha256').update(readFileSync(copy)).digest('hex') },
    source_index: { path: source, index_sha256: null, read_at: null },
    checker: 'test-fixture-not-real-audit', blind_spots: [], suspects: [] }));
  return audit;
}
