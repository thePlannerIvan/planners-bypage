import { createHash } from 'node:crypto';
import {spawnSync} from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { assert, jsonOutput, pass, runNode } from '../lib/assert.mjs';
import {reviewSourceHash} from '../../scripts/lib/review-source-hash.mjs';

const root = resolve(import.meta.dirname, '../..');
const temp = mkdtempSync(join(tmpdir(), 'planners-bypage-handoff-'));
mkdirSync(join(temp, 'source')); mkdirSync(join(temp, 'work/assets/original'), { recursive: true });
const sourceBytes = Buffer.from('# 文档\n\n完整内容。\n');
writeFileSync(join(temp, 'source/doc.md'), sourceBytes);
const png = Buffer.from('handoff-image');
writeFileSync(join(temp, 'work/assets/original/image.png'), png);
writeFileSync(join(temp, 'work/assets/processed-image.png'), png);
const sourceIndex = join(temp, 'work/source-index.json');
writeFileSync(sourceIndex, JSON.stringify({
  contract_version: 'source-index/2.0.0', source_root: '../source',
  sources: [{
    source_id: 'src-doc',
    origin: { path: 'doc.md', sha256: createHash('sha256').update(sourceBytes).digest('hex'), bytes: sourceBytes.length },
    kind: 'document', role: '主要内容',
    audit_layer: { mode: 'source_file', path: null, sha256: null, derived_from_sha256: null, snapshot_sha256: null, method: null, anchor_marks: null },
    coverage: { status: 'full', scope: null, reason: null, impact_if_incomplete: null, counts: null },
    anchors: [{ kind: 'section', value: '全文' }], conflicts: [], notes: '',
  }],
}, null, 2));
const materials = join(temp, 'work/materials.json');
writeFileSync(materials, JSON.stringify({ contract_version: 'page-material-packs/1.0.0', architecture_sha256: '0'.repeat(64), packs: [{ page_number: 1, page_job: '说明内容', materials: [{ source_id: 'src-doc', locator: '全文', excerpt: '完整内容', relationship: 'supports', used_in: '正文' }], asset_ids: ['asset-image'], content_development: ['图文'], gaps: [] }] }, null, 2));
const manifest = join(temp, 'work/asset-manifest.json');
writeFileSync(manifest, JSON.stringify({ contract_version: 'asset-manifest/1.1.0', asset_root: 'assets', assets: [{ asset_id: 'asset-image', path: 'original/image.png', preview_path: null, processed_path: 'processed-image.png', source_sha256: createHash('sha256').update(png).digest('hex'), processed_sha256: createHash('sha256').update(png).digest('hex'), kind: 'image', semantic_class: 'content_evidence', source_id: 'src-doc', source_context: '文档配图', status: 'selected', processing_level: 'conservative', processing_notes: '测试处理图。', visual_check: { status: 'passed', method: 'fixture-inspection', notes: '测试夹具图片内容已确认。' }, width: null, height: null, issues: [] }] }, null, 2));
const copy = join(temp, 'work/bypage.md');
writeFileSync(copy, `---
contract_version: 1.0.0
page_number: 1
section_id: sec-main
page_type: explanation
page_title: "内容概览"
main_message: "完整内容可以直接进入下一步"
---

## Page Content

完整内容。

![文档配图](assets/original/image.png)

## Speaker Notes

无。

## Production Notes

使用 \`assets/processed-image.png\`，保留图片原意。

## Sources

- src-doc
`);
const audit = join(temp, 'work/fact-audit.json');
// 新流程：fact-audit.json 由 planners-fact-check 产出（这一份是"全部核过、无疑点"）
writeFileSync(audit, JSON.stringify({
  contract_version: 'fact-audit/1.0.0',
  artifact: { path: copy, sha256: createHash('sha256').update(readFileSync(copy)).digest('hex') },
  source_index: { path: sourceIndex, index_sha256: null, read_at: null },
  checker: 'evals/handoff/run.mjs',
  checked_at: new Date().toISOString(),
  blind_spots: [],
  suspects: [],
}, null, 2));
assert(jsonOutput(runNode(join(root, 'scripts/validate-fact-audit.mjs'), ['--audit', audit, '--copy', copy])).valid, '无数字页面也必须形成有效审计');
const auditRaw = readFileSync(audit, 'utf8');
const feedback = join(temp, 'work/review-feedback.json');
writeFileSync(feedback, JSON.stringify({
  contract_version: '1.1.0', review_kind: 'bypage',
  source_sha256: reviewSourceHash({copy: readFileSync(copy, 'utf8'), audit: auditRaw, manifest: readFileSync(manifest, 'utf8')}),
  saved_at: new Date().toISOString(), overall_decision: 'approve', overall_feedback_zh: '',
  decisions: [{ page_number: 1, decision: 'approve', feedback_zh: '', attachments: [] }],
}, null, 2));
const deliverable = join(temp, 'deliverable/by-page.md');
const assetsDir = join(temp, 'deliverable/assets');
const memory = join(temp, 'work/project-memory.md');
writeFileSync(memory, 'Handoff project memory');
const production = join(temp, 'deliverable/production.json');
const built = jsonOutput(runNode(join(root, 'scripts/build-reviewed-copy.mjs'), ['--copy', copy, '--audit', audit, '--feedback', feedback, '--manifest', manifest, '--output', deliverable, '--assets-dir', assetsDir, '--production-json', production, '--memory', memory, '--materials', materials]));
assert(existsSync(deliverable), '必须生成 by-page.md');
assert(existsSync(join(assetsDir, 'asset-manifest.json')) && existsSync(join(assetsDir, 'original/asset-image-image.png')), '必须交付图片和精简 Asset Manifest');
assert(readFileSync(deliverable, 'utf8').includes('Speaker Notes') && readFileSync(deliverable, 'utf8').includes('Production Notes'), '下游需要的 Notes 不得丢失');
assert(!readFileSync(deliverable, 'utf8').includes('assets/processed-image.png') && readFileSync(deliverable, 'utf8').includes('assets/processed/asset-image-processed-image.png'), 'Production Notes 中的资产路径必须重写为真实交付路径');
assert(built.pages_with_assets === 1, 'pages_with_assets 必须统计 By-page 原有图片，而不只统计用户上传附件');
const structured = JSON.parse(readFileSync(production, 'utf8'));
assert(structured.pages[0].assets.length === 2, '结构化交付必须包含正文图和 Production Notes 引用的处理图');
assert(structured.upstream.materials.sha256 && structured.upstream.memory.sha256, '共享记忆与材料保留路径/字节绑定');
assert(structured.pages[0].identity.kind === 'numbered-baseline', '页号身份绑定当前稿，不猜测下一份稿的页号映射');
const imported = spawnSync('python3', [resolve(root, '../../03-design-delivery/planners-ppt-hell/scripts/import_bypage.py'),
  join(temp, 'ppt'), '--production', production], {encoding: 'utf8'});
assert(imported.status === 0, '真实资产绑定反馈必须能由 PPT 适配器导入：' + imported.stderr);
const pptContent = JSON.parse(readFileSync(join(temp, 'ppt/_internal/01_content/page_content.json'), 'utf8'));
assert(pptContent.pages[0].page_key === structured.order[0] && pptContent.pages[0].source_assets.includes('asset-image'),
  'Bypage 程序交付到 PPT 导入须保留页面与资产身份');
assert(readFileSync(join(root, 'SKILL.md'), 'utf8').includes('$planners-ppt-hell'), '完成后必须提示下游 Skill');
pass('干净交付与 planners-ppt-hell 衔接');
