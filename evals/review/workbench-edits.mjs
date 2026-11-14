import {existsSync,mkdtempSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {assert,jsonOutput,pass,runNode} from '../lib/assert.mjs';
import {moduleScript} from '../../scripts/lib/planners-modules.mjs';
import {sha256} from '../../scripts/lib/review-edits.mjs';

// 逐页稿（copy 类型）的新工作台 UI：没有故事线，主编辑面是 #pageTitle 与正文；
// 自动保存直接回写 canonical copy，批注走按页任务，不再有 legacy 提交文件。
// HTTP 与不透明 iframe 各跑一遍（DSH 插件里页面就活在不透明源 iframe）。
const root = resolve(import.meta.dirname, '../..');
const python = process.env.PLAYWRIGHT_PYTHON || 'python3';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const block = n => `---\ncontract_version: 1.0.0\npage_number: ${n}\nsection_id: sec-one\npage_type: explanation\npage_title: "Page ${n}"\nmain_message: "Claim ${n}"\n---\n\n## Page Content\n\nOriginal paragraph ${n}.\n\n| Name | Detail |\n| --- | --- |\n| Original cell | Content |\n\n![Original image](one.png)\n\n## Speaker Notes\n\nOriginal notes.\n\n## Production Notes\n\nOriginal production.\n\n## Sources\n\n- src-doc\n`;

function buildFixture(name) {
  const dir = mkdtempSync(join(tmpdir(), `bypage-workbench-ui-${name}-`));
  const reviewDir = join(dir, 'review');
  const copy = join(dir, 'copy.md'), audit = join(dir, 'audit.json'), manifest = join(dir, 'assets.json');
  writeFileSync(join(dir, 'one.png'), png);
  writeFileSync(manifest, JSON.stringify({contract_version: 'asset-manifest/1.1.0', asset_root: '.', assets: [
    {asset_id: 'asset-one', path: 'one.png', preview_path: null, processed_path: null, source_sha256: sha256(png),
      processed_sha256: null, kind: 'image', semantic_class: 'content_evidence', source_id: 'src-doc',
      source_context: 'fixture', status: 'selected', processing_level: 'none', processing_notes: '',
      visual_check: {status: 'passed', method: 'fixture', notes: 'known PNG'}, width: 1, height: 1, issues: []},
  ]}));
  writeFileSync(copy, block(1) + '\n' + block(2));
  writeFileSync(join(dir, 'source-index.json'), JSON.stringify({contract_version: 'source-index/2.0.0', source_root: '.', sources: []}));
  writeFileSync(audit, JSON.stringify({contract_version: 'fact-audit/1.0.0',
    artifact: {path: copy, sha256: sha256(readFileSync(copy))},
    source_index: {path: join(dir, 'source-index.json'), index_sha256: null, read_at: null},
    checker: 'known-fixture', blind_spots: [], suspects: []}));
  const surface = jsonOutput(runNode(join(root, 'scripts/start-bypage-review.mjs'), [
    '--copy', copy, '--audit', audit, '--assets', manifest, '--review-dir', reviewDir,
    '--kind', 'final', '--surface-only',
  ])).surface;
  return {dir, copy, reviewDir, surface};
}

function hookFor(fixture) {
  const hookScript = join(fixture.dir, 'model-edit.cjs');
  writeFileSync(hookScript, [
    "const {readFileSync, writeFileSync} = require('fs');",
    'const file = process.argv[2];',
    "writeFileSync(file, readFileSync(file, 'utf8').replace(/^page_title: .*$/m, 'page_title: \"Model changed title\"'));",
  ].join('\n'));
  const quote = value => "'" + String(value).replace(/'/g, "'\\''") + "'";
  return [process.execPath, hookScript, fixture.copy].map(quote).join(' ');
}

for (const opaque of [false, true]) {
  const fixture = buildFixture(opaque ? 'opaque' : 'http');
  const args = [moduleScript('planners-review-core', 'evals/exercise-content-review.py'), '--surface', fixture.surface];
  if (opaque) args.push('--opaque');
  else args.push('--hook-cmd', hookFor(fixture));
  const browser = spawnSync(python, args, {encoding: 'utf8'});
  assert(browser.status === 0, `${opaque ? '不透明 iframe' : 'HTTP'} 逐页稿工作台真实浏览器行为\n${browser.stdout}${browser.stderr}`);

  const edited = readFileSync(fixture.copy, 'utf8');
  // 只有 HTTP 那一轮跑了「模型改页 → 冲突卡 → 保留我的」；opaque 轮验证传输层。
  assert(edited.includes(opaque ? 'page_title: "Human \\"title\\""' : 'page_title: "After model update"'),
    '逐页稿标题（#pageTitle）必须落盘');
  assert(edited.includes('Human expanded copy'), '正文 markdown 必须落盘');
  assert(edited.includes('| Human table cell | Content |'), '表格单元格必须落盘');
  assert(edited.indexOf('Page 2') < edited.indexOf('Human'), '拖动后页序必须写进 canonical copy');
  assert(edited.includes('](one.png)') && !edited.includes('](assets/'), '图片必须还原成原始相对路径');
  assert(existsSync(join(fixture.reviewDir, 'workbench/history'))
    && readdirSync(join(fixture.reviewDir, 'workbench/history')).some(name => name.endsWith('.json')), '工作台每次保存都要留历史版本');
  const head = JSON.parse(readFileSync(join(fixture.reviewDir, 'workbench/head.json'), 'utf8'));
  assert(JSON.stringify(head.state.page_order) === '[2,1]', '排序必须写进 head', JSON.stringify(head.state.page_order));
  assert(head.page_mapping['1'] === 2 && head.page_mapping['2'] === 1, '排序后页映射必须跟随', JSON.stringify(head.page_mapping));
  assert(JSON.stringify(head.deferred?.pages) === '[]', '「保留我的」之后 deferred 必须清空', JSON.stringify(head.deferred));
  const tasks = (head.tasks ?? []).filter(task => task.status === 'pending');
  assert(tasks.some(task => task.scope === 'annotations' && Object.keys(task.page_hashes ?? {}).length),
    '#pageTaskButton 必须提交带页指纹的 annotations 任务', JSON.stringify(tasks));
  assert(!existsSync(join(fixture.reviewDir, 'review-submissions.json')), '工作台保存不是 legacy 提交');
}
pass('逐页稿工作台 UI：标题/正文/表格编辑、图片预览、拖动换序、按页自动保存与批注任务；HTTP 与不透明 iframe');
