import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assert, jsonOutput, pass, runNode } from '../lib/assert.mjs';
import { moduleScript } from '../../scripts/lib/planners-modules.mjs';

// 宿主生命周期只有一份（公共模组的 Node CLI）——测试 import 它来收干净，不重写判据。
const { hostAlive, hostState, stopHost } = await import(moduleScript('planners-review-core', 'scripts/review-host.mjs'));

const root = resolve(import.meta.dirname, '../..');
const temp = mkdtempSync(join(tmpdir(), 'planners-bypage-assets-'));
mkdirSync(join(temp, 'review/uploads/page-01'), { recursive: true });
const data = Buffer.from('uploaded-image');
writeFileSync(join(temp, 'review/uploads/page-01/upload.png'), data);
const feedback = join(temp, 'review/review-feedback.json');
writeFileSync(feedback, JSON.stringify({ decisions: [{ page_number: 1, attachments: [{ path: 'uploads/page-01/upload.png', alt: '新图', caption: '用户补图' }] }] }, null, 2));
const manifest = join(temp, 'asset-manifest.json');
writeFileSync(manifest, JSON.stringify({ contract_version: 'asset-manifest/1.1.0', asset_root: 'assets', assets: [] }, null, 2));
runNode(join(root, 'scripts/import-review-assets.mjs'), ['--feedback', feedback, '--manifest', manifest, '--source-id', 'src-user']);
const updated = JSON.parse(readFileSync(manifest, 'utf8'));
assert(updated.assets.length === 1 && updated.assets[0].status === 'selected', '审阅上传必须正式进入 Asset Manifest');
assert(updated.assets[0].source_sha256 === createHash('sha256').update(data).digest('hex'), '导入资产必须记录真实 Hash');
assert(updated.assets[0].visual_check.status === 'passed', '用户上传图片必须记录视觉确认状态');
assert(jsonOutput(runNode(join(root, 'scripts/validate-asset-manifest.mjs'), [manifest])).valid, '导入后的 Manifest 必须通过复算');

/* ------------------------------------------------------------------ *
 * 回归：上传的图必须能被**文档里那条命令**收回去。
 *
 * stages/07 的推荐命令带 `--final-md`。旧代码在这个开关下把上传返回的
 * `markdown_path` 算成**相对 deliverable 目录**，页面把它写进 `attachments[].path`，
 * 而收件方（import-review-assets）是**相对 feedback 文件所在目录**解析 —— 两边不一致，
 * 于是"上传替换图 → 跑收件"这条路在带 --final-md 时必然失败（"审阅上传文件不存在"）。
 * 本块走真服务、真上传，用**页面真正写下的那两个字段**去收件。
 * ------------------------------------------------------------------ */
const liveDir = join(temp, 'live-reviews', 'bypage');
mkdirSync(join(temp, 'deliverable'), { recursive: true });
const liveDraft = join(temp, 'live-draft.md');
writeFileSync(liveDraft, `---
contract_version: 1.0.0
page_number: 1
section_id: sec-x
page_type: explanation
page_title: "上传回归"
main_message: "上传的图必须能被收件"
---

## Page Content

正文。

## Speaker Notes

无。

## Production Notes

无。

## Sources

- src-live
`);
const liveManifest = join(temp, 'live-asset-manifest.json');
writeFileSync(liveManifest, JSON.stringify({ contract_version: 'asset-manifest/1.1.0', asset_root: 'assets', assets: [] }, null, 2));
const live = jsonOutput(runNode(join(root, 'scripts/start-bypage-review.mjs'), [
  '--copy', liveDraft, '--assets', liveManifest, '--review-dir', liveDir,
  '--final-md', join(temp, 'deliverable', 'by-page.md'), '--kind', 'final', '--port', '0', '--no-open',
]));
// 上传走宿主声明的那条能力（surface 里的 capabilities: ['asset-upload']）：
// 字节原样递进去，落盘位置相对 `dir`（＝审阅目录）。
const uploaded = await (await fetch(new URL('__review/upload?rel=' + encodeURIComponent('uploads/page-01/new.png'), live.url), {
  method: 'POST', body: data,
})).json();
assert(uploaded.ok && uploaded.path && uploaded.path.endsWith('uploads/page-01/new.png') && uploaded.sha256,
  '上传必须落在审阅目录里并回报真实哈希');
const rel = 'uploads/page-01/new.png';
assert(readFileSync(join(liveDir, 'index.html'), 'utf8').includes('{path:rel,url:rel,'),
  '页面必须把同一个相对基准的路径写进 attachments 的 path 与 url');
// 页面真正会写下的那两个字段（相对审阅目录）→ 收件 → 进清单
const liveSubmissions = join(liveDir, 'review-submissions.json');
writeFileSync(liveSubmissions, JSON.stringify({
  contract_version: '1.1.0', review_kind: 'bypage', source_sha256: 'a'.repeat(64),
  saved_at: new Date().toISOString(), overall_decision: 'revise', overall_feedback_zh: '',
  decisions: [{ page_number: 1, decision: 'revise', feedback_zh: '', attachments: [{ path: rel, url: rel, alt: 'new', caption: '' }] }],
}, null, 2));
runNode(join(root, 'scripts/review-inbox.mjs'), ['--surface', live.surface]);
const liveFeedback = join(liveDir, 'review-feedback.json');
assert(existsSync(liveFeedback), '收件必须先把提交翻译成原生记录，上传图才有人认');
runNode(join(root, 'scripts/import-review-assets.mjs'), ['--feedback', liveFeedback, '--manifest', liveManifest, '--source-id', 'src-user']);
assert(JSON.parse(readFileSync(liveManifest, 'utf8')).assets.length === 1,
  '上传的替换图必须能收进 Asset Manifest（同一条命令，端到端）');
// 起过的宿主必须收干净：不留进程、不留端口（判据归模组）
await stopHost(hostState(live.surface));
assert(!(await hostAlive(live.surface)), '这个测试起过的宿主必须停干净');
let stillServing = false;
try { await fetch(live.url, { signal: AbortSignal.timeout(1500) }); stillServing = true; } catch { /* 连接被拒 = 端口也放掉了 */ }
assert(!stillServing, '停完之后端口不该还在应答：' + live.url);
pass('审阅上传回写唯一资产清单');
