#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i]] = process.argv[i + 1];
const workspace = resolve(import.meta.dirname, '../../..');
const library = resolve(args['--library-root'] || join(workspace, '02-skills-library'));
const bypage = resolve(args['--bypage-root'] || join(library, '02-content-assembly/planners-bypage'));
const fact = resolve(args['--fact-root'] || join(library, '01-data-analysis/planners-fact-check'));
const sourceIndexRoot = resolve(args['--source-index-root'] || join(library, '00-system/planners-source-index'));
const reviewCoreRoot = resolve(args['--review-core-root'] || join(library, '00-system/planners-review-core'));
const reports = resolve(args['--out'] || join(import.meta.dirname, 'runs'));
mkdirSync(reports, { recursive: true });
const runDir = mkdtempSync(join(reports, 'probe-'));
const dependencies = join(runDir, 'dependency-home');
mkdirSync(dependencies);
for (const [name, path] of [
  ['planners-fact-check', fact],
  ['planners-review-core', reviewCoreRoot],
  ['planners-source-index', sourceIndexRoot],
]) symlinkSync(path, join(dependencies, name), 'dir');
const env = { ...process.env, PLANNERS_MODULES_HOME: resolve(args['--modules-home'] || dependencies), PLANNERS_NO_AUTO_INSTALL: '1' };
const sha = value => createHash('sha256').update(value).digest('hex');
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, doc) => writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
const results = [];
let unexpected = 0;
const calls = [];

function cli(root, name, params) {
  const file = join(root, 'scripts', name);
  const implementationHash = sha(readFileSync(file));
  const result = spawnSync(process.execPath, [file, ...params], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 30000, env,
  });
  let out = null;
  try { out = JSON.parse(result.stdout.trim()); } catch { /* Preserve non-JSON diagnostics. */ }
  const call = { script: file, implementation_sha256: implementationHash, args: params, exit: result.status, out, stdout: result.stdout, stderr: result.stderr };
  calls.push(call);
  return call;
}

function record(id, expectation, observed, category, evidence = {}) {
  results.push({ id, expectation, observed, category, evidence });
  console.log(`${category}: ${id} -- ${observed}`);
}

function test(id, task) {
  if (args['--only'] && args['--only'] !== id) return;
  try { task(); } catch (error) {
    unexpected++;
    record(id, 'Harness must execute the fixture', error.message, 'harness_error');
  }
}

function copyPage(number, body, title = '测试页面') {
  return `---\ncontract_version: 1.0.0\npage_number: ${number}\nsection_id: sec-test\npage_type: explanation\npage_title: ${JSON.stringify(title)}\nmain_message: "模拟测试，非客户交付"\n---\n\n## Page Content\n\n${body}\n\n## Speaker Notes\n\n保留材料口径。\n\n## Production Notes\n\n无额外制作要求。\n\n## Sources\n\n- src-fixture / Survey\n`;
}

function fixture(name, content = '乙公司访问中国120名客户，其中78名愿意复购，占65%；只代表访问样本中的意愿。') {
  const dir = join(runDir, name);
  mkdirSync(dir, { recursive: true });
  const copy = join(dir, 'bypage-draft.md');
  const source = join(dir, 'source.md');
  const sourceBytes = readFileSync(join(import.meta.dirname, 'fixtures/source.md'));
  writeFileSync(source, sourceBytes);
  writeFileSync(copy, copyPage(1, content));
  const index = join(dir, 'source-index.json');
  writeJson(index, {
    contract_version: 'source-index/2.0.0', source_root: '.',
    sources: [{ source_id: 'src-fixture', origin: { path: 'source.md', sha256: sha(sourceBytes), bytes: sourceBytes.length },
      kind: 'document', role: 'Controlled source for local accuracy probes', audit_layer: { mode: 'source_file' },
      coverage: { status: 'full', scope: 'All test Markdown' }, anchors: [{ kind: 'heading', value: 'Survey' }] }],
    blind_spots: [],
  });
  const manifest = join(dir, 'asset-manifest.json');
  writeJson(manifest, { contract_version: 'asset-manifest/1.1.0', asset_root: '.', assets: [] });
  return { dir, copy, source, index, manifest, audit: join(dir, 'fact-audit.json'), feedback: join(dir, 'review-feedback.json') };
}

function audit(f, suspects = [], extra = {}) {
  writeJson(f.audit, {
    contract_version: 'fact-audit/1.0.0', artifact: { path: f.copy, sha256: sha(readFileSync(f.copy)) },
    source_index: { path: f.index, index_sha256: null, read_at: '2026-10-08' },
    checker: 'independent-agent-tests; TEST FIXTURE ONLY', checked_at: '2026-10-08',
    blind_spots: [], suspects, ...extra,
  });
}

function approval(f, pages = [1], exceptional = false, overrides = {}) {
  const contextPath = join(dirname(f.feedback), 'review-context.json');
  const sourceHash = existsSync(contextPath) ? readJson(contextPath).sourceSha256
    : sha(readFileSync(f.copy, 'utf8') + '\n---FACT-AUDIT---\n' + readFileSync(f.audit, 'utf8'));
  writeJson(f.feedback, {
    contract_version: '1.1.0', review_kind: 'bypage',
    source_sha256: sourceHash,
    saved_at: '2026-10-08T00:00:00Z', overall_decision: 'approve',
    overall_feedback_zh: 'TEST FIXTURE: simulated approval, not a real user or client decision.',
    decisions: pages.map(page_number => ({ page_number, decision: 'approve', feedback_zh: '', attachments: [],
      ...(exceptional ? { fact_exception_decision: 'accept' } : {}) })),
    ...overrides,
  });
}

const publicGate = f => cli(fact, 'validate-fact-audit.mjs', [f.audit, '--gate']);
const seam = (f, allow = false) => cli(bypage, 'validate-fact-audit.mjs', [
  '--audit', f.audit, '--copy', f.copy, ...(allow ? ['--allow-human-review', 'true'] : []),
]);
const review = f => cli(bypage, 'validate-review-feedback.mjs', [
  '--feedback', f.feedback, '--copy', f.copy, '--audit', f.audit, '--kind', 'final',
]);
function build(f, output = join(f.dir, 'deliverable', 'by-page.md')) {
  return cli(bypage, 'build-reviewed-copy.mjs', [
    '--copy', f.copy, '--audit', f.audit, '--feedback', f.feedback, '--manifest', f.manifest,
    '--output', output, '--assets-dir', join(f.dir, 'deliverable', 'assets'),
  ]);
}
function confirmed(overrides = {}) {
  return { id: 's-error', surface: '78%的访问客户愿意复购。', kind: 'miscalc', class: 'derived',
    verdict: 'confirmed', finding: '78/120 equals 65%, not 78%.', location: { page: 1 },
    evidence: { source_id: 'src-fixture', anchor: { kind: 'heading', value: 'Survey' }, excerpt: '78 / 120 = 65%。' },
    check: { numerator: '78', denominator: '120', recomputed: '65%', agrees: false },
    decided_by: 'agent', note: 'Change 78% to 65% and preserve the sample denominator.', ...overrides };
}

test('clean-end-to-end', () => {
  const f = fixture('clean'); audit(f); approval(f);
  const a = publicGate(f), s = seam(f), r = review(f), d = build(f);
  assert(a.out?.valid && s.out?.valid && r.out?.valid && d.out?.valid, JSON.stringify([a, s, r, d]));
  record('clean-end-to-end', 'Faithful copy with no suspects can be delivered', 'All probes returned valid=true; final file exists', 'true_green', { copy: f.copy, output: d.out.output });
});

test('old-audit-and-old-approval-rejected', () => {
  const f = fixture('stale-bindings'); audit(f); approval(f);
  writeFileSync(f.copy, readFileSync(f.copy, 'utf8').replace('只代表访问样本中的意愿', '仅限该访问样本的意愿，不是实际复购率'));
  const oldAudit = publicGate(f), oldSeam = seam(f), oldDelivery = build(f);
  assert(!oldAudit.out?.valid && oldSeam.exit !== 0 && oldDelivery.exit !== 0);
  audit(f);
  const oldReview = review(f), oldApprovalDelivery = build(f);
  assert(!oldReview.out?.valid && oldApprovalDelivery.exit !== 0);
  approval(f);
  const fresh = build(f);
  assert.equal(fresh.exit, 0, JSON.stringify(fresh));
  record('old-audit-and-old-approval-rejected', 'Changed canonical copy invalidates audit; renewed audit invalidates the old approval',
    `old_audit=${oldAudit.out?.valid}, old_audit_delivery=${oldDelivery.exit}, old_approval=${oldReview.out?.valid}, old_approval_delivery=${oldApprovalDelivery.exit}, fresh_delivery=${fresh.exit}`,
    'true_green', { public: oldAudit.out, review: oldReview.out, copy: f.copy });
});

test('valid-revise-and-missing-approval-not-deliverable', () => {
  const f = fixture('revise-not-approval'); audit(f);
  const absent = build(f);
  assert.notEqual(absent.exit, 0);
  approval(f, [1], false, { overall_decision: 'revise', decisions: [{ page_number: 1, decision: 'revise', feedback_zh: 'TEST: improve explanation.', attachments: [] }] });
  const revised = review(f), delivery = build(f);
  assert(revised.out?.valid && delivery.exit !== 0);
  record('valid-revise-and-missing-approval-not-deliverable', 'Valid feedback is not necessarily approve; absent feedback is not approval',
    `absent_delivery=${absent.exit}, revise_feedback_valid=${revised.out?.valid}, revise_delivery=${delivery.exit}`, 'true_green');
});

test('changed-source-index-stamp-rejected', () => {
  const f = fixture('stale-index');
  assert(cli(sourceIndexRoot, 'validate-source-index.mjs', [f.index, '--stamp']).out?.valid);
  audit(f, [], { source_index: { path: f.index, index_sha256: readJson(f.index).index_sha256, read_at: '2026-10-08' } });
  const index = readJson(f.index); index.sources[0].notes = 'New read scope was recorded.'; delete index.index_sha256; writeJson(f.index, index);
  assert(cli(sourceIndexRoot, 'validate-source-index.mjs', [f.index, '--stamp']).out?.valid);
  const gate = publicGate(f);
  record('changed-source-index-stamp-rejected', 'An audit tied to the old index version cannot pass after changed stamped metadata',
    `valid=${gate.out?.valid}; errors=${gate.out?.errors?.map(item => item.code)}`, gate.out?.valid ? 'false_green' : 'true_red', { public: gate.out });
});

test('upload-is-not-visual-approval', () => {
  const f = fixture('upload'); audit(f); approval(f);
  writeFileSync(join(f.dir, 'upload.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aI1sAAAAASUVORK5CYII=', 'base64'));
  const feedback = readJson(f.feedback); feedback.decisions[0].attachments = [{ url: 'upload.png', alt: 'TEST FIXTURE upload', caption: '' }]; writeJson(f.feedback, feedback);
  const imported = cli(bypage, 'import-review-assets.mjs', ['--feedback', f.feedback, '--manifest', f.manifest, '--source-id', 'src-fixture']);
  assert.equal(imported.exit, 0, JSON.stringify(imported));
  const asset = readJson(f.manifest).assets[0];
  const checked = cli(bypage, 'validate-asset-manifest.mjs', [f.manifest, '--final']);
  record('upload-is-not-visual-approval', 'Uploaded evidence stays pending until actual visual review',
    `visual_status=${asset.visual_check.status}; final_valid=${checked.out?.valid}`,
    asset.visual_check.status === 'passed' || checked.out?.valid ? 'false_green' : 'true_red', { imported: imported.out, asset, validation: checked.out });
});

test('old-approval-does-not-bind-assets', () => {
  const f = fixture('asset-approval-binding');
  const picture = join(f.dir, 'chart.svg');
  const image = number => `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="100"><rect width="240" height="100" fill="white"/><text x="10" y="50">78/120=${number}%</text></svg>`;
  writeFileSync(picture, image(65));
  writeFileSync(f.copy, copyPage(1, '乙公司访问中国120名客户，其中78名愿意复购，占65%；只代表访问样本中的意愿。\n\n![TEST survey figure](chart.svg)'));
  writeJson(f.manifest, { contract_version: 'asset-manifest/1.1.0', asset_root: '.', assets: [{
    asset_id: 'asset-chart', path: 'chart.svg', preview_path: null, processed_path: null,
    source_sha256: sha(readFileSync(picture)), processed_sha256: null, kind: 'image', semantic_class: 'content_evidence',
    source_id: 'src-fixture', source_context: 'TEST FIXTURE ONLY: fictional survey figure', status: 'selected',
    processing_level: 'none', processing_notes: '', visual_check: { status: 'passed', method: 'synthetic-fixture', notes: 'TEST ONLY: simulated visual result, not a real user approval.' },
    width: 240, height: 100, issues: [] }] });
  audit(f);
  const builtReview = cli(bypage, 'build-bypage-review.mjs', ['--copy', f.copy, '--audit', f.audit, '--assets', f.manifest,
    '--output', join(f.dir, 'review/index.html'), '--kind', 'final']);
  assert.equal(builtReview.exit, 0, JSON.stringify(builtReview));
  f.feedback = join(f.dir, 'review/review-feedback.json');
  approval(f);
  assert.equal(readJson(join(f.dir, 'review/review-context.json')).sourceSha256, readJson(f.feedback).source_sha256);
  assert.equal(builtReview.out.source_sha256, readJson(f.feedback).source_sha256);
  const hashes = [f.copy, f.audit, f.feedback].map(path => [path, sha(readFileSync(path))]);
  writeFileSync(picture, image(78));
  const manifest = readJson(f.manifest); manifest.assets[0].source_sha256 = sha(readFileSync(picture));
  manifest.assets[0].visual_check.notes = 'TEST ONLY: separately simulated new visual result; no new content approval.';
  writeJson(f.manifest, manifest);
  const checked = cli(bypage, 'validate-asset-manifest.mjs', [f.manifest, '--final']);
  assert(checked.out?.valid, JSON.stringify(checked));
  for (const [path, hash] of hashes) assert.equal(sha(readFileSync(path)), hash);
  const oldFeedback = review(f), delivery = build(f);
  const deliveredFigure = join(f.dir, 'deliverable/assets/original/asset-chart-chart.svg');
  const replacementExported = existsSync(deliveredFigure) && readFileSync(deliveredFigure, 'utf8').includes('78/120=78%');
  record('old-approval-does-not-bind-assets', 'Changed selected evidence needs updated factual inspection and current approval even when Markdown is identical',
    `new_manifest_valid=${checked.out?.valid}; old_feedback_valid=${oldFeedback.out?.valid}; delivery=${delivery.exit}; replacement_exported=${replacementExported}`,
    oldFeedback.out?.valid && delivery.exit === 0 && replacementExported ? 'false_green' : 'true_red',
    { manifest: f.manifest, approval: f.feedback, delivered_figure: deliveredFigure, copy_audit_feedback_bytes_unchanged: true,
      simulation: 'Both asset check results and approval are marked TEST FIXTURE ONLY. The test exercises version binding, not real user decision authenticity.' });
  const newReview = cli(bypage, 'build-bypage-review.mjs', ['--copy', f.copy, '--audit', f.audit, '--assets', f.manifest,
    '--output', join(f.dir, 'review/index.html'), '--kind', 'final']);
  assert.equal(newReview.exit, 0, JSON.stringify(newReview));
  for (const [path, hash] of hashes) assert.equal(sha(readFileSync(path)), hash);
  const afterRegeneration = build(f, join(f.dir, 'deliverable/new-context-by-page.md'));
  record('old-approval-after-asset-review-regeneration', 'Regenerating a review after an asset change must not transform the previous approval into approval of the new asset',
    `new_review_hash_unchanged=${newReview.out.source_sha256 === readJson(f.feedback).source_sha256}; old_feedback_delivery=${afterRegeneration.exit}`,
    afterRegeneration.exit === 0 ? 'false_green' : 'true_red', { feedback_bytes_unchanged: true, new_review: newReview.out, delivery: afterRegeneration.out,
      expected: 'No new test approval was written after either asset replacement or review regeneration.' });
});

test('independent-semantic-four-errors-and-clean', () => {
  const f = fixture('semantic');
  const artifact = readFileSync(join(import.meta.dirname, 'fixtures/semantic-artifact.md'), 'utf8');
  const bodies = artifact.split(/^## P\d+:.*$/m).slice(1);
  assert.equal(bodies.length, 5);
  writeFileSync(f.copy, bodies.map((body, i) => copyPage(i + 1, body.trim())).join('\n'));
  const findings = readJson(join(import.meta.dirname, 'fixtures/semantic-findings.json'));
  audit(f, findings.suspects);
  const enumeration = cli(fact, 'enumerate-surface.mjs', [f.copy]);
  const gate = publicGate(f), strict = seam(f), toReview = seam(f, true);
  assert(gate.out?.valid && gate.out.confirmed === 4 && strict.exit !== 0 && toReview.out?.requires_human_review);
  assert.deepEqual(toReview.out.human_review_required.map(x => x.page_number), [1, 2, 3, 4]);
  assert(!findings.suspects.some(x => x.location.page === 5));
  record('independent-semantic-four-errors-and-clean', 'Find four real drifts and keep page five clean', 'Independent comparison found denominator/qualifier/subject/date errors; clean page has no suspect', 'semantic_result', { audit: f.audit, checker: findings.method });
  const dateHint = enumeration.out.candidates.find(x => x.surface === '2025');
  record('date-enumeration-hint', 'A publication year is a quoted factual date, not page numbering',
    `2025 was enumerated with class_hint=${dateHint?.class_hint}`, dateHint?.class_hint === 'non_factual' ? 'misleading_hint' : 'hint_correct', { candidate: dateHint });
  const conditionLine = enumeration.out.candidates.some(x => x.context.includes('新的处理方案降低处理时间。'));
  record('condition-removal-no-literal-match', 'Whole-source semantic comparison must cover qualifier omissions',
    `The condition-removal sentence has enumerator candidates=${conditionLine}`, 'documented_enumerator_limit');
  approval(f, [1, 2, 3, 4, 5], true);
  const delivery = build(f);
  const preservesError = delivery.exit === 0 && readFileSync(delivery.out.output, 'utf8').includes('65%的消费者会复购。');
  record('confirmed-errors-accepted-then-delivered', 'Confirmed incorrect facts must be corrected before delivery',
    `Delivery exit=${delivery.exit}; unchanged confirmed error preserved=${preservesError}`, preservesError ? 'false_green' : 'true_red', { delivery: delivery.out, audit: f.audit, feedback: f.feedback });
});

for (const [id, location] of [['missing', undefined], ['null', { page: null }], ['unknown-page', { page: 99 }]]) {
  test('orphan-fact-' + id, () => {
    const f = fixture('orphan-' + id, '78%的访问客户愿意复购。');
    const item = confirmed();
    if (location === undefined) delete item.location; else item.location = location;
    audit(f, [item]); approval(f);
    const s = seam(f, true), r = review(f);
    const builder = cli(bypage, 'build-bypage-review.mjs', ['--copy', f.copy, '--audit', f.audit, '--assets', f.manifest, '--output', join(f.dir, 'review', 'index.html'), '--kind', 'final']);
    let marked = null;
    if (builder.exit === 0) {
      const html = readFileSync(builder.out.output, 'utf8');
      const data = JSON.parse(html.match(/<script id="reviewData" type="application\/json">([\s\S]*?)<\/script>/)[1]);
      marked = data.pages.some(page => page.requires_fact_decision);
    }
    const d = build(f);
    record('orphan-fact-' + id, 'A confirmed suspect must map to a real review page or stop the flow',
      `seam=${s.out?.valid}, review=${r.out?.valid}, visible_exception=${marked}, delivery=${d.exit}`,
      r.out?.valid && marked === false && d.exit === 0 ? 'false_green' : r.out?.valid && !s.out?.valid ? 'partial_false_green' : 'true_red', { location: location ?? 'omitted', human: s.out?.human_review_required, delivery: d.out });
  });

  test('orphan-caveat-' + id, () => {
    const f = fixture('orphan-caveat-' + id, '78%的访问客户愿意复购。');
    const item = confirmed({ verdict: 'accepted_with_caveat', decided_by: 'human',
      note: 'TEST FIXTURE ONLY: simulated explicit exception acceptance. Not a real user decision.' });
    if (location === undefined) delete item.location; else item.location = location;
    audit(f, [item]); approval(f);
    const s = seam(f, true), r = review(f), d = build(f);
    record('orphan-caveat-' + id, 'An accepted exception still needs a real page and explicit page-level review',
      `seam=${s.out?.valid}, review=${r.out?.valid}, delivery=${d.exit}`,
      r.out?.valid && d.exit === 0 ? 'false_green' : r.out?.valid && !s.out?.valid ? 'partial_false_green' : 'true_red', { location: location ?? 'omitted', human: s.out?.human_review_required, delivery: d.out });
  });
}

test('mapped-caveat-needs-explicit-acceptance', () => {
  const f = fixture('mapped-caveat');
  audit(f, [confirmed({ verdict: 'accepted_with_caveat', decided_by: 'human',
    note: 'TEST FIXTURE ONLY: simulated explicit acceptance of a bounded claim.' })]);
  approval(f);
  const ordinary = build(f);
  approval(f, [1], true);
  const explicit = build(f);
  assert.notEqual(ordinary.exit, 0);
  assert.equal(explicit.exit, 0);
  record('mapped-caveat-needs-explicit-acceptance', 'Ordinary approval does not accept a mapped factual exception',
    `ordinary_delivery=${ordinary.exit}; explicit_delivery=${explicit.exit}`, 'true_green');
});

test('no-source-suspect', () => {
  const f = fixture('no-source', '该方案已显著降低处理时间。');
  audit(f, [{ id: 's-no-source', surface: '该方案已显著降低处理时间。', location: { page: 1 },
    kind: 'unsourced', class: 'quoted', verdict: 'no_source', finding: 'Source contains only a conditional hypothesis, not measured performance.',
    note: 'No supporting measurement exists.', decided_by: 'agent' }]);
  approval(f);
  const a = publicGate(f), s = seam(f), r = review(f), d = build(f);
  record('no-source-suspect', 'An unsupported factual claim must not silently be treated as clean',
    `gate=${a.out?.valid}, seam=${s.out?.valid}, human_required=${s.out?.requires_human_review}, review=${r.out?.valid}, delivery=${d.exit}`,
    d.exit === 0 && !s.out.requires_human_review ? 'false_green' : r.out?.valid && s.out?.requires_human_review ? 'partial_false_green' : 'true_red', { audit: f.audit, public: a.out, seam: s.out });
});

for (const variant of ['missing', 'malformed']) {
  test('source-index-' + variant, () => {
    const f = fixture('index-' + variant);
    if (variant === 'missing') f.index = join(f.dir, 'absent-index.json');
    else writeFileSync(f.index, '{ this is not JSON');
    audit(f); approval(f);
    const a = publicGate(f), s = seam(f), d = build(f);
    record('source-index-' + variant, 'Unavailable source-index must stay visible and block factual delivery',
      `gate=${a.out?.valid}, public_warnings=${a.out?.warnings?.map(x => x.code)}, seam=${s.out?.valid}, seam_warnings=${s.out?.warnings}, delivery=${d.exit}`,
      a.out?.warnings?.length && d.exit === 0 ? 'false_green' : 'true_red', { public: a.out, seam: s.out, delivery: d.out });
  });
}

test('blind-spot-identity-and-impact', () => {
  const f = fixture('blindspot');
  const index = readJson(f.index);
  index.blind_spots = [{ source_id: 'src-fixture', scope: 'Appendix', reason: 'No OCR text', impact: 'Cannot confirm channel-level results.' }];
  writeJson(f.index, index);
  audit(f, [], { blind_spots: [{ source_id: 'unrelated-source', scope: 'Appendix', reason: 'No OCR text', impact: 'No impact on any conclusion.' }] });
  const a = publicGate(f);
  record('blind-spot-identity-and-impact', 'Carry the source identity and consequence, not only identical scope/reason labels',
    `Changed source_id and impact accepted=${a.out?.valid}`, a.out?.valid ? 'false_green' : 'true_red', { public: a.out, audit: f.audit });
});

test('literal-pending-status-is-not-placeholder', () => {
  const f = fixture('literal-status', '订单状态为“待确认”，表示尚未由客户确认；这是业务状态，不是空白内容。');
  const r = cli(bypage, 'validate-bypage.mjs', [f.copy]);
  record('literal-pending-status-is-not-placeholder', 'Legitimate quoted business status should validate',
    `exit=${r.exit}, errors=${r.out?.errors?.map(x => x.code)}`, r.exit !== 0 ? 'false_red' : 'true_green', { copy: f.copy, validation: r.out });
});

test('embedded-page-number-is-not-page', () => {
  const f = fixture('code-page-number', '业务系统保存以下配置示例：\n\n```yaml\npage_number: 7\n```\n\n这是正文代码片段，不是第二页。');
  audit(f); approval(f);
  const format = cli(bypage, 'validate-bypage.mjs', [f.copy]);
  const r = review(f);
  assert(format.out?.valid);
  record('embedded-page-number-is-not-page', 'Only frontmatter page numbers define review pages',
    `copy_valid=${format.out.valid}, review_exit=${r.exit}, reported_pages=${r.out?.pages}`,
    r.exit !== 0 ? 'false_red' : 'true_green', { validation: r.out, copy: f.copy });
});

test('duplicate-review-decisions', () => {
  const f = fixture('duplicate-decisions'); audit(f); approval(f, [1, 1]);
  const r = review(f);
  record('duplicate-review-decisions', 'Exactly one decision per page', `Duplicate page 1 decision accepted=${r.out?.valid}`,
    r.out?.valid ? 'false_green' : 'true_red', { validation: r.out, feedback: f.feedback });
});

test('malformed-copy-delivery', () => {
  const f = fixture('malformed-copy');
  writeFileSync(f.copy, '---\ncontract_version: 1.0.0\npage_number: 1\npage_title: "空白稿"\n---\n\n## Speaker Notes\n\n空白。\n');
  audit(f); approval(f);
  const format = cli(bypage, 'validate-bypage.mjs', [f.copy]), d = build(f);
  assert(!format.out?.valid);
  record('malformed-copy-delivery', 'Reject a draft missing actual content and required fields',
    `format_valid=${format.out.valid}, delivery_exit=${d.exit}`, d.exit === 0 ? 'false_green' : 'true_red', { invalid_copy: f.copy, format: format.out, delivery: d.out });
});

test('final-review-without-audit', () => {
  const f = fixture('review-no-audit');
  const r = cli(bypage, 'build-bypage-review.mjs', ['--copy', f.copy, '--assets', f.manifest, '--output', join(f.dir, 'review/index.html'), '--kind', 'final']);
  record('final-review-without-audit', 'A final review should not appear ready without its factual input',
    `exit=${r.exit}, result=${r.out?.valid}`, r.exit === 0 ? 'partial_false_green' : 'true_red', { builder: r.out, limitation: 'The delivery CLI still requires an audit argument; this alone is not a delivery bypass.' });
});

for (const owned of ['copy', 'audit']) {
  test('delivery-output-aliases-' + owned, () => {
    const f = fixture('alias-' + owned); audit(f); approval(f);
    const before = readFileSync(f[owned]);
    const d = build(f, f[owned]);
    const changed = !readFileSync(f[owned]).equals(before);
    record('delivery-output-aliases-' + owned, 'Export must not overwrite an upstream draft or checker-owned audit input',
      `delivery_exit=${d.exit}, original_${owned}_overwritten=${changed}`,
      d.exit === 0 && changed ? 'ownership_risk' : 'ownership_guarded', { owned_path: f[owned], delivery: d.out });
  });
}

test('prepare-rewrites-unchanged-active-index', () => {
  const f = fixture('upstream-index');
  const stamp = cli(sourceIndexRoot, 'validate-source-index.mjs', [f.index, '--strict-files', '--stamp']);
  assert(stamp.out?.valid, JSON.stringify(stamp));
  audit(f, [], { source_index: { path: f.index, index_sha256: readJson(f.index).index_sha256, read_at: '2026-10-08' } });
  const beforeGate = publicGate(f);
  assert(beforeGate.out?.valid);
  const before = readFileSync(f.index);
  const result = cli(bypage, 'prepare-audit-sources.mjs', ['--source-index', f.index]);
  const changed = !readFileSync(f.index).equals(before);
  const afterGate = publicGate(f);
  record('prepare-rewrites-unchanged-active-index', 'The shared active index may be supplemented, but unchanged preparation must preserve a valid version stamp',
    `preparation_exit=${result.exit}, processed=${result.out?.processed}, input_rewritten=${changed}, before_gate=${beforeGate.out?.valid}, after_gate=${afterGate.out?.valid}`,
    result.exit === 0 && changed && !afterGate.out?.valid ? 'false_red' : 'true_green', { supplied_index: f.index, preparation: result.out, after_gate: afterGate.out,
      ownership: 'Bypage may update the single active index for new evidence; this test concerns an unchanged Markdown source, not read-only ownership of that index.' });
});

const hashes = Object.fromEntries([
  ...['enumerate-surface.mjs', 'validate-fact-audit.mjs'].map(name => [join(fact, 'scripts', name), null]),
  ...['validate-fact-audit.mjs', 'validate-review-feedback.mjs', 'build-reviewed-copy.mjs', 'validate-bypage.mjs', 'build-bypage-review.mjs', 'prepare-audit-sources.mjs'].map(name => [join(bypage, 'scripts', name), null]),
].map(([file]) => [file, sha(readFileSync(file))]));
const report = { test_only: true, real_user_approval: false, bypage, fact, run_dir: runDir,
  modules_home: env.PLANNERS_MODULES_HOME, implementation_hashes: hashes, results, calls, unexpected_harness_errors: unexpected };
writeJson(join(runDir, 'report.json'), report);
writeFileSync(join(runDir, 'report.md'), '# Bypage and Fact Check probe accuracy\n\n'
  + `Test fixtures only. Bypage: ${bypage}\n\nFact Check: ${fact}\n\n`
  + results.map(r => `- **${r.category} / ${r.id}**: ${r.observed}\n  Expected: ${r.expectation}`).join('\n') + '\n');
console.log('Report: ' + join(runDir, 'report.json'));
const failures = results.filter(result => ['false_green', 'false_red', 'ownership_risk', 'partial_false_green', 'misleading_hint'].includes(result.category));
console.log(`Results=${results.length}; harness_errors=${unexpected}; accuracy_findings=${failures.length}`);
process.exitCode = unexpected || (args['--strict'] === 'true' && failures.length) ? 1 : 0;
