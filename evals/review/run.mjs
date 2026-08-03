import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assert, jsonOutput, pass, runNode } from '../lib/assert.mjs';

const root = resolve(import.meta.dirname, '../..');
const temp = mkdtempSync(join(tmpdir(), 'planners-bypage-review-'));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
writeFileSync(join(temp, 'one.png'), png);
writeFileSync(join(temp, 'two.png'), png);
const manifestPath = join(temp, 'asset-manifest.json');
const assets = ['one', 'two'].map(name => ({ asset_id: 'asset-' + name, path: name + '.png', preview_path: null, processed_path: null, source_sha256: createHash('sha256').update(png).digest('hex'), processed_sha256: null, kind: 'image', semantic_class: 'content_evidence', source_id: 'src-doc', source_context: name, status: 'recommended', processing_level: 'none', processing_notes: '', visual_check: { status: 'passed', method: 'fixture-inspection', notes: '测试夹具图片内容已确认。' }, width: 1, height: 1, issues: [] }));
writeFileSync(manifestPath, JSON.stringify({ contract_version: 'asset-manifest/1.1.0', asset_root: '.', assets }, null, 2));
const architecture = JSON.parse(readFileSync(join(root, 'templates/page-architecture.json'), 'utf8'));
architecture.pages[0].recommended_assets = [{ asset_id: 'asset-one', role: '主图', reason: '最直接' }];
architecture.pages[0].other_candidate_assets = [{ asset_id: 'asset-two', role: '备用', reason: '补充语境' }];
const architecturePath = join(temp, 'architecture.json');
writeFileSync(architecturePath, JSON.stringify(architecture, null, 2));
const output = join(temp, 'storyline/index.html');
runNode(join(root, 'scripts/build-storyline-review.mjs'), ['--architecture', architecturePath, '--assets', manifestPath, '--output', output]);
const html = readFileSync(output, 'utf8');
assert(html.includes('推荐图片') && html.includes('查看其他候选图片（') && html.includes('group":"other"'), 'Storyline Review 必须先显示推荐图片并折叠其他候选');
assert(html.includes('data-asset-choice') && html.includes('asset-one'), '图片必须可以逐张决定');
assert(html.includes("contract_version: '1.1.0'"), '前端保存 Payload 必须使用 Review Contract 1.1.0');
assert(existsSync(join(temp, 'storyline/assets/asset-one.png')), 'Review 必须复制可访问的图片预览');
const live = jsonOutput(runNode(join(root, 'scripts/start-storyline-review.mjs'), [
  '--architecture', architecturePath, '--assets', manifestPath,
  '--review-dir', join(temp, 'live'), '--port', '0',
], { env: { ...process.env, REVIEW_TEST_NO_OPEN: '1' } }));
const response = await fetch(live.opened);
const liveHtml = await response.text();
const reviewData = JSON.parse(liveHtml.match(/const REVIEW = (\{.*\});/)?.[1] || '{}');
const saved = await fetch(new URL('/save-feedback', live.opened), {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    contract_version: '1.1.0', review_kind: 'storyline', source_sha256: reviewData.sourceSha256,
    saved_at: new Date().toISOString(), overall_decision: 'approve', overall_feedback_zh: '',
    decisions: [{ page_number: 1, decision: 'approve', feedback_zh: '', attachments: [], asset_decisions: [
      { asset_id: 'asset-one', status: 'selected' }, { asset_id: 'asset-two', status: 'backup' },
    ] }],
  }),
});
assert(saved.ok, '真实 Storyline Review Server 必须保存图片决定');
assert(jsonOutput(runNode(join(root, 'scripts/validate-storyline-review-feedback.mjs'), [
  '--feedback', live.feedback_path, '--architecture', architecturePath, '--assets', manifestPath,
])).valid, 'Storyline 反馈必须绑定当前架构和 Asset Manifest');

const bypageDir = join(temp, 'bypage');
writeFileSync(join(temp, 'page.png'), png);
const bypage = join(temp, 'bypage.md');
writeFileSync(bypage, `---
contract_version: 1.0.0
page_number: 1
section_id: sec-example
page_type: data
page_title: "数据页"
main_message: "图片必须在审阅页面出现"
---

## Page Content

![证据图](page.png)

## Speaker Notes

无。

## Production Notes

保持完整信息。

## Sources

- src-doc
`);
runNode(join(root, 'scripts/build-bypage-review.mjs'), ['--copy', bypage, '--output', join(bypageDir, 'index.html'), '--assets', manifestPath, '--kind', 'final']);
const bypageHtml = readFileSync(join(bypageDir, 'index.html'), 'utf8');
assert(bypageHtml.includes('完整 By-page 图文审阅') && bypageHtml.includes('assets/page.png') && existsSync(join(bypageDir, 'assets/page.png')), 'By-page Review 必须渲染并本地化图片');
const bypageLive = jsonOutput(runNode(join(root, 'scripts/start-bypage-review.mjs'), [
  '--copy', bypage, '--assets', manifestPath, '--review-dir', join(temp, 'bypage-live'), '--kind', 'final', '--port', '0',
], { env: { ...process.env, REVIEW_TEST_NO_OPEN: '1' } }));
const bypageResponse = await fetch(bypageLive.opened);
const bypageLiveHtml = await bypageResponse.text();
const bypageData = JSON.parse(bypageLiveHtml.match(/const REVIEW = (\{.*\});/)?.[1] || '{}');
const bypageSaved = await fetch(new URL('/save-feedback', bypageLive.opened), {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    contract_version: '1.1.0', review_kind: 'bypage', source_sha256: bypageData.sourceSha256,
    saved_at: new Date().toISOString(), overall_decision: 'approve', overall_feedback_zh: '',
    decisions: [{ page_number: 1, decision: 'approve', feedback_zh: '', attachments: [] }],
  }),
});
assert(bypageSaved.ok, '真实 By-page Review Server 必须保存反馈');
assert(jsonOutput(runNode(join(root, 'scripts/validate-review-feedback.mjs'), [
  '--feedback', bypageLive.feedback_path, '--copy', bypage, '--kind', 'final',
])).valid, 'By-page 反馈必须绑定当前文案');
pass('两套 Review 的图片展示与折叠候选');
