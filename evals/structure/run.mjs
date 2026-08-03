import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assert, jsonOutput, pass, runNode } from '../lib/assert.mjs';

const root = resolve(import.meta.dirname, '../..');
const skill = readFileSync(join(root, 'SKILL.md'), 'utf8');
assert(skill.includes('name: planners-bypage'), 'frontmatter 必须使用 planners-bypage');
assert(skill.includes('$planners-ppt-hell'), '必须明确交给下游 PPT Skill');
assert(!skill.includes('proposal-library-maintenance/'), 'Active 入口不得保留 Method Wiki 路由');
assert(readFileSync(join(root, 'WORKFLOW.md'), 'utf8').includes('一轮集中选择'), '必须是一轮集中决策');
assert(jsonOutput(runNode(join(root, 'scripts/validate-page-architecture.mjs'), [join(root, 'templates/page-architecture.json')])).valid, '页面架构模板必须通过');
assert(jsonOutput(runNode(join(root, 'scripts/validate-bypage.mjs'), [join(root, 'templates/by-page.md')])).valid, 'By-page 模板必须通过');

const temp = mkdtempSync(join(tmpdir(), 'planners-bypage-structure-'));
mkdirSync(join(temp, 'source'));
const research = Buffer.from('# Research\n');
writeFileSync(join(temp, 'source/research.md'), research);
const sourceIndex = join(temp, 'source-index.json');
writeFileSync(sourceIndex, JSON.stringify({
  contract_version: 'source-index/1.1.0', source_root: '.',
  sources: [{ source_id: 'src-research', file_path: 'source/research.md', sha256: createHash('sha256').update(research).digest('hex'), kind: 'markdown', read_mode: 'full', coverage: '全文', purpose: '主要内容', audit_companion: null }],
}, null, 2));
assert(jsonOutput(runNode(join(root, 'scripts/validate-source-index.mjs'), [sourceIndex])).valid, 'Source Index 必须验证真实文件');
const image = Buffer.from('asset-bytes');
writeFileSync(join(temp, 'asset.png'), image);
const manifest = join(temp, 'asset-manifest.json');
writeFileSync(manifest, JSON.stringify({
  contract_version: 'asset-manifest/1.1.0', asset_root: '.',
  assets: [{ asset_id: 'asset-chart', path: 'asset.png', preview_path: null, processed_path: null, source_sha256: createHash('sha256').update(image).digest('hex'), processed_sha256: null, kind: 'image', semantic_class: 'content_evidence', source_id: 'src-research', source_context: '研究图表', status: 'selected', processing_level: 'none', processing_notes: '', visual_check: { status: 'passed', method: 'fixture-inspection', notes: '测试夹具图片内容已确认。' }, width: null, height: null, issues: [] }],
}, null, 2));
assert(jsonOutput(runNode(join(root, 'scripts/validate-asset-manifest.mjs'), [manifest])).valid, 'Asset Manifest 必须复算文件 Hash');
const pendingManifest = join(temp, 'pending-asset-manifest.json');
const pendingDoc = JSON.parse(readFileSync(manifest, 'utf8'));
pendingDoc.assets[0].visual_check = { status: 'pending', method: '', notes: '' };
writeFileSync(pendingManifest, JSON.stringify(pendingDoc, null, 2));
const pendingResult = spawnSync(process.execPath, [join(root, 'scripts/validate-asset-manifest.mjs'), pendingManifest, '--final'], { encoding: 'utf8' });
assert(pendingResult.status !== 0 && JSON.parse(pendingResult.stdout).errors.some(error => error.code === 'visual_check_required'), '终审必须阻止尚未视觉确认的采用图片');
writeFileSync(join(temp, 'processed.png'), Buffer.from('processed-bytes'));
const badProcessedManifest = join(temp, 'bad-processed-asset-manifest.json');
const badProcessedDoc = JSON.parse(readFileSync(manifest, 'utf8'));
badProcessedDoc.assets[0].processed_path = 'processed.png';
badProcessedDoc.assets[0].processed_sha256 = '0'.repeat(64);
badProcessedDoc.assets[0].processing_level = 'conservative';
writeFileSync(badProcessedManifest, JSON.stringify(badProcessedDoc, null, 2));
const badProcessedResult = spawnSync(process.execPath, [join(root, 'scripts/validate-asset-manifest.mjs'), badProcessedManifest], { encoding: 'utf8' });
assert(badProcessedResult.status !== 0 && JSON.parse(badProcessedResult.stdout).errors.some(error => error.code === 'processed_hash_mismatch'), '处理图 Hash 必须独立复算');
const architecturePath = join(temp, 'page-architecture.json');
const architecture = JSON.parse(readFileSync(join(root, 'templates/page-architecture.json'), 'utf8'));
architecture.pages[0].recommended_assets = [{ asset_id: 'asset-chart', role: '证据图', reason: '直接支持页面信息' }];
writeFileSync(architecturePath, JSON.stringify(architecture, null, 2));
assert(jsonOutput(runNode(join(root, 'scripts/validate-page-architecture.mjs'), [architecturePath, '--assets', manifest])).valid, '页面架构必须检查 Asset ID');
const materials = join(temp, 'page-material-packs.json');
writeFileSync(materials, JSON.stringify({
  contract_version: 'page-material-packs/1.0.0',
  architecture_sha256: createHash('sha256').update(readFileSync(architecturePath)).digest('hex'),
  packs: [{ page_number: 1, page_job: '说明研究结论', materials: [{ source_id: 'src-research', locator: '全文', excerpt: 'Research', relationship: 'supports', used_in: '正文' }], asset_ids: ['asset-chart'], content_development: ['图文结合'], gaps: [] }],
}, null, 2));
assert(jsonOutput(runNode(join(root, 'scripts/validate-page-materials.mjs'), ['--materials', materials, '--architecture', architecturePath, '--sources', sourceIndex, '--assets', manifest])).valid, '材料包必须绑定当前架构并验证来源与图片');
pass('结构、核心 Contract 与边界');
