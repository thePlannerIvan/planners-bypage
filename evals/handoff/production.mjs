import {createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import assert from 'node:assert/strict';
import {writeProductionExport} from '../../scripts/lib/production-export.mjs';
import {splitPages} from '../../scripts/lib/bypage-copy.mjs';
import {reviewSourceHash} from '../../scripts/lib/review-source-hash.mjs';

const root = mkdtempSync(join(tmpdir(), 'bypage-production-'));
const hash = data => createHash('sha256').update(data).digest('hex');
assert.equal(reviewSourceHash({copy: 'copy', audit: 'audit', manifest: 'assets'}),
  hash('copy\n---FACT-AUDIT---\naudit\n---ASSET-MANIFEST---\nassets'));
assert.notEqual(reviewSourceHash({copy: 'copy', audit: 'audit', manifest: ''}),
  reviewSourceHash({copy: 'copy', audit: 'audit'}));
mkdirSync(join(root, 'assets'));
const write = (name, value) => {const path = join(root, name); writeFileSync(path, value); return path;};
const memory = write('project-memory.md', 'project memory');
const source = write('source-index.json', '{"sources":[]}');
const asset = write('assets/image.png', 'pinned asset');
const assetHash = hash(readFileSync(asset));
const manifest = write('assets/asset-manifest.json', JSON.stringify({asset_root: '.', assets: [
  {asset_id: 'original-image', path: 'image.png', source_id: 'src-1', source_sha256: assetHash}]}));
const audit = write('fact-audit.json', JSON.stringify({source_index: {path: source}}));
const feedback = write('feedback.json', '{}');
const delivered = ['## P01｜Title\n\n> Claim\n\nVisible text\n![Photo](assets/image.png)\n\n## Speaker Notes\n\nNotes\n\n## Production Notes\n\nUse `assets/image.png`\n\n## Sources\n\nsrc-1'];
const draft = id => `---\ncontract_version: 1.0.0\npage_number: 1\n${id ? `page_id: ${id}\n` : ''}section_id: sec\npage_type: explanation\npage_title: Title\nmain_message: Claim\n---\n\n## Page Content\n\nVisible text\n\n## Speaker Notes\n\nNotes\n\n## Production Notes\n\nUse photo\n\n## Sources\n\nsrc-1\n`;
const copy = write('draft.md', draft('stable-page'));
const output = join(root, 'production.json');
function build(text, overrides = {}) {
  writeFileSync(copy, text);
  const outputPages = overrides.outputPages || delivered;
  const deliverable = write('by-page.md', overrides.deliverableText ?? outputPages.join('\n\n---\n\n'));
  writeProductionExport({output, memory, copyPath: copy, auditPath: audit, feedbackPath: feedback,
    manifestPath: manifest, outputPath: deliverable,
    deliveredManifestPath: manifest, pages: splitPages(text), outputPages, ...overrides});
  return JSON.parse(readFileSync(output));
}
let data = build(draft('stable-page'));
assert.deepEqual(data.order, ['stable-page']);
assert.equal(data.pages[0].assets[0].asset_id, 'original-image');
assert.equal(data.pages[0].notes, 'Notes');
assert.equal(data.upstream.memory.path, realpathSync(memory));
assert.equal(data.upstream.source_index.path, realpathSync(source));
assert.equal(data.provenance.audit_scope, 'original-bypage-copy');
const stable = data.order;
assert.deepEqual(build(draft('stable-page').replace('Visible text', 'Changed copy')).order, stable);
data = build(draft());
const numbered = data.order[0];
assert.notEqual(build(draft().replace('Visible text', 'New numbered baseline')).order[0], numbered);
assert.throws(() => build(draft('stable-page') + '\n' + draft('stable-page'),
  {outputPages: [...delivered, ...delivered]}), /Duplicate/);
assert.throws(() => build(draft('stable-page').replace('Visible text', 'Unparsed edit'),
  {pages: splitPages(draft('stable-page'))}), /hash-bound Bypage copy/);
assert.throws(() => build(draft('stable-page'),
  {deliverableText: delivered[0].replace('Visible text', 'Unparsed delivery edit')}), /hash-bound deliverable/);
mkdirSync(join(root, 'aliases'));
writeFileSync(audit, JSON.stringify({source_index: {path: 'source-index.json'}}));
const auditAlias = join(root, 'aliases/audit.json');
symlinkSync(audit, auditAlias);
write('aliases/source-index.json', 'wrong relative source');
const manifestAlias = join(root, 'aliases/asset-manifest.json');
symlinkSync(manifest, manifestAlias);
const deliverableAlias = join(root, 'aliases/by-page.md');
symlinkSync(join(root, 'by-page.md'), deliverableAlias);
data = build(draft('stable-page'), {auditPath: auditAlias, deliveredManifestPath: manifestAlias,
  outputPath: deliverableAlias});
assert.equal(data.upstream.audit.path, realpathSync(audit));
assert.equal(data.upstream.source_index.path, realpathSync(source));
assert.equal(data.upstream.deliverable.path, realpathSync(join(root, 'by-page.md')));
assert.equal(data.pages[0].assets[0].path, realpathSync(asset));
assert.equal(data.pages[0].assets[0].sha256, assetHash);
const copyAlias = join(root, 'aliases/copy.md');
symlinkSync(copy, copyAlias);
assert.throws(() => build(draft('stable-page'), {output: copyAlias}), /replace an upstream input/);
assert.equal(readFileSync(copy, 'utf8'), draft('stable-page'));
const environmentAlias = join(root, '.env-alias');
symlinkSync(memory, environmentAlias);
assert.throws(() => build(draft('stable-page'), {memory: environmentAlias}), /Environment files/);
const environmentTarget = write('.env-fixture', 'synthetic secret; do not read');
const environmentTargetAlias = join(root, 'aliases/environment.md');
symlinkSync(environmentTarget, environmentTargetAlias);
assert.throws(() => build(draft('stable-page'), {memory: environmentTargetAlias}), /Environment files/);
writeFileSync(manifest, JSON.stringify({asset_root: '.', assets: [
  {asset_id: 'original-image', path: 'image.png', source_sha256: 'not-a-sha256'}]}));
assert.throws(() => build(draft('stable-page')), /Invalid approved asset SHA-256/);
writeFileSync(manifest, JSON.stringify({asset_root: '.', assets: [
  {asset_id: 'original-image', path: 'image.png', source_id: 'src-1', source_sha256: assetHash}]}));
writeFileSync(asset, 'different asset bytes');
assert.throws(() => build(draft('stable-page')), /approved manifest/);
console.log('PASS: structured export identities, hash-bound parsing, canonical aliases, assets, mutation guard');
