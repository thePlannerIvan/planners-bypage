import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assert, jsonOutput, pass, runNode } from '../lib/assert.mjs';
import { moduleScript } from '../../scripts/lib/planners-modules.mjs';
import { writeAuditFixture } from '../lib/audit-fixture.mjs';

// 宿主生命周期只有一份：公共模组的 Node CLI。测试**不重写**任何判据，只 import 它来收干净。
const { hostAlive, hostState, stopHost } = await import(moduleScript('planners-review-core', 'scripts/review-host.mjs'));

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

/* ---- 缝上的两条动作：① 提交（宿主原样落盘）② 收件（翻译回本 Skill 的形状）---- */
const submitToHost = (live, payload) => fetch(new URL('__review/write', live.url), {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
}).then(response => response.ok);
const readInbox = (live) => jsonOutput(runNode(join(root, 'scripts/review-inbox.mjs'), ['--surface', live.surface]));
const roundsIn = (live) => readdirSync(join(live.feedback_path, '..', 'history')).filter(name => /^round-\d+\.json$/.test(name)).sort();
/** 这次测试起过的面，收干净并回报结果（判据归模组，这里只调用）。 */
const stopAll = async (surfaces) => {
  const left = [];
  for (const surface of surfaces) {
    const state = hostState(surface);
    if (state) await stopHost(state);
    if (await hostAlive(surface)) left.push(surface);
  }
  return left;
};

const output = join(temp, 'storyline/index.html');
runNode(join(root, 'scripts/build-storyline-review.mjs'), ['--architecture', architecturePath, '--assets', manifestPath, '--output', output]);
const html = readFileSync(output, 'utf8');
assert(html.includes('更多图片') && html.includes("a.group !== 'other'") && html.includes('group":"other"'), 'Storyline Review 必须先显示推荐图片并折叠其他候选');
assert(html.includes('data-asset-choice') && html.includes('asset-one'), '图片必须可以逐张决定');
assert(html.includes('"feedbackContractVersion":"1.1.0"'), '前端保存 Payload 必须使用 Review Contract 1.1.0');
assert(existsSync(join(temp, 'storyline/assets/asset-one.png')), 'Review 必须复制可访问的图片预览');
// 入口必须有**裸标记独占一行**的桥注入点（R3）—— 宿主 serve 时原地替换它
const markerLines = html.split('\n').filter(line => line.trim() === '{{REVIEW_BRIDGE}}').length;
assert(markerLines === 1 && !html.includes('src="{{REVIEW_BRIDGE}}"') && !html.includes('>{{REVIEW_BRIDGE}}<'),
  '入口必须留一个裸着独占一行的 {{REVIEW_BRIDGE}} 注入点');

const live = jsonOutput(runNode(join(root, 'scripts/start-storyline-review.mjs'), [
  '--architecture', architecturePath, '--assets', manifestPath,
  '--review-dir', join(temp, 'live'), '--port', '0', '--no-open',
]));
const liveHtml = await (await fetch(live.url)).text();
const reviewData = JSON.parse(liveHtml.match(/<script id="reviewData" type="application\/json">([\s\S]*?)<\/script>/)?.[1] || '{}');
assert(liveHtml.includes('ReviewBridge'), '宿主 serve 出去的页面必须已经注入桥');
assert(reviewData.reviewKind === 'storyline', '页面自报的面必须是 storyline（下面几条判据都用它，而不是测试手写的字符串）');
const saved = await submitToHost(live, {
  contract_version: '1.1.0', review_kind: reviewData.reviewKind, source_sha256: reviewData.sourceSha256,
  saved_at: new Date().toISOString(), overall_decision: 'approve', overall_feedback_zh: '',
  decisions: [{ page_number: 1, decision: 'approve', feedback_zh: '', attachments: [], asset_decisions: [
    { asset_id: 'asset-one', status: 'selected' }, { asset_id: 'asset-two', status: 'backup' },
  ] }],
});
assert(saved, '真实审阅宿主必须保存图片决定');
const receipt1 = readInbox(live);
assert(receipt1.imported && receipt1.imported.round === 'history/round-01.json'
  && existsSync(join(live.feedback_path, '..', 'history', 'round-01.json')), '第一轮 Storyline 反馈必须立即追加到 round-01.json');
assert(jsonOutput(runNode(join(root, 'scripts/validate-storyline-review-feedback.mjs'), [
  '--feedback', live.feedback_path, '--architecture', architecturePath, '--assets', manifestPath,
])).valid, 'Storyline 反馈必须绑定当前架构和 Asset Manifest');
assert(receipt1.units && receipt1.units.label === '页结构' && receipt1.next_action_zh.includes('旧结构审阅续接'),
  'storyline 的收件收据必须指 storyline 自己的下一步（曾经写死成逐页面的 stages/07）', receipt1.next_action_zh);
/* ---- 验证 12/13：页面必须能"没有桥也把自己画出来" ----
   两个面共用同一份页面，所以这一条一次覆盖两家。
   做法：把 serve 出去的页面里的那段脚本拿到 node vm 里跑，DOM 换成会记账的桩，
   `localStorage` **一碰就抛**（照抄不透明源 iframe 的真实行为：有插件时页面就在那种帧里）。
   旧写法把 render() 排在 await ReviewBridge.connect() 后面 —— 握手不落地时整页只剩静态骨架、零报错。 */
const rendered = spawnSync(process.env.PLAYWRIGHT_PYTHON || 'python3', [moduleScript('planners-review-core','evals/check-content-render.py'),'--html',output],{encoding:'utf8'});
assert(rendered.status === 0,'真实浏览器必须在离线及握手超时时渲染完整内容', rendered.stdout+rendered.stderr);
assert(/id="reload"/.test(liveHtml),'刷新出口必须常驻');
const secondLive = jsonOutput(runNode(join(root, 'scripts/start-storyline-review.mjs'), [
  '--architecture', architecturePath, '--assets', manifestPath,
  '--review-dir', join(temp, 'live'), '--port', '0', '--no-open',
]));
assert(secondLive.url === live.url && secondLive.reused === true,
  '还活着的宿主必须被复用（判死活归模组：pid + 页面回 200 + 注入点以外逐字节相同 + watch 文件对得上）');
const secondSaved = await submitToHost(secondLive, {
  contract_version: '1.1.0', review_kind: reviewData.reviewKind, source_sha256: reviewData.sourceSha256,
  saved_at: new Date().toISOString(), overall_decision: 'approve', overall_feedback_zh: '第二轮通过',
  decisions: [{ page_number: 1, decision: 'approve', feedback_zh: '', attachments: [], asset_decisions: [
    { asset_id: 'asset-one', status: 'selected' }, { asset_id: 'asset-two', status: 'backup' },
  ] }],
});
assert(secondSaved, '第二轮 Storyline Review 必须可保存');
readInbox(secondLive);
const historyFiles = roundsIn(secondLive);
assert(historyFiles.length === 2 && historyFiles.includes('round-01.json') && historyFiles.includes('round-02.json'),
  '审阅反馈必须按轮次留档，不得覆盖前一轮');

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
const bypageAudit = writeAuditFixture(temp, bypage);
runNode(join(root, 'scripts/build-bypage-review.mjs'), ['--copy', bypage, '--audit', bypageAudit, '--output', join(bypageDir, 'index.html'), '--assets', manifestPath, '--kind', 'final']);
const bypageHtml = readFileSync(join(bypageDir, 'index.html'), 'utf8');
assert(bypageHtml.includes('完整 By-page 图文审阅') && bypageHtml.includes('assets/page.png') && existsSync(join(bypageDir, 'assets/page.png')), 'By-page Review 必须渲染并本地化图片');
const bypageLive = jsonOutput(runNode(join(root, 'scripts/start-bypage-review.mjs'), [
  '--copy', bypage, '--audit', bypageAudit, '--assets', manifestPath, '--review-dir', join(temp, 'bypage-live'), '--kind', 'final', '--port', '0', '--no-open',
]));
const bypageLiveHtml = await (await fetch(bypageLive.url)).text();
assert(/id="reload"/.test(bypageLiveHtml), 'R11：逐页面 serve 出去的页面上也有永久刷新出口');
const bypageData = JSON.parse(bypageLiveHtml.match(/<script id="reviewData" type="application\/json">([\s\S]*?)<\/script>/)?.[1] || '{}');
const bypageSaved = await submitToHost(bypageLive, {
  contract_version: '1.1.0', review_kind: 'bypage', source_sha256: bypageData.sourceSha256,
  saved_at: new Date().toISOString(), overall_decision: 'approve', overall_feedback_zh: '',
  decisions: [{ page_number: 1, decision: 'approve', feedback_zh: '', attachments: [] }],
});
assert(bypageSaved, '真实审阅宿主必须保存反馈');
const bypageReceipt = readInbox(bypageLive);
assert(bypageReceipt.units && bypageReceipt.units.label === '页' && bypageReceipt.next_action_zh.includes('核查与完整图文审阅'),
  '逐页面的收件收据指它自己的下一步（下一步按面给）', bypageReceipt.next_action_zh);
assert(bypageReceipt.ok && bypageReceipt.imported.pages === 1, '收件必须把提交翻译成原生记录');
assert(jsonOutput(runNode(join(root, 'scripts/validate-review-feedback.mjs'), [
  '--feedback', bypageLive.feedback_path, '--copy', bypage, '--audit', bypageAudit, '--kind', 'final',
])).valid, 'By-page 反馈必须绑定当前文案');
// 收件幂等：同一份提交再收一次是空操作，不新增轮次
const again = readInbox(bypageLive);
assert(again.skipped && roundsIn(bypageLive).length === 1, '同一份提交收两次不许长出第二轮（幂等靠内容哈希）');
pass('两套 Review 的图片展示与折叠候选');

/* ------------------------------------------------------------------ *
 * 回归：重出审阅页不许把人的「需要修改」重置成默认通过（R7）
 *
 * 旧行为：页面把**所有非事实例外的页**预设成 approve，重出一版之后
 * 人标过「需要修改」的那页又变成「通过」—— 人没做任何决定，文件里却写着他通过了。
 * 新行为：上一轮被判 revise 的页在下一轮**没有默认值**，必须由人重新明确选择。
 * 本块的每一条断言在旧代码上都必须失败。
 * ------------------------------------------------------------------ */
const recheckDraft = join(temp, 'recheck.md');
const pageBlock = (number, title, claim) => `---
contract_version: 1.0.0
page_number: ${number}
section_id: sec-recheck
page_type: explanation
page_title: "${title}"
main_message: "${claim}"
---

## Page Content

第 ${number} 页正文。

## Speaker Notes

无。

## Production Notes

无。

## Sources

- src-doc
`;
writeFileSync(recheckDraft, [pageBlock(1, '第一页', '第一页主张'), pageBlock(2, '第二页', '第二页主张')].join('\n'));
const recheckDir = join(temp, 'recheck-live');
const readServed = async (live) => {
  const served = await (await fetch(live.url)).text();
  return { html: served, data: JSON.parse(served.match(/<script id="reviewData" type="application\/json">([\s\S]*?)<\/script>/)?.[1] || '{}') };
};
const startRecheck = () => jsonOutput(runNode(join(root, 'scripts/start-bypage-review.mjs'), [
  '--copy', recheckDraft, '--audit', writeAuditFixture(temp, recheckDraft), '--assets', manifestPath, '--review-dir', recheckDir, '--kind', 'final', '--port', '0', '--no-open',
]));

const liveRound1 = await startRecheck();
const round1 = await readServed(liveRound1);
const round1Saved = await submitToHost(liveRound1, {
  contract_version: '1.1.0', review_kind: 'bypage', source_sha256: round1.data.sourceSha256,
  saved_at: new Date().toISOString(), overall_decision: 'revise', overall_feedback_zh: '',
  decisions: [
    { page_number: 1, decision: 'revise', feedback_zh: '第一页的结论下得太满。', attachments: [] },
    { page_number: 2, decision: 'approve', feedback_zh: '', attachments: [] },
  ],
});
assert(round1Saved && readInbox(liveRound1).ok, '第一轮必须能保存「第 1 页需要修改」');

const liveRound2 = await startRecheck();
const round2 = await readServed(liveRound2);
// ★ 核心断言：旧代码在这一条上红（那一页会带着默认 approve 回来）
assert(round2.data.pages.find(page => page.page_number === 1).requires_recheck === true
  && round2.data.pages.find(page => page.page_number === 1).default_decision === null,
  '上一轮被判「需要修改」的页，本轮不许带默认通过（否则就是伪造人的决定）');
assert(round2.data.pages.find(page => page.page_number === 2).default_decision === 'approve',
  '上一轮通过、本轮没人碰的页仍按默认通过 —— 修正不许把整页集都变成必须人选');
// 字段名 guard：产出方写 camelCase、页面读 snake_case 时，"每一页都变成必须人选"会静默发生
assert(round2.data.pages.every(page => 'default_decision' in page),
  '每一页都必须显式给出 default_decision（字段名与页面读的那个字必须一致）');
assert(round1.data.pages.every(page => page.default_decision === 'approve'),
  '第一轮：非事实例外页一律默认通过（本 Skill 原有语义，不许变）');
assert(round2.html.includes('p.default_decision'),
  '页面必须真的读 default_decision（产出方给的数据不许被页面忽略）');
// 人「只写了句整体意见、没碰第 1 页」时页面会送出的那份 payload ＝ 能覆盖到默认值的页。
// 提交给**第 2 轮那个还活着的宿主**，再拿 Validator 判它 —— 旧代码在这条上给的是"全通过"的合法记录。
const overallOnly = round2.data.pages.filter(page => page.default_decision)
  .map(page => ({ page_number: page.page_number, decision: page.default_decision, feedback_zh: '', attachments: [] }));
assert(overallOnly.length === 1 && overallOnly[0].page_number === 2, '只有第 2 页能进"只写整体意见"的 payload');
assert(await submitToHost(liveRound2, {
  contract_version: '1.1.0', review_kind: 'bypage', source_sha256: round2.data.sourceSha256,
  saved_at: new Date().toISOString(), overall_decision: 'approve', overall_feedback_zh: '整体没问题。', decisions: overallOnly,
}) && readInbox(liveRound2).ok, '审阅宿主原样落盘（它不解释形状）');
assert(jsonOutput(runNode(join(root, 'scripts/validate-review-feedback.mjs'), [
  '--feedback', join(recheckDir, 'review-feedback.json'), '--copy', recheckDraft, '--audit', `${recheckDraft}.fact-audit.json`, '--kind', 'final',
], { allowFailure: true })).valid === false,
  '兜底：漏掉"上一轮要求修改"那页的提交必须被 Validator 拦下，不许变成一份"全通过"的记录');

// 第二处同类坑：逐张图片的决定不许被生成器的候选分组覆盖（storyline 面）
const storyDir = join(temp, 'story-recheck');
const liveStory1 = jsonOutput(runNode(join(root, 'scripts/start-storyline-review.mjs'), [
  '--architecture', architecturePath, '--assets', manifestPath, '--review-dir', storyDir, '--port', '0', '--no-open',
]));
const storyRound1 = await readServed(liveStory1);
assert(await submitToHost(liveStory1, {
  contract_version: '1.1.0', review_kind: 'storyline', source_sha256: storyRound1.data.sourceSha256,
  saved_at: new Date().toISOString(), overall_decision: 'revise', overall_feedback_zh: '',
  decisions: [{
    page_number: 1, decision: 'revise', feedback_zh: '备选那张与主题不符，排除。', attachments: [],
    asset_decisions: [{ asset_id: 'asset-one', status: 'selected' }, { asset_id: 'asset-two', status: 'excluded' }],
  }],
}) && readInbox(liveStory1).ok, '第一轮必须能保存"第 1 页 + 逐张图片决定"');
const storyRound2 = await readServed(jsonOutput(runNode(join(root, 'scripts/start-storyline-review.mjs'), [
  '--architecture', architecturePath, '--assets', manifestPath, '--review-dir', storyDir, '--port', '0', '--no-open',
])));
const seeded = storyRound2.data.pages[0].seeded_asset_decisions || [];
assert(seeded.some(entry => entry.asset_id === 'asset-two' && entry.status === 'excluded' && entry.from_prior_round === true),
  '人上一轮选的图片状态（排除）必须被带回本轮，不许被生成器的候选分组（backup）覆盖');
assert(storyRound2.data.pages[0].default_decision === null,
  '上一轮要求修改的页在图片决定带回来之后，仍然必须由人重新明确选择');
assert(storyRound2.html.includes('asset_decisions'),
  '反馈文件里 asset_decisions 的形状必须与原来一致（只写 asset_id 与 status）');
pass('重出审阅页不许重置人的决定（逐页决定 + 逐张图片）');

/* ------------------------------------------------------------------ *
 * 缝自己的两条钉子（用户 2026-09-26 点名要的）
 * ------------------------------------------------------------------ */
// ① `--surface-only` 只写面 + 校验：**一次 start 调用都不许发生**。
//    起过宿主一定会留下 review_host.json（状态）与 review_host.log（自证），所以这两个文件
//    加上"输出里没有 url"，就是外面能观察到的最强形式。
const quietDir = join(temp, 'quiet');
const quiet = jsonOutput(runNode(join(root, 'scripts/start-bypage-review.mjs'), [
  '--copy', bypage, '--audit', bypageAudit, '--assets', manifestPath, '--review-dir', quietDir, '--kind', 'final', '--surface-only',
]));
assert(quiet.status === 'surface_ready' && quiet.host_started === false && !quiet.url,
  '--surface-only 必须只报 surface 的绝对路径（不起宿主、不开浏览器）');
assert(!existsSync(join(quietDir, 'review_host.json')) && !existsSync(join(quietDir, 'review_host.log')),
  '--surface-only 一次 start 都不许发生：起了宿主就一定留下 review_host.json / review_host.log');
assert(!(await hostAlive(quiet.surface)), '--surface-only 之后这个面上不该有活着的宿主');
assert(quiet.validator && /0 个警告/.test(quiet.validator), 'surface 必须过唯一校验器且 0 警告');
// R5b：页面知道、但机器看不见的前提要进数据；而原生反馈文件的形状一个字段都不许变。
const servedPage = await (await fetch(live.url)).text();
assert(servedPage.includes('pre_check') && servedPage.includes('pre_check_note'),
  '页面必须把"没做版本核对"这个前提写进提交（不能只在状态行里说给人听）');
// 页面会送出的形状（在测试里手工造一份同样的）→ 收件必须把它带给模型，同时把原生形状摘干净
assert(await submitToHost(live, {
  pre_check: false, pre_check_note: '页面未做版本核对（当前稿在审阅目录之外）。',
  contract_version: '1.1.0', review_kind: 'storyline', source_sha256: reviewData.sourceSha256,
  saved_at: new Date().toISOString(), overall_decision: 'approve', overall_feedback_zh: '',
  decisions: [{ page_number: 1, decision: 'approve', feedback_zh: '', attachments: [], asset_decisions: [
    { asset_id: 'asset-one', status: 'selected' }, { asset_id: 'asset-two', status: 'backup' }] }],
}), '带前提的提交必须能落盘');
const r5bReceipt = readInbox(live);
assert(r5bReceipt.pre_check === false && r5bReceipt.pre_check_note,
  '收据必须把这条前提带给模型（谁读了收据谁就知道：没有经过版本核对）');
assert(!readFileSync(live.feedback_path, 'utf8').includes('pre_check'),
  '收件层必须把提交层的字段摘掉：原生反馈文件的形状一个字段都不许跟着变');

// R10：粒度由产出方定 —— 页面必须允许"不针对任何一页、只说一句整体意见"
assert((await (await fetch(live.url)).text()).includes('overall_feedback_zh')
  && (await (await fetch(live.url)).text()).includes('整体意见'),
  '页面必须保留"只说一句整体意见"那条入口（不是只有逐页）');

// ② 独立路径起→停之后：不留进程、不留端口。
const stopTargets = [live.surface, bypageLive.surface, liveRound1.surface, liveStory1.surface, quiet.surface];
const stoppedPids = [live.pid, bypageLive.pid, liveRound1.pid, liveStory1.pid].filter(Boolean);
const left = await stopAll(stopTargets);
assert(left.length === 0, '停完之后不许还认得出活着的宿主：' + JSON.stringify(left));
for (const pid of stoppedPids) {
  let alive = true;
  try { process.kill(pid, 0); } catch { alive = false; }
  assert(!alive, '停完之后进程必须没了（pid ' + pid + ' 还在）');
}
for (const url of [live.url, bypageLive.url, liveRound1.url, liveStory1.url]) {
  let served = false;
  try { await fetch(url, { signal: AbortSignal.timeout(1500) }); served = true; } catch { /* 连接被拒 = 端口也放掉了 */ }
  assert(!served, '停完之后端口不该还在应答：' + url);
}
pass('缝上的两条钉子：--surface-only 不起宿主；起→停不收干净不算过');
// ③ 页面必须能"**没有桥也把自己画出来**"：渲染不许排在 await 之后，握手必须有上限，
//    连不上要在页面上说出来。（旧写法是把 render() 挂在 ReviewBridge.connect() 后面 ——
//    握手不落地时整页只剩静态骨架、零报错。浏览器里的原始证据见
//    .scratch/video-idea-seam/tools/plugin_handshake_harness.py 的 init / no-init 两种模式。）
const pageSource = readFileSync(moduleScript('planners-review-core','assets/content-review/interactions.js'), 'utf8');
const bootBlock = pageSource.slice(pageSource.indexOf('async function boot()'));
assert(bootBlock.indexOf('setMode(') < bootBlock.indexOf('await'),
  '渲染必须排在第一个 await 之前（桥是增强，不是氧气）');
assert(/Promise.race/.test(pageSource) && /2500/.test(pageSource),
  '握手必须有超时上限：不落地就按"没有桥"降级继续画');
assert(/暂时无法保存/.test(pageSource), '连不上宿主时页面要**说出来**（只读），不能零报错地空着');
assert(!/(^|[^.\w])localStorage\s*\./.test(pageSource.replace(/window\.localStorage/g, '')),
  '页面不许裸用 localStorage（不透明源 iframe 里读它会直接抛 → 整页脚本当场死）');
pass('页面在没有桥/握手不落地时也把自己画出来，并说出来');
