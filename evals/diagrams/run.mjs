import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assert, jsonOutput, pass, runNode } from '../lib/assert.mjs';

const root = resolve(import.meta.dirname, '../..');
const temp = mkdtempSync(join(tmpdir(), 'planners-bypage-diagrams-'));
try {
  const sha256 = data => createHash('sha256').update(data).digest('hex');

  const workDir = join(temp, '.planners');
  const copyPath = join(workDir, 'by-page.md');
  const manifestPath = join(workDir, 'diagram-manifest.json');
  const assetsPath = join(workDir, 'by-page.assets.json');
  const svgPath = join(workDir, 'assets/asset-fixture-flow.svg');
  mkdirSync(join(workDir, 'assets'), { recursive: true });

  const SOURCE = 'flowchart TD\n  起点[品类增长停滞] --> 结论[付费点转向信任]';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120" width="320" height="120">'
    + '<rect width="320" height="120" fill="#fffdf8"/><text x="160" y="60">品类增长停滞</text><text x="160" y="90">付费点转向信任</text></svg>';

  const COPY = `---
contract: planners-doc/2
doc: by-page
project: diagrams-fixture
---

# 一、主线

## 夹具页

### 正文

![增长停滞之后的转向](assets/asset-fixture-flow.svg)

图与源必须对得上。

### 口播

### 制作

> \`project/source.md\` · 第 1 行
`;
  writeFileSync(copyPath, COPY);

  const writeManifests = ({ visual = 'pending', source = SOURCE, svgBody = svg, assetId = 'asset-fixture-flow', output = 'assets/asset-fixture-flow.svg', includeSourceId = true } = {}) => {
    const diagram = {
      asset_id: assetId,
      page_number: 1,
      intent: '夹具：验证产物、源与 planners-doc/2 正文绑定',
      semantic_class: 'narrative',
      syntax: 'mermaid',
      source,
      output,
      rendered_sha256: sha256(svgBody),
      options: { max_width: 560 },
      visual_check: visual === 'passed'
        ? { status: 'passed', method: 'fixture', notes: '夹具图已目检' }
        : { status: visual, method: '', notes: '' },
    };
    if (includeSourceId) diagram.source_id = 'src-fixture';

    writeFileSync(manifestPath, JSON.stringify({
      contract_version: 'diagram-manifest/1.0.0',
      renderer: { name: 'pele', version: '1.6.0' },
      theme: { preset: 'paper', variables: {} },
      diagrams: [diagram],
    }, null, 2));

    writeFileSync(assetsPath, JSON.stringify({
      contract: 'doc-assets/1',
      doc: 'by-page.md',
      assets: [{
        path: 'assets/asset-fixture-flow.svg',
        kind: 'svg',
        sha256: sha256(svgBody),
        bytes: Buffer.byteLength(svgBody, 'utf8'),
        anchors: [],
        alt: '增长停滞之后的转向',
      }],
    }, null, 2));
    writeFileSync(svgPath, svgBody);
  };

  const validate = (extra = [], { allowFailure = false, withAssets = true } = {}) => jsonOutput(runNode(
    join(root, 'scripts/validate-diagrams.mjs'),
    ['--manifest', manifestPath, ...(withAssets ? ['--assets', assetsPath] : []), '--copy', copyPath, ...extra],
    { allowFailure },
  ));
  const codes = result => result.errors.map(error => error.code);

  // ① 基线：无需 --assets 与 带 doc-assets/1 都必须通过
  writeManifests();
  let result = validate([], { withAssets: false });
  assert(result.valid, '省略 --assets 时基线必须通过：' + JSON.stringify(result.errors));
  result = validate([], { withAssets: true });
  assert(result.valid, '带 doc-assets/1 时基线必须通过：' + JSON.stringify(result.errors));
  pass('基线：图与源、doc-assets/1、planners-doc/2 正文一致');

  // ② 终审门禁
  result = validate(['--final'], { allowFailure: true });
  assert(!result.valid && codes(result).includes('visual_check_required'), '没做视觉检查不得进终审');
  writeManifests({ visual: 'passed' });
  result = validate(['--final']);
  assert(result.valid, '看过之后应可进终审：' + JSON.stringify(result.errors));
  pass('终审门禁：visual_check');

  // ③ 手改 SVG
  writeManifests({ visual: 'passed' });
  writeFileSync(svgPath, svg.replace('品类增长停滞', '品类增长停滞了'));
  result = validate(['--final'], { allowFailure: true });
  assert(!result.valid && codes(result).includes('render_hash_mismatch') && codes(result).includes('text_drift'), '手改产物必须被 Hash + text_drift 挡下');
  pass('手改 SVG：render_hash_mismatch + text_drift');

  // ④ 正文没引用这张图
  writeManifests({ visual: 'passed' });
  writeFileSync(copyPath, COPY.replace('![增长停滞之后的转向](assets/asset-fixture-flow.svg)', '（图略）'));
  result = validate(['--final'], { allowFailure: true });
  assert(!result.valid && codes(result).includes('copy_reference_missing'), 'planners-doc/2 缺图引用必须被挡下');
  pass('planners-doc/2 正文引用检查：copy_reference_missing');

  // ⑤ 事实出处缺失
  writeManifests({ visual: 'passed', includeSourceId: false });
  result = validate(['--final'], { allowFailure: true, withAssets: false });
  assert(!result.valid && codes(result).includes('asset_source_id'), '图必须声明 source_id');
  pass('事实出处：asset_source_id');

  // ⑥ 渲染器可用时：确定性、重渲染比对
  writeFileSync(copyPath, COPY);
  writeManifests({ visual: 'passed' });
  const renderScript = join(root, 'scripts/render-diagrams.mjs');
  const rendered = jsonOutput(runNode(renderScript, ['--manifest', manifestPath, '--assets', assetsPath, '--copy', copyPath], { allowFailure: true }));
  if (rendered.errors?.some(error => ['renderer_unavailable', 'install'].includes(error.code)) || rendered.valid === false) {
    pass('渲染确定性：跳过（当前环境解析不到 pele）');
  } else {
    assert(rendered.visual_check_reset.includes('asset-fixture-flow'), '重渲染换了字节就必须作废视觉检查');
    const again = jsonOutput(runNode(renderScript, ['--manifest', manifestPath, '--assets', assetsPath, '--check'], { allowFailure: true }));
    assert(again.valid && again.rendered.every(item => item.changed === false), '同源同版本必须渲染出同样字节');
    assert(existsSync(svgPath) && readFileSync(svgPath, 'utf8').includes('<svg'), '渲染必须产出真实 SVG');

    const mDoc = JSON.parse(readFileSync(manifestPath, 'utf8'));
    mDoc.diagrams[0].visual_check = { status: 'passed', method: 'fixture re-inspect', notes: '重渲染后重新目检' };
    writeFileSync(manifestPath, JSON.stringify(mDoc, null, 2));
    const check = validate(['--final', '--check-render']);
    assert(check.valid, '重新目检后重渲染比对必须通过：' + JSON.stringify(check.errors));
    pass('渲染确定性与重渲染比对通过');
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
