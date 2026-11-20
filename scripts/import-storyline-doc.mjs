#!/usr/bin/env node
/**
 * Proposal → Bypage 的文档交接：读 `.planners/storyline.md`，生成一份 `by-page.md` 骨架。
 *
 * 用法：node import-storyline-doc.mjs --storyline <storyline.md> --output <by-page.md>
 *
 * 它不再经过旧 JSON（page-architecture.json），也不猜上游判断：
 *   · 页身份沿用主线的「章节 + 顺序 + 标题」，1:1 落到同序的 `##` 页；
 *   · 每页的主张原样成为 By-page 正文的开头一段，支撑按列表项带过来；
 *   · 页末的出处区（页末连续的引用）整体带过来，仍是逐条引用（来源随文档交付，不重新编造）。
 *
 * 产物只补三段骨架（`### 正文 / 口播 / 制作`，口播 / 制作留空，作者再写），并先跑公共结构校验，
 * 确认不会产出连 planners-doc/2 都不过的文档。已有逐页稿不覆盖：交接只发生在第一次。
 *
 * 页数变化（拆页 / 合并）是作者显式的写作决定，不由本脚本猜测：
 *   · 拆页：第一页保留主线标题，后续页用「原标题（续）」或「原标题：子题」；
 *   · 合并：保留一个标题，把两页主张都写进正文，并在项目记忆记录对应关系。
 * 页身份不写进正文，重排后按顺序重新数。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { moduleScript } from './lib/planners-modules.mjs';

function argsOf(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith('--')) continue;
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; index += 1; }
  }
  return out;
}
const args = argsOf(process.argv.slice(2));
if (!args['--storyline'] || !args['--output']) {
  console.error('用法：node import-storyline-doc.mjs --storyline <storyline.md> --output <by-page.md>');
  process.exit(2);
}
const storylinePath = resolve(args['--storyline']);
const outputPath = resolve(args['--output']);
if (!existsSync(storylinePath) || !statSync(storylinePath).isFile()) {
  console.error(`找不到 Storyline：${storylinePath}`);
  process.exit(2);
}
if (outputPath === storylinePath) {
  console.error('输出不能覆盖 Storyline 原件');
  process.exit(2);
}
if (existsSync(outputPath)) {
  console.error(`已有逐页稿，交接不覆盖：${outputPath}。需要重建时先移走旧稿。`);
  process.exit(1);
}

let coreValidator;
let parseDocument;
try {
  coreValidator = moduleScript('planners-review-core', 'scripts/validate-doc.mjs');
  ({ parseDocument } = await import(pathToFileURL(
    moduleScript('planners-review-core', 'scripts/lib/doc-blocks.mjs'))));
} catch (error) {
  console.error(`无法加载 planners-review-core：${error.message}`);
  process.exit(2);
}

const sourceRaw = readFileSync(storylinePath, 'utf8');
const checked = spawnSync(process.execPath, [coreValidator, storylinePath], {
  encoding: 'utf8', env: process.env, maxBuffer: 16 * 1024 * 1024,
});
if (checked.status !== 0) {
  console.error(`Storyline 先要通过 planners-doc/2 校验：\n${checked.stdout || checked.stderr}`);
  process.exit(1);
}
const parsed = parseDocument(sourceRaw, { checkImages: false });
if (parsed.front.doc !== 'storyline') {
  console.error(`这是 ${parsed.front.doc ?? '未知'} 工作稿；交接只接收 doc: storyline 的文档`);
  process.exit(1);
}

function claimOf(page) {
  const firstHeading = page.blocks.findIndex((block) => block.type === 'heading');
  const body = firstHeading === -1 ? page.blocks : page.blocks.slice(0, firstHeading);
  const block = body.find((candidate) => candidate.type === 'paragraph'
    && /^主张[：:]/.test(candidate.raw.trimStart()));
  return {
    block,
    text: block ? block.raw.trimStart().replace(/^主张[：:]\s*/, '').trim() : '',
    supports: body.filter((candidate) => candidate.type === 'list').map((candidate) => candidate.raw.trim()),
  };
}
// 出处是页末连续的引用（契约第 5 节）：位置就是语义，没有标题块可找。
function sourcesOf(page) {
  return (page.sources ?? []).map((block) => block.raw.trim()).filter(Boolean);
}

const warnings = [];
const mapping = [];
const chapters = [];
let chapter = null;
for (const page of parsed.pages) {
  const title = page.chapter?.title ?? '未分章';
  if (!chapter || chapter !== title) {
    chapters.push(title);
    chapter = title;
  }
  const { text: claim, supports } = claimOf(page);
  if (!claim) {
    console.error(`主线页「${page.title}」没有以「主张：」开头的段落；先回 Proposal 补全主张再交接`);
    process.exit(1);
  }
  const sources = sourcesOf(page);
  if (sources.length === 0) {
    warnings.push({ page: page.index, title: page.title, code: 'storyline_sources_missing',
      message: '主线这一页没有页末出处；逐页稿的出处需要补上再交付' });
  }
  mapping.push({
    by_page: { chapter: title, number: page.index, title: page.title },
    storyline: { chapter: title, number: page.index, title: page.title, line: page.line },
    claim,
    supports: supports.length,
    sources: sources.length,
  });
  page.claim = claim;
  page.supports = supports;
  page.sources = sources;
  page.chapterTitle = title;
}

// 文档头只接受 key: value；项目名含冒号/引号时用双引号包起来（与旧 frontmatter 写法一致）。
const frontValue = (value) => (/[:#"']/.test(value) || value.trim() !== value
  ? JSON.stringify(value)
  : value);
// 文档名只在文档头的 project 里：正文第一条结构就是 `#` 章节，不再有文档标题行。
const lines = [
  '---',
  'contract: planners-doc/2',
  'doc: by-page',
  `project: ${frontValue(parsed.front.project)}`,
  '---',
  '',
];
let currentChapter = null;
for (const page of parsed.pages) {
  if (page.chapterTitle !== currentChapter) {
    currentChapter = page.chapterTitle;
    lines.push(`# ${currentChapter}`, '');
  }
  lines.push(`## ${page.title}`, '', '### 正文', '', page.claim, '');
  if (page.supports.length) {
    lines.push(...page.supports, '');
  }
  lines.push('### 口播', '', '### 制作', '');
  // 出处是页末连续的引用：整段留在页最后，条与条之间空一行。
  for (const source of page.sources) lines.push(source, '');
}
const output = `${lines.join('\n').trimEnd()}\n`;

mkdirSync(dirname(outputPath), { recursive: true });
const candidate = `${outputPath}.candidate`;
if (existsSync(candidate)) {
  console.error(`已有待检查的交接产物：${candidate}`);
  process.exit(1);
}
writeFileSync(candidate, output, { flag: 'wx' });
const structural = spawnSync(process.execPath, [coreValidator, candidate], {
  encoding: 'utf8', env: process.env, maxBuffer: 16 * 1024 * 1024,
});
if (structural.status !== 0) {
  console.error(`交接产物结构无效，保留待检查文件：${candidate}\n${structural.stdout || structural.stderr}`);
  process.exit(1);
}
renameSync(candidate, outputPath);

console.log(JSON.stringify({
  valid: true,
  input: storylinePath,
  output: outputPath,
  project: parsed.front.project,
  chapters: chapters.length,
  pages: parsed.pages.length,
  claims: mapping.length,
  pages_with_sources: mapping.filter((item) => item.sources > 0).length,
  sources: mapping.reduce((total, item) => total + item.sources, 0),
  mapping,
  warnings,
}, null, 2));
