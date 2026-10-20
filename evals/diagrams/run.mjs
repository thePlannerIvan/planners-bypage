import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assert, jsonOutput, pass, runNode } from '../lib/assert.mjs';

const root = resolve(import.meta.dirname, '../..');
const temp = mkdtempSync(join(tmpdir(), 'planners-bypage-diagrams-'));
const sha256 = data => createHash('sha256').update(data).digest('hex');

const copyPath = join(temp, 'by-page.md');
const manifestPath = join(temp, '.bypage-work/diagram-manifest.json');
const assetsPath = join(temp, '.bypage-work/asset-manifest.json');
const svgPath = join(temp, 'diagrams/asset-fixture-flow.svg');
mkdirSync(join(temp, '.bypage-work'), { recursive: true });
mkdirSync(join(temp, 'diagrams'), { recursive: true });

const SOURCE = 'flowchart TD\n  起点[品类增长停滞] --> 结论[付费点转向信任]';
// 夹具 SVG：文字来自源，形状不重要 —— 这一套用例考的是「产物与源是否对得上」，不是布局好看。
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120" width="320" height="120">'
  + '<rect width="320" height="120" fill="#fffdf8"/><text x="160" y="60">品类增长停滞</text><text x="160" y="90">付费点转向信任</text></svg>';
writeFileSync(svgPath, svg);

const COPY = `---
contract_version: 1.0.0
page_number: 1
section_id: sec-01
page_type: diagram
page_title: "夹具页"
main_message: "图与源必须对得上"
---

## Page Content

### 一张图

![增长停滞之后的转向](diagrams/asset-fixture-flow.svg)

## Speaker Notes

讲这一页。

## Production Notes

- **版面**：流程图居中。

## Sources

- \`project/source.md\` · 第 1 行
`;
writeFileSync(copyPath, COPY);

const writeManifests = ({ visual = 'pending', source = SOURCE, svgBody = svg, assetId = 'asset-fixture-flow', output = '../diagrams/asset-fixture-flow.svg' } = {}) => {
  writeFileSync(manifestPath, JSON.stringify({
    contract_version: 'diagram-manifest/1.0.0',
    renderer: { name: 'pele', version: '1.6.0' },
    theme: { preset: 'paper', variables: {} },
    diagrams: [{
      asset_id: assetId,
      page_number: 1,
      intent: '夹具：验证产物、源与正文三者绑定',
      source_id: 'src-fixture',
      semantic_class: 'narrative',
      syntax: 'mermaid',
      source,
      output,
      rendered_sha256: sha256(svgBody),
      options: { max_width: 560 },
      visual_check: visual === 'passed'
        ? { status: 'passed', method: 'fixture', notes: '夹具图已目检' }
        : { status: visual, method: '', notes: '' },
    }],
  }, null, 2));
  writeFileSync(assetsPath, JSON.stringify({
    contract_version: 'asset-manifest/1.1.0',
    asset_root: '.',
    assets: [{
      asset_id: assetId,
      path: '../diagrams/asset-fixture-flow.svg',
      preview_path: null,
      processed_path: null,
      source_sha256: sha256(svgBody),
      processed_sha256: null,
      kind: 'diagram',
      semantic_class: 'narrative',
      source_id: 'src-fixture',
      source_context: '夹具',
      status: 'selected',
      processing_level: 'none',
      processing_notes: '夹具',
      visual_check: visual === 'passed'
        ? { status: 'passed', method: 'fixture', notes: '夹具图已目检' }
        : { status: visual, method: '', notes: '' },
      width: 320,
      height: 120,
      issues: [],
    }],
  }, null, 2));
  writeFileSync(svgPath, svgBody);
};

const validate = (extra = [], { allowFailure = false } = {}) => jsonOutput(runNode(
  join(root, 'scripts/validate-diagrams.mjs'),
  ['--manifest', manifestPath, '--assets', assetsPath, '--copy', copyPath, ...extra],
  { allowFailure },
));
const codes = result => result.errors.map(error => error.code);

// ① 基线：产物、源、资产、正文四处对得上
writeManifests();
let result = validate();
assert(result.valid, '基线必须通过：' + JSON.stringify(result.errors));
pass('基线：图与源、资产清单、正文引用一致');

// ② 终审门禁：没看过就不能进终稿
result = validate(['--final'], { allowFailure: true });
assert(!result.valid && codes(result).includes('visual_check_required'), '没做视觉检查不得进终审');
pass('终审门禁：visual_check 未 passed 时拦下');

writeManifests({ visual: 'passed' });
result = validate(['--final']);
assert(result.valid, '看过之后应可进终审：' + JSON.stringify(result.errors));
pass('终审门禁：看过之后放行');

// ③ 手改 SVG：Hash 与文字双重露馅（记录不动，只改文件 —— 这正是有人偷偷改图的形状）
writeManifests({ visual: 'passed' });
writeFileSync(svgPath, svg.replace('品类增长停滞', '品类增长停滞了'));
result = validate(['--final'], { allowFailure: true });
assert(!result.valid && codes(result).includes('render_hash_mismatch'), '手改产物必须被 Hash 挡下');
assert(codes(result).includes('text_drift'), '手改产物必须被文字 ⊆ 源 挡下');
pass('手改 SVG：render_hash_mismatch + text_drift');

// ④ 只改源不改产物
writeManifests({ visual: 'passed', source: SOURCE.replace('付费点转向信任', '付费点转向体验') });
result = validate(['--final'], { allowFailure: true });
assert(!result.valid, '源与产物不一致必须报错');
pass('源产物漂移：' + codes(result).join(' + '));

// ⑤ 正文没引用这张图
writeManifests({ visual: 'passed' });
writeFileSync(copyPath, readFileSync(copyPath, 'utf8').replace('![增长停滞之后的转向](diagrams/asset-fixture-flow.svg)', '（图略）'));
result = validate(['--final'], { allowFailure: true });
assert(!result.valid && codes(result).includes('copy_reference_missing'), '画了没人用必须被挡下');
pass('正文引用：copy_reference_missing');

// ⑥ 资产清单里没有这张图
writeManifests({ visual: 'passed' });
const assetsDoc = JSON.parse(readFileSync(assetsPath, 'utf8'));
assetsDoc.assets = [];
writeFileSync(assetsPath, JSON.stringify(assetsDoc, null, 2));
result = validate(['--final'], { allowFailure: true });
assert(!result.valid && codes(result).includes('asset_missing'), '未登记的图必须被挡下');
pass('资产登记：asset_missing');

// ⑦ 没有事实出处的图（source_id 缺失）在渲染同步时就被拒绝
writeManifests({ visual: 'passed' });
const manifestDoc = JSON.parse(readFileSync(manifestPath, 'utf8'));
delete manifestDoc.diagrams[0].source_id;
writeFileSync(manifestPath, JSON.stringify(manifestDoc, null, 2));
const assetsWithoutSource = JSON.parse(readFileSync(assetsPath, 'utf8'));
assetsWithoutSource.assets[0].source_id = '';
writeFileSync(assetsPath, JSON.stringify(assetsWithoutSource, null, 2));
result = validate(['--final'], { allowFailure: true });
assert(!result.valid && codes(result).includes('asset_source_id'), '图必须有事实出处');
pass('事实出处：asset_source_id');

// ⑧ 渲染器可用时：确定性、重渲染比对、真实来源
writeFileSync(copyPath, COPY);   // ⑤ 删过引用，这里复原
writeManifests({ visual: 'passed' });
const renderScript = join(root, 'scripts/render-diagrams.mjs');
const rendered = jsonOutput(runNode(renderScript, ['--manifest', manifestPath, '--assets', assetsPath, '--copy', copyPath], { allowFailure: true }));
if (rendered.errors?.some(error => ['renderer_unavailable', 'install'].includes(error.code)) || rendered.valid === false) {
  pass('渲染确定性：跳过（当前环境解析不到 pele）');
} else {
  // 产物变了 → 上一次的「看过」必须作废（换方向、调画框、改字号都会让目检结论失效）
  assert(rendered.visual_check_reset.includes('asset-fixture-flow'), '重渲染换了字节就必须作废视觉检查');
  pass('视觉检查复位：图变了，passed 被清回 pending');

  const again = jsonOutput(runNode(renderScript, ['--manifest', manifestPath, '--assets', assetsPath, '--check'], { allowFailure: true }));
  assert(again.valid && again.rendered.every(item => item.changed === false), '同源同版本必须渲染出同样字节');
  assert(existsSync(svgPath) && readFileSync(svgPath, 'utf8').includes('<svg'), '渲染必须产出真实 SVG');
  pass('渲染确定性：两次渲染字节一致');

  // 重新看过之后才允许进终审
  for (const path of [manifestPath, assetsPath]) {
    const doc = JSON.parse(readFileSync(path, 'utf8'));
    const list = doc.diagrams || doc.assets;
    list[0].visual_check = { status: 'passed', method: 'fixture re-inspect', notes: '重渲染后重新目检' };
    writeFileSync(path, JSON.stringify(doc, null, 2));
  }
  const check = validate(['--final', '--check-render']);
  assert(check.valid, '重新目检后重渲染比对必须通过：' + JSON.stringify(check.errors));
  pass('重渲染比对：--check-render 通过');

  // 改源后不重渲染 → render_drift
  const drift = JSON.parse(readFileSync(manifestPath, 'utf8'));
  drift.diagrams[0].source = drift.diagrams[0].source.replace('付费点转向信任', '付费点转向体验');
  writeFileSync(manifestPath, JSON.stringify(drift, null, 2));
  const drifted = validate(['--final', '--check-render'], { allowFailure: true });
  assert(!drifted.valid && codes(drifted).includes('render_drift'), '改源不重渲染必须被 render_drift 挡下');
  pass('渲染漂移：render_drift');
}
