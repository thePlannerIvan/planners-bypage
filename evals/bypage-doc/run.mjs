#!/usr/bin/env node
/**
 * By-page 文档（planners-doc/2）的纵向切片：
 *   · 模板与真实样例（含图、含表、含出处）通过 Bypage 校验；
 *   · 校验在公共 validate-doc.mjs 之上，只加 Bypage 三段规则、页末出处与图片登记；
 *   · 删正文 / 删页末出处 必须被拒，出处不在页末要报警；
 *   · 从 Storyline 文档交接过来，页、主张与来源不丢；
 *   · 工作台按块读出并改通，块级反馈能在含图、含表、含出处的页上派发。
 *
 * 文档用例按 planners-doc/2 写，必须解析到同样含 /2 与 scripts/migrate-doc.mjs 的
 * planners-review-core。库里 vendored 的 `00-system/planners-review-core` 在 PR 合并、
 * 正式发布那一步才同步成 /2，所以在那之前 plain `npm test` 会红。两种写法都可以：
 *
 *   PLANNERS_MODULES_HOME=<含 planners-review-core/ 的目录> npm test
 *   PLANNERS_REVIEW_CORE_HOME=<planners-review-core 检出目录> npm test
 *
 * 后者只被本套与其余文档用例翻译成 PLANNERS_MODULES_HOME；正式环境不需要它们。
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { assert, jsonOutput, pass } from '../lib/assert.mjs';
import { moduleScript } from '../../scripts/lib/planners-modules.mjs';

const localCore = process.env.PLANNERS_REVIEW_CORE_HOME;
if (localCore) {
  const modulesHome = mkdtempSync(join(tmpdir(), 'bypage-doc-modules-'));
  symlinkSync(resolve(localCore), join(modulesHome, 'planners-review-core'), 'dir');
  process.env.PLANNERS_MODULES_HOME = modulesHome;
  process.env.PLANNERS_NO_AUTO_INSTALL = '1';
}

const root = resolve(import.meta.dirname, '../..');
const fixtures = join(root, 'evals', 'fixtures');
const validator = join(root, 'scripts', 'validate-bypage-doc.mjs');
const template = join(root, 'templates', 'by-page.md');
const sample = join(fixtures, 'labbrand-by-page.md');
const storyline = join(fixtures, 'labbrand-storyline.md');

function coreScript(relPath) {
  try {
    return moduleScript('planners-review-core', relPath);
  } catch (error) {
    throw new Error('本测试依赖含 planners-doc/2 的 planners-review-core；'
      + '设 PLANNERS_REVIEW_CORE_HOME=<检出目录> 再跑。\n' + error.message);
  }
}
coreScript('scripts/validate-doc.mjs');

function validate(file, args = [], status = 0) {
  const result = spawnSync(process.execPath, [validator, file, ...args], { encoding: 'utf8', env: process.env });
  assert(result.status === status,
    `validate-bypage-doc 退出码应为 ${status}，实际 ${result.status}\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(result.stdout);
}
const codes = (receipt) => (receipt.errors || []).map((error) => error.code);
const temp = mkdtempSync(join(tmpdir(), 'bypage-doc-'));

/** 某一页的切片：[start, end)，end 落在下一个同级结构标题之前的空行。 */
function pageRange(text, pageTitle, nextMarker) {
  const start = text.indexOf(`## ${pageTitle}`);
  assert(start >= 0, `样例里找不到页「${pageTitle}」`);
  const index = text.slice(start + 1).search(nextMarker);
  const end = index === -1 ? text.length : start + 1 + index;
  return { start, end, page: text.slice(start, end) };
}

/** 把某一页的某一段（`###` 标题块到下一个 `###` 或页末）换成 change 的结果。 */
function mapPageSection(text, pageTitle, sectionTitle, change) {
  const { start, end, page } = pageRange(text, pageTitle, /\n## /);
  const sectionStart = page.indexOf(`### ${sectionTitle}`);
  assert(sectionStart >= 0, `页「${pageTitle}」里找不到「${sectionTitle}」段`);
  const next = page.indexOf('\n### ', sectionStart + 4);
  const pageEnd = next === -1 ? page.length : next;
  const section = page.slice(sectionStart, pageEnd);
  return text.slice(0, start) + page.slice(0, sectionStart) + change(section) + page.slice(pageEnd) + text.slice(end);
}

/** 把某一页的页末出处（末尾连续的 `>` 引用）整段换成 change 的结果。 */
function mapPageSources(text, pageTitle, change) {
  const { start, end, page } = pageRange(text, pageTitle, /\n#{1,2} /);
  const lines = page.split('\n');
  let lastContent = lines.length;
  while (lastContent > 0 && lines[lastContent - 1].trim() === '') lastContent -= 1;
  // 从页末往上走：跳过引用与引用之间的空行，撞到正文就是这串出处的起点。
  let firstQuote = -1;
  for (let index = lastContent - 1; index >= 0; index -= 1) {
    if (lines[index].startsWith('> ')) { firstQuote = index; continue; }
    if (lines[index].trim() === '') continue;
    break;
  }
  assert(firstQuote >= 0 && lines.slice(firstQuote, lastContent).every((line) => line.trim() === '' || line.startsWith('>')),
    `页「${pageTitle}」的页末没有连续的引用`);
  const head = lines.slice(0, firstQuote).join('\n');
  const body = lines.slice(firstQuote, lastContent).join('\n');
  const trailing = lines.slice(lastContent).join('\n');
  return text.slice(0, start) + `${head}${change(body)}${trailing}` + text.slice(end);
}
const sampleText = readFileSync(sample, 'utf8');

// 1. 模板：契约头 + `#` 章节 / `##` 页 / 三段标题块 + 页末出处；不手写锚点。
const templateReceipt = validate(template);
assert(templateReceipt.contract === 'planners-doc/2' && templateReceipt.valid === true,
  'By-page 模板必须通过 Bypage 校验', JSON.stringify(templateReceipt.errors));
assert(templateReceipt.checked.doc === 'by-page' && templateReceipt.checked.project,
  '模板文档头要有 doc: by-page 与 project');
assert(templateReceipt.checked.pages >= 2, '模板至少展示两页');
assert(templateReceipt.checked.pages_with_sections === templateReceipt.checked.pages,
  '模板每页都要有三段');
assert(templateReceipt.checked.source_blocks >= templateReceipt.checked.pages,
  '模板每页都要有页末出处', JSON.stringify(templateReceipt.checked));

// 2. 真实样例：4 页，含图、含表、含页末出处；公共结构校验零错误。
const sampleReceipt = validate(sample);
assert(sampleReceipt.valid === true, '真实样例必须通过 Bypage 校验', JSON.stringify(sampleReceipt.errors));
assert(sampleReceipt.checked.chapters === 4, '样例是 4 章', JSON.stringify(sampleReceipt.checked));
assert(sampleReceipt.checked.pages === 4, '样例是 4 页', JSON.stringify(sampleReceipt.checked));
assert(sampleReceipt.checked.pages_with_sections === 4, '四页都要有三段');
assert(sampleReceipt.checked.images === 2, '样例要读出 2 处图片引用', JSON.stringify(sampleReceipt.checked));
assert(sampleReceipt.checked.source_blocks >= 4, '每页页末都要有出处', JSON.stringify(sampleReceipt.checked));
assert(!/^#### /m.test(sampleText), '从 /2 起 ## 是页、页内标题块从 ### 开始，样例不再有 #### 结构');
assert(sampleText.includes('| 使用场景 | 替代对象 |'), '样例要含表格');
assert(sampleText.includes('![下午三点与睡前两个状态切换时点](assets/circadian-moments.svg)'), '样例要含真实图片引用');
assert(!/【核查|\[核查|〔待核〕|<!--\s*fact/.test(sampleText), '正文不放核查角标');

// 3. 删掉某页正文：被拒，错误点名到页。
const noBody = join(temp, 'by-page-no-body.md');
writeFileSync(noBody, mapPageSection(sampleText, '用工程链把「有效」做成可交付', '正文',
  (section) => `${section.split('\n')[0]}\n`));
const noBodyReceipt = validate(noBody, [], 1);
const bodyError = noBodyReceipt.errors.find((error) => error.code === 'page_body_empty');
assert(bodyError && bodyError.page.includes('用工程链把「有效」做成可交付'),
  '删掉整页正文必须报 page_body_empty 并点名页', JSON.stringify(noBodyReceipt.errors));

// 4. 删掉某页页末的出处：被拒（来源必须随文档交付）。
const noSources = join(temp, 'by-page-no-sources.md');
writeFileSync(noSources, mapPageSources(sampleText, '新品类叫「植物节律液」，卖的是状态切换', () => ''));
const noSourcesReceipt = validate(noSources, [], 1);
const sourcesError = noSourcesReceipt.errors.find((error) => error.code === 'page_sources_empty');
assert(sourcesError && sourcesError.page.includes('新品类叫「植物节律液」'),
  '删掉页末出处必须被拒并点名页', JSON.stringify(noSourcesReceipt.errors));

// 4b. 出处还在、但不在页末：位置就是语义，页中引用不算出处。
const strayTarget = '微季候 / MIKORA：与节气同频的掌心微节律';
let strayQuotes = '';
const strayDoc = mapPageSources(sampleText, strayTarget, (section) => { strayQuotes = section; return ''; });
const straySources = join(temp, 'by-page-stray-sources.md');
writeFileSync(straySources, strayDoc.replace(`## ${strayTarget}\n`, `## ${strayTarget}\n\n${strayQuotes}\n`));
const strayReceipt = validate(straySources, [], 1);
assert(strayReceipt.errors.some((error) => error.code === 'page_sources_empty'),
  '出处不在页末时必须报出「没有出处」', JSON.stringify(strayReceipt.errors));
assert(strayReceipt.warnings.some((warning) => warning.code === 'page_sources_not_at_end'),
  '出处不在页末时要点明位置规则', JSON.stringify(strayReceipt.warnings));

// 4c. 照旧写 `### Sources` 标题块：被拒，并指向页末引用。
const sourcesHeading = join(temp, 'by-page-sources-heading.md');
writeFileSync(sourcesHeading, mapPageSources(sampleText, '把下午三点和睡前那一刻的状态调回来',
  (section) => `### Sources\n${section}`));
const sourcesHeadingReceipt = validate(sourcesHeading, [], 1);
assert(sourcesHeadingReceipt.errors.some((error) => error.code === 'page_section_unknown' && /页末连续的引用/.test(error.message)),
  '### Sources 不再是合法小节，必须指向页末引用', JSON.stringify(sourcesHeadingReceipt.errors));

// 5. 三段顺序被破坏：被拒。
const reordered = join(temp, 'by-page-reordered.md');
const swapped = mapPageSection(sampleText, '把下午三点和睡前那一刻的状态调回来', '口播',
  (section) => section.replace('### 口播', '### 制作'));
writeFileSync(reordered, swapped);
const reorderedReceipt = validate(reordered, [], 1);
assert(reorderedReceipt.errors.some((error) => ['page_section_order', 'page_section_duplicate'].includes(error.code)),
  '三段顺序被破坏必须被拒', JSON.stringify(reorderedReceipt.errors));

// 6. 图片文件在、但没登记：被拒（图块走 doc-assets/1）。
const unregisteredDir = join(temp, 'unregistered');
mkdirSync(unregisteredDir, { recursive: true });
writeFileSync(join(unregisteredDir, 'by-page.md'), sampleText);
cpSync(join(fixtures, 'assets'), join(unregisteredDir, 'assets'), { recursive: true });
writeFileSync(join(unregisteredDir, 'by-page.assets.json'), JSON.stringify({ contract: 'doc-assets/1', doc: 'by-page.md', assets: [] }));
const unregistered = validate(join(unregisteredDir, 'by-page.md'), [], 1);
assert(codes(unregistered).includes('asset_unregistered'),
  '图片没登记进 doc-assets 清单必须被拒', JSON.stringify(unregistered.errors));

// 7. 图片文件不存在：被拒（公共校验器的 image_missing 原样合并）。
const missingDir = join(temp, 'missing-image');
mkdirSync(missingDir, { recursive: true });
writeFileSync(join(missingDir, 'by-page.md'), sampleText);
const missing = validate(join(missingDir, 'by-page.md'), [], 1);
assert(codes(missing).includes('image_missing'),
  '图片文件不存在必须被拒', JSON.stringify(missing.errors));

// 8. 拿 storyline 文档当 by-page 交：被拒。
const wrongKind = validate(storyline, [], 1);
assert(codes(wrongKind).includes('doc_kind'), 'storyline 文档不能按 by-page 校验', JSON.stringify(wrongKind.errors));

// 9. 从 Storyline 文档交接：页、主张、章节与来源原样带到 By-page，不再经过旧 JSON。
const importer = join(root, 'scripts', 'import-storyline-doc.mjs');
const projectDir = join(temp, 'project');
mkdirSync(join(projectDir, '.planners'), { recursive: true });
const importedPath = join(projectDir, '.planners', 'by-page.md');
const imported = jsonOutput(spawnSync(process.execPath, [
  importer, '--storyline', storyline, '--output', importedPath,
], { encoding: 'utf8', env: process.env }));
assert(imported.valid === true, 'Storyline 交接必须成功', JSON.stringify(imported));
assert(imported.pages === 10 && imported.mapping.length === 10, '样例主线 10 页要 1:1 落到 By-page', JSON.stringify(imported));
assert(imported.claims === 10 && imported.pages_with_sources === 10, '每页的主张与来源都要带过来', JSON.stringify(imported));
const importedText = readFileSync(importedPath, 'utf8');
assert(/^---\ncontract: planners-doc\/2\ndoc: by-page\nproject: 朗标笔试案\n---/m.test(importedText),
  '交接产物必须是 planners-doc/2 的 by-page 文档');
assert(!/^# 朗标笔试案/m.test(importedText), '文档名只在文档头的 project 里，正文第一条结构是 # 章节');
for (const page of imported.mapping) {
  assert(page.by_page.title === page.storyline.title && page.by_page.chapter === page.storyline.chapter,
    `页身份必须按章节+顺序+标题对应：${JSON.stringify(page)}`);
  assert(importedText.includes(`## ${page.by_page.title}`), '每页标题必须落到文档里');
  assert(importedText.includes(page.claim), `主张必须原样保留：${page.claim}`);
}
const importedReceipt = validate(importedPath);
assert(importedReceipt.valid === true, '交接产物必须直接通过 Bypage 校验', JSON.stringify(importedReceipt.errors));
assert(importedReceipt.checked.pages === 10 && importedReceipt.checked.pages_with_sections === 10,
  '交接产物每页三段齐全', JSON.stringify(importedReceipt.checked));
assert(importedText.includes('> 笔试任务书：'), '主线的页末出处要随文档带过来，仍是引用');
const overwrite = spawnSync(process.execPath, [importer, '--storyline', storyline, '--output', importedPath], { encoding: 'utf8', env: process.env });
assert(overwrite.status !== 0 && /已存在|保留|覆盖/.test(overwrite.stderr + overwrite.stdout), '已有逐页稿不许被交接覆盖');
const notStoryline = spawnSync(process.execPath, [importer, '--storyline', sample, '--output', join(temp, 'wrong.md')], { encoding: 'utf8', env: process.env });
assert(notStoryline.status !== 0, 'Storyline 交接只接收 doc: storyline 的文档');

// 10. 工作台：按块读出三段与页末出处，含图 / 含表 / 含出处页可改、可派发块级反馈。
const { startDocWorkbench } = await import(pathToFileURL(coreScript('scripts/doc-workbench.mjs')));
const workDir = join(temp, 'workbench');
mkdirSync(join(workDir, '.planners'), { recursive: true });
const docPath = join(workDir, '.planners', 'by-page.md');
writeFileSync(docPath, sampleText);
cpSync(join(fixtures, 'assets'), join(workDir, '.planners', 'assets'), { recursive: true });
const workbench = await startDocWorkbench({ docPath, port: 0 });
try {
  const home = await fetch(workbench.url);
  assert(home.ok && (await home.text()).includes('文字工作台'), '工作台页面必须能打开');
  const first = await (await fetch(`${workbench.url}/api/doc`)).json();
  assert(first.contract === 'planners-doc/2' && first.doc === 'by-page' && first.project === '朗标笔试案',
    '工作台要读出文档头三元组');
  assert(first.pages.length === 4, '工作台要按页读出 4 页', JSON.stringify(first.pages.length));
  assert(first.blocks.length >= 40, '工作台要按块读出三段与内容', JSON.stringify(first.blocks.length));
  assert(first.blocks.every((block) => block.anchor), '打开后每个块都要有锚点');
  assert(workbench.repairs.length > 0, '样例不手写锚点，工作台打开时补写');
  assert(first.assets.length === 1 && first.assets[0].anchors.length === 2,
    '图块按 doc-assets/1 登记，同一张图的两个引用都绑到锚点', JSON.stringify(first.assets));
  const workbenchText = readFileSync(docPath, 'utf8');
  assert(workbenchText.includes('<!-- b:'), '补写的锚点必须落盘');

  const pageOf = (snapshot, title) => snapshot.pages.find((page) => page.title === title);
  const blocksOf = (snapshot, page) => snapshot.blocks.filter((block) => block.page.key === page.key);
  const targetPage = pageOf(first, '新品类叫「植物节律液」，卖的是状态切换');
  const targetBlocks = blocksOf(first, targetPage);
  for (const section of ['正文', '口播', '制作']) {
    assert(targetBlocks.some((block) => block.type === 'heading' && block.raw.includes(`### ${section}`)),
      `工作台要按块读出「${section}」段`);
  }
  assert(!targetBlocks.some((block) => block.type === 'heading' && block.raw.includes('Sources')),
    '出处不再是标题块：页末引用就是出处区');
  assert(targetBlocks.some((block) => block.type === 'table'), '含表页要读出表格块');
  assert(targetBlocks.some((block) => block.type === 'image'), '含图页要读出图片块');
  assert(targetBlocks.some((block) => block.type === 'quote' && block.page.title === targetPage.title && block.raw.includes('替代品与场景')),
    '含出处页要读出来源引用块');

  // 真的改一块：只换这一块的 raw，落盘后仍是合规文档。
  const body = targetBlocks.find((block) => block.type === 'paragraph' && block.raw.startsWith('定义新品类'));
  assert(body, '含表页要能定位到正文段落');
  const editedBody = `${body.raw.trimEnd()}（工作台已改）`;
  const saved = await fetch(`${workbench.url}/api/block`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ anchor: body.anchor, content: editedBody, base_sha256: first.sha256, base_block_sha256: body.sha256 }),
  });
  assert(saved.ok, '工作台必须能按块保存这次修改', await saved.text());
  assert(readFileSync(docPath, 'utf8').includes('（工作台已改）'), '修改必须落盘');
  validate(docPath);

  // 块级反馈：同一页的正文、图片、表格、来源各绑一块提交，派发到本地收件箱。
  const second = await (await fetch(`${workbench.url}/api/doc`)).json();
  const feedbackPage = pageOf(second, '新品类叫「植物节律液」，卖的是状态切换');
  const pageBlocks = blocksOf(second, feedbackPage);
  const pick = (type, includes) => pageBlocks.find((block) => block.type === type && (!includes || block.raw.includes(includes)));
  const feedbackTargets = [
    pick('paragraph', '定义新品类'),
    pick('image', 'circadian-moments.svg'),
    pick('table', '使用场景'),
    pick('quote', '替代品与场景'),
  ].filter(Boolean);
  assert(feedbackTargets.length === 4, '含图、含表、含出处的页要能选中四类块', JSON.stringify(feedbackTargets.map((block) => block.type)));
  const feedback = await fetch(`${workbench.url}/api/feedback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      scope: 'blocks',
      text: '把这一页写紧一点；图、表、来源都保留，只改正文措辞。',
      anchors: feedbackTargets.map((block) => block.anchor),
    }),
  });
  const feedbackReceipt = await feedback.json();
  assert(feedback.ok && feedbackReceipt.task.scope === 'blocks', '块级反馈必须能提交', JSON.stringify(feedbackReceipt));
  assert(feedbackReceipt.task.blocks.length === 4, '任务要带四块的锚点与内容指纹', JSON.stringify(feedbackReceipt.task.blocks));
  assert(feedbackReceipt.task.doc.doc === 'by-page' && feedbackReceipt.task.doc.contract === 'planners-doc/2',
    '任务要说明它指向哪份 by-page 文档');
  assert(feedbackReceipt.dispatch.channel === 'inbox', '没有插件时派发进本地收件箱', JSON.stringify(feedbackReceipt.dispatch));
  const inbox = jsonOutput(spawnSync(process.execPath, [coreScript('scripts/doc-inbox.mjs'), 'list', docPath], { encoding: 'utf8', env: process.env }));
  assert(inbox.tasks.length === 1 && inbox.tasks[0].id === feedbackReceipt.task.id,
    '本地收件箱要能读回这条任务', JSON.stringify(inbox));
  const claim = await (await fetch(`${workbench.url}/api/task/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task_id: feedbackReceipt.task.id }),
  })).json();
  assert(claim.ok && claim.task.status === 'processing', '模型能按任务开始处理（锁块）', JSON.stringify(claim));
  const patched = await (await fetch(`${workbench.url}/api/patch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      task_id: feedbackReceipt.task.id,
      patches: [{ anchor: pick('paragraph', '定义新品类').anchor, content: `${editedBody}只改这一块。` }],
    }),
  })).json();
  assert(patched.ok && patched.applied.length === 1, '模型按块写回只应用指定的一块', JSON.stringify(patched));
  assert(readFileSync(docPath, 'utf8').includes('只改这一块。'), '写回必须落盘');
  assert(readFileSync(docPath, 'utf8').includes('![同一张时点图在品类页复用作替代关系示意]'),
    '图中引用与表格、来源块不被这次写回动到');
  validate(docPath);
} finally {
  await workbench.close();
}

pass('By-page 文档：模板/真实样例如期通过；删正文、删页末出处、出处不在页末、未登记图片与错文档类型被拒；Storyline 页/主张/来源 1:1 交接；工作台按块读出并改通、块级反馈在含图含表含出处页跑通');
