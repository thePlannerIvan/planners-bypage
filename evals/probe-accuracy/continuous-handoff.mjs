#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i]] = process.argv[i + 1];
const workspace = resolve(import.meta.dirname, '../../..');
const library = resolve(args['--library-root'] || join(workspace, '02-skills-library'));
const candidate = resolve(import.meta.dirname, '../candidate');
const bypage = resolve(args['--bypage-root'] || join(candidate, '02-content-assembly/planners-bypage'));
const fact = resolve(args['--fact-root'] || join(candidate, '01-data-analysis/planners-fact-check'));
const ppt = resolve(args['--ppt-root'] || join(library, '03-design-delivery/planners-ppt-hell'));
const proposal = resolve(args['--proposal-root'] || join(library, '02-content-assembly/planners-proposal-system'));
const sourceIndexRoot = resolve(args['--source-index-root'] || join(library, '00-system/planners-source-index'));
const reviewCoreRoot = resolve(args['--review-core-root'] || join(library, '00-system/planners-review-core'));
const reports = resolve(args['--out'] || join(import.meta.dirname, 'runs'));
mkdirSync(reports, { recursive: true });
const root = mkdtempSync(join(reports, 'handoff-'));
const modules = join(root, 'modules');
mkdirSync(modules);
for (const [name, path] of [['planners-fact-check', fact],
  ['planners-review-core', reviewCoreRoot],
  ['planners-source-index', sourceIndexRoot]]) symlinkSync(path, join(modules, name), 'dir');
const env = { ...process.env, PLANNERS_MODULES_HOME: resolve(args['--modules-home'] || modules), PLANNERS_NO_AUTO_INSTALL: '1' };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, doc) => writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
const calls = [], results = [];
let errors = 0;
function command(executable, file, params = []) {
  const implementationHash = sha(readFileSync(file));
  const run = spawnSync(executable, [file, ...params], { encoding: 'utf8', env, timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  let out = null;
  try { out = JSON.parse(run.stdout); } catch { /* The Python init CLI intentionally prints text. */ }
  const call = { executable, file, implementation_sha256: implementationHash, args: params, exit: run.status, out, stdout: run.stdout, stderr: run.stderr, error: run.error?.message };
  calls.push(call);
  return call;
}
const node = (skill, script, params) => command(process.execPath, join(skill, script), params);
const python = (script, params) => command(args['--python'] || 'python3', join(ppt, 'scripts', script), params);
function record(id, passed, evidence = {}, category = passed ? 'pass' : 'finding') {
  results.push({ id, passed, category, evidence });
  console.log(`${category}: ${id}`);
}
function test(id, body) {
  try { body(); } catch (error) { errors++; record(id, false, { message: error.message, stack: error.stack }, 'harness_error'); }
}

const project = join(root, 'project');
const upstream = join(project, '.proposal-work');
const work = join(project, '.bypage-work');
mkdirSync(upstream, { recursive: true });
mkdirSync(join(work, 'assets/original'), { recursive: true });
const indexPath = join(upstream, 'source-index.json');
const sourcePath = join(upstream, 'source.md');
const source = readFileSync(join(import.meta.dirname, 'fixtures/source.md'));
writeFileSync(sourcePath, source);
writeJson(indexPath, { contract_version: 'source-index/2.0.0', source_root: '.',
  sources: [{ source_id: 'src-fixture', origin: { path: 'source.md', sha256: sha(source), bytes: source.length },
    kind: 'document', role: 'Fictional source used only for tests', audit_layer: { mode: 'source_file' },
    coverage: { status: 'full', scope: 'Whole fictional source' }, anchors: [{ kind: 'heading', value: 'Survey' }] }], blind_spots: [] });
const memory = join(upstream, 'project-memory.md');
writeFileSync(memory, '# TEST FIXTURE ONLY\n\nShared memory belongs to this test, not a customer project.\n');
const architecture = json(join(proposal, 'proposal-co-creation/templates/page-architecture.json'));
architecture.pages[0].boundary = '仅限120名中国受访客户的复购意愿，不是实际复购率。';
architecture.pages[0].chart_brief = '展示78/120=65%，同时保留分母、地区与时间。';
architecture.pages[0].layout_direction = '正文与图表共享同一限定。';
architecture.pages[0].content_blocks[0].suggested_form = null;
architecture.appendix = [{ appendix_id: 'ap-test', title: '试点前提', content: '培训完成后可能降低时间，尚未开展对比试验。' }];
const architecturePath = join(upstream, 'page-architecture.json');
const localArchitecture = join(work, 'page-architecture.json');
writeJson(architecturePath, architecture);

test('proposal-adapter-contract-preservation', () => {
  const original = readFileSync(architecturePath);
  const input = node(proposal, 'proposal-co-creation/scripts/validate-page-architectures.mjs', [architecturePath]);
  assert.equal(input.exit, 0, input.stdout + input.stderr);
  const adapt = node(bypage, 'scripts/adapt-proposal-architecture.mjs', ['--input', architecturePath, '--output', localArchitecture]);
  assert.equal(adapt.exit, 0, adapt.stdout + adapt.stderr);
  const got = json(localArchitecture), page = got.pages[0], from = architecture.pages[0];
  assert.equal(got.contract_version, 'page-architecture/1.0.0');
  for (const field of ['project_id', 'storyline_thesis']) assert.equal(got[field], architecture[field]);
  assert.equal(got.sections[0].audience_shift, architecture.sections[0].cognitive_job);
  for (const field of ['page_number', 'section_id', 'page_job', 'title_intent', 'transition']) assert.equal(page[field], from[field]);
  assert.equal(page.main_message, from.claim);
  assert.deepEqual(page.source_needs, from.evidence_needs);
  for (const [i, block] of from.content_blocks.entries()) {
    for (const field of ['block_title', 'role', 'content_requirement']) assert.equal(page.content_blocks[i][field], block[field]);
    if (block.suggested_form != null) assert.equal(page.content_blocks[i].suggested_form, block.suggested_form);
  }
  for (const field of ['boundary', 'chart_brief', 'layout_direction']) assert(page.content_blocks.some(block => block.content_requirement === from[field]));
  assert(got.pages[1].content_blocks.some(block => block.content_requirement === architecture.appendix[0].content));
  assert(readFileSync(architecturePath).equals(original));
  const working = readFileSync(localArchitecture);
  assert.notEqual(node(bypage, 'scripts/adapt-proposal-architecture.mjs', ['--input', architecturePath, '--output', localArchitecture]).exit, 0);
  assert(readFileSync(localArchitecture).equals(working));
  assert.notEqual(node(bypage, 'scripts/adapt-proposal-architecture.mjs', ['--input', architecturePath, '--output', architecturePath]).exit, 0);
  assert(readFileSync(architecturePath).equals(original));
  assert.notEqual(node(bypage, 'scripts/adapt-proposal-architecture.mjs', ['--input', architecturePath]).exit, 0);
  record('proposal-adapter-contract-preservation', true, { input: architecturePath, output: localArchitecture, pages: got.pages.length,
    checked: ['null suggested_form', 'cognitive_job', 'claim', 'evidence_needs', 'boundary', 'chart_brief', 'layout_direction', 'appendix', 'unchanged upstream', 'existing working file not overwritten', 'required CLI arguments'] });
});

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aI1sAAAAASUVORK5CYII=', 'base64');
const imagePath = join(work, 'assets/original/chart.png');
writeFileSync(imagePath, png);
const manifestPath = join(work, 'asset-manifest.json');
writeJson(manifestPath, { contract_version: 'asset-manifest/1.1.0', asset_root: 'assets', assets: [{
  asset_id: 'asset-chart', path: 'original/chart.png', preview_path: null, processed_path: null,
  source_sha256: sha(png), processed_sha256: null, kind: 'image', semantic_class: 'uncertain', source_id: 'src-fixture',
  source_context: 'TEST FIXTURE: one pixel is an asset transport sentinel, not factual chart evidence.', status: 'selected',
  processing_level: 'none', processing_notes: '', visual_check: { status: 'passed', method: 'synthetic-fixture', notes: 'TEST ONLY: known sentinel PNG bytes, not a real visual inspection.' },
  width: 1, height: 1, issues: [] }] });
const copyPath = join(work, 'bypage-draft.md');
const body = '乙公司于2024年访问中国120名客户，其中78名表示愿意复购，占65%；仅代表该访问样本中的意愿。';
const speaker = '讲述时区分愿意复购与实际复购行为，不推广到所有消费者。';
const production = '保留样本分母与地区；使用 `assets/original/chart.png` 作为测试运输占位素材。';
const locator = 'src-fixture / Survey；Publication / 2024-10-08';
writeFileSync(copyPath, `---\ncontract_version: 1.0.0\npage_number: 1\nsection_id: sec-reframe\npage_type: explanation\npage_title: "受访客户的复购意愿"\nmain_message: "复购意愿不是已发生的复购行为"\n---\n\n## Page Content\n\n${body}\n\n![TEST sentinel](assets/original/chart.png)\n\n## Speaker Notes\n\n${speaker}\n\n## Production Notes\n\n${production}\n\n## Sources\n\n- ${locator}\n`);
const auditPath = join(work, 'fact-audit.json');
writeJson(auditPath, { contract_version: 'fact-audit/1.0.0', artifact: { path: copyPath, sha256: sha(readFileSync(copyPath)) },
  source_index: { path: indexPath, index_sha256: null, read_at: '2026-10-08' }, checker: 'independent semantic comparison; TEST FIXTURE ONLY', checked_at: '2026-10-08', blind_spots: [], suspects: [] });
const feedbackPath = join(work, 'review-feedback.json');
writeJson(feedbackPath, { contract_version: '1.1.0', review_kind: 'bypage',
  source_sha256: sha(readFileSync(copyPath, 'utf8') + '\n---FACT-AUDIT---\n' + readFileSync(auditPath, 'utf8')),
  saved_at: '2026-10-08T00:00:00Z', overall_decision: 'approve', overall_feedback_zh: 'TEST FIXTURE ONLY: no real user approval.',
  decisions: [{ page_number: 1, decision: 'approve', feedback_zh: '', attachments: [] }] });
const delivered = join(project, 'deliverable/by-page.md');
test('bypage-delivery-consumes-single-active-index', () => {
  const checked = node(bypage, 'scripts/validate-source-index.mjs', [indexPath, '--strict-files']);
  assert(checked.out?.valid, JSON.stringify(checked));
  const format = node(bypage, 'scripts/validate-bypage.mjs', [copyPath]);
  assert(format.out?.valid, JSON.stringify(format));
  const built = node(bypage, 'scripts/build-reviewed-copy.mjs', ['--copy', copyPath, '--audit', auditPath, '--feedback', feedbackPath,
    '--manifest', manifestPath, '--output', delivered, '--assets-dir', join(project, 'deliverable/assets')]);
  assert.equal(built.exit, 0, built.stdout + built.stderr);
  const text = readFileSync(delivered, 'utf8');
  for (const value of [body, speaker, locator, '保留样本分母与地区']) assert(text.includes(value));
  assert(text.includes('assets/original/asset-chart-chart.png'));
  assert.equal(json(auditPath).source_index.path, indexPath);
  assert(!existsSync(join(work, 'source-index.json')));
  record('bypage-delivery-consumes-single-active-index', true, { delivered, audit: auditPath, authoritative_index: indexPath, snapshot_hash: sha(text),
    audit_hash: json(auditPath).artifact.sha256, snapshot_has_distinct_hash: sha(text) !== json(auditPath).artifact.sha256 });
});

for (const [id, script] of [['prepare', 'prepare_source_material.py'], ['init', 'init_svg_project.py']]) {
  test('ppt-hell-' + id + '-preserves-approved-content', () => {
    const output = join(root, 'ppt-' + id);
    const upstreamHashes = [architecturePath, indexPath, copyPath, auditPath, feedbackPath, memory].map(path => [path, sha(readFileSync(path))]);
    const result = python(script, [output, '--source', delivered]);
    assert.equal(result.exit, 0, result.stderr + result.stdout);
    const normalized = join(output, '_internal/00_project/source/source.md');
    const text = readFileSync(normalized, 'utf8');
    for (const value of [body, speaker, locator, '保留样本分母与地区', '## P01', '## Speaker Notes', '## Production Notes', '## Sources']) assert(text.includes(value), `${id} lost ${value}`);
    const sourceAssets = json(join(output, '_internal/00_project/source/source_assets.json'));
    assert.equal(sourceAssets.original_source, delivered);
    assert.equal(sourceAssets.assets.length, 1);
    assert.equal(sourceAssets.assets[0].asset_id, 'asset_001');
    assert.equal(sha(readFileSync(join(output, sourceAssets.assets[0].normalized_path))), sha(png));
    const deliveredAssets = json(join(project, 'deliverable/assets/asset-manifest.json'));
    assert.equal(deliveredAssets.assets[0].source_sha256, sourceAssets.assets[0].sha256);
    for (const match of text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) assert(existsSync(resolve(dirname(normalized), match[1])));
    for (const [path, hash] of upstreamHashes) assert.equal(sha(readFileSync(path)), hash);
    function findIndexes(dir) {
      return readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? findIndexes(join(dir, item.name)) : item.name === 'source-index.json' ? [join(dir, item.name)] : []);
    }
    assert.equal(findIndexes(output).length, 0);
    const oldProductionRef = text.match(/`(assets\/original\/[^`]+)`/);
    const productionRefReadable = oldProductionRef ? existsSync(resolve(dirname(normalized), oldProductionRef[1])) : null;
    record('ppt-hell-' + id + '-preserves-approved-content', true, { normalized, source_assets: sourceAssets, authoritative_index: indexPath,
      original_inputs_unchanged: true, competing_indexes_created: false,
      notes_asset_reference_readable: productionRefReadable,
      limitation: 'Only Markdown image targets are normalized. Inline Production Notes paths need explicit mapping against source_assets.json.' });
    if (productionRefReadable === false) record('ppt-hell-' + id + '-notes-asset-remap-needed', false,
      { notes_reference: oldProductionRef[1], input_snapshot: delivered, normalized,
        verified_mapping: { bypage_asset_id: deliveredAssets.assets[0].asset_id, ppt_asset_id: sourceAssets.assets[0].asset_id, sha256: sourceAssets.assets[0].sha256 },
        interpretation: 'Manual content/asset mapping is required, not evidence that textual notes were lost. The snapshot asset manifest plus matching bytes connect the Production Notes path to the new PPT asset ID.' }, 'handoff_caveat');
    if (id === 'init') {
      const pageContent = json(join(output, '_internal/01_content/page_content.json'));
      assert.equal(pageContent.pages.length, 0);
      assert.equal(pageContent.source_path, '_internal/00_project/source/source.md');
      record('ppt-hell-init-is-not-automatic-bypage-page-adapter', true,
        { pages: pageContent.pages.length, interpretation: 'Init preserves the normalized source but creates an empty page_content stub; Agent must explicitly populate pages and map body/notes/source IDs.' }, 'documented_manual_step');
      assert.notEqual(python(script, [output, '--source', delivered]).exit, 0);
      record('ppt-hell-existing-project-resume-guard', true);
    }
  });
}

const implementationHashes = Object.fromEntries(calls.map(call => [call.file, sha(readFileSync(call.file))]));
const report = { test_only: true, real_user_approval: false, bypage, fact, ppt, run_dir: root, calls, results,
  modules_home: env.PLANNERS_MODULES_HOME, implementation_hashes: implementationHashes, unexpected_harness_errors: errors };
writeJson(join(root, 'report.json'), report);
writeFileSync(join(root, 'report.md'), '# Continuous content handoff\n\nAll approvals and assets are dedicated synthetic fixtures. No host was started.\n\n'
  + results.map(result => `- ${result.category}: ${result.id}\n  ${JSON.stringify(result.evidence)}`).join('\n') + '\n');
console.log(`Report: ${join(root, 'report.json')}\nResults=${results.length}; harness_errors=${errors}`);
process.exitCode = errors ? 1 : 0;
