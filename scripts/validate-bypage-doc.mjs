#!/usr/bin/env node
/**
 * Bypage 的 By-page 校验：在 planners-doc/2 之上，只加逐页文案自己的内容规则。
 *
 * 用法：node validate-bypage-doc.mjs <by-page.md> [--assets <doc-assets 清单>] [--text]
 *
 * 它不另造解析器：
 *   · 结构校验（文档头、章节/页/标题块层级、锚点、图片、空页）交给 planners-review-core 的
 *     `scripts/validate-doc.mjs`，回执与退出码原样合并；
 *   · Bypage 规则复用同一个切块实现 `scripts/lib/doc-blocks.mjs` 的 parseDocument，
 *     只读 pages[].blocks 与 pages[].sources，不重新切一遍 Markdown。
 *
 * 它加的规则（只评价「每页有没有把三段写全、出处有没有随文档交付」，不评价文案好不好）：
 *   · 页内三段 `### 正文 / 口播 / 制作` 各一次，按这个顺序；
 *   · 正文非空；
 *   · 页末有连续的引用作为出处区（来源随文档交付）；出处不是标题块；
 *   · 正文引用到的图必须登记在同名 `doc-assets/1` 清单里（文件存在由公共校验器负责）。
 *
 * 退出码与公共校验器一致：0 合规（可有警告）、1 不合规、2 用法或依赖错误。
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { moduleScript } from './lib/planners-modules.mjs';

const CONTRACT = 'planners-doc/2';
const SECTIONS = ['正文', '口播', '制作'];

const usage = () => {
  console.error('用法：node validate-bypage-doc.mjs <by-page.md> [--assets <doc-assets 清单>] [--text]');
  process.exit(2);
};

const argv = process.argv.slice(2);
const textOutput = argv.includes('--text');
const assetsFlag = argv.indexOf('--assets');
const assetsArg = assetsFlag >= 0 ? argv[assetsFlag + 1] : null;
if (assetsFlag >= 0 && (!assetsArg || assetsArg.startsWith('--'))) usage();
const file = argv.find((value, index) => !value.startsWith('--')
  && !(assetsFlag >= 0 && index === assetsFlag + 1));
if (!file) usage();
const docPath = resolve(file);
if (!existsSync(docPath) || !statSync(docPath).isFile()) {
  console.error(`找不到文档：${docPath}`);
  process.exit(2);
}

const failSetup = (message) => {
  console.error(message);
  process.exit(2);
};

let coreValidator;
let parseDocument;
let TYPE_NAMES;
let imageReferences;
try {
  coreValidator = moduleScript('planners-review-core', 'scripts/validate-doc.mjs');
  ({ parseDocument, TYPE_NAMES, imageReferences } = await import(pathToFileURL(
    moduleScript('planners-review-core', 'scripts/lib/doc-blocks.mjs'))));
} catch (error) {
  failSetup(`无法加载 planners-review-core：${error.message}`);
}

// ① 结构：公共校验器说了算，不复制它的错误码。
const structural = spawnSync(process.execPath, [coreValidator, docPath], {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
  env: process.env,
});
if (structural.status === 2) {
  process.stderr.write(structural.stderr || `无法校验：${docPath}\n`);
  process.exit(2);
}
if (structural.status !== 0 && structural.status !== 1) {
  failSetup(`planners-review-core 的 validate-doc.mjs 没有正常结束：${structural.stderr || structural.status}`);
}
let receipt;
try {
  receipt = JSON.parse(structural.stdout);
} catch {
  failSetup(`planners-review-core 的 validate-doc.mjs 没有返回 JSON：${structural.stdout.slice(0, 400)}`);
}

// ② Bypage 规则：用的是同一个 parseDocument，只读已经切好的 pages / blocks。
const raw = readFileSync(docPath, 'utf8');
const parsed = parseDocument(raw, { checkImages: false });
const errors = [];
const warnings = [];
let pagesWithSections = 0;
let bodyBlocks = 0;
let sourceBlocks = 0;

const blockLabel = (block) => block?.anchor
  ?? `第 ${block?.index ?? '?'} 块（${TYPE_NAMES?.[block?.type] ?? block?.type ?? '块'}）`;
const pageLabel = (page) => `章节「${page.chapter?.title ?? '未分章'}」第 ${page.index} 页「${page.title}」`;
const entry = (code, message, page, block, extra = {}) => ({
  code,
  message,
  line: block?.startLine ?? page?.line ?? null,
  page: page ? pageLabel(page) : null,
  block: blockLabel(block),
  ...extra,
});
const push = (...args) => errors.push(entry(...args));
const warn = (...args) => warnings.push(entry(...args));

const isByPage = !parsed.front.doc || parsed.front.doc === 'by-page';
if (!isByPage) {
  errors.push({
    code: 'doc_kind',
    message: `这是 ${parsed.front.doc} 工作稿；Bypage 校验只检查 by-page`,
    line: 2,
    page: null,
    block: null,
  });
}

for (const page of (isByPage ? parsed.pages : [])) {
  const headings = page.blocks.filter((block) => block.type === 'heading');
  const sectionBlocks = new Map();
  for (const heading of headings) {
    const title = (heading.text ?? '').trim();
    if (!SECTIONS.includes(title)) {
      const hint = title === 'Sources'
        ? '出处不再是标题块：来源写成页末连续的引用（`> …`），位置就是语义'
        : `页内标题块只认「${SECTIONS.join(' / ')}」`;
      push('page_section_unknown', `${hint}；「${title || '空标题'}」不算其中一段`, page, heading);
      continue;
    }
    if (sectionBlocks.has(title)) {
      push('page_section_duplicate', `「${title}」段在这一页出现了两次`, page, heading);
      continue;
    }
    sectionBlocks.set(title, heading);
  }

  const missing = SECTIONS.filter((title) => !sectionBlocks.has(title));
  for (const title of missing) {
    errors.push({
      code: 'page_section_missing',
      message: `每页三段要写全：缺少「${title}」段`,
      line: page.line,
      page: pageLabel(page),
      block: null,
      field: title,
    });
  }
  if (missing.length === 0) pagesWithSections += 1;

  // 顺序：三段必须按 正文 → 口播 → 制作 排。
  const present = headings
    .map((heading) => ({ heading, title: (heading.text ?? '').trim() }))
    .filter(({ title }) => SECTIONS.includes(title));
  for (let index = 1; index < present.length; index += 1) {
    if (SECTIONS.indexOf(present[index].title) < SECTIONS.indexOf(present[index - 1].title)) {
      push('page_section_order', `三段顺序是 ${SECTIONS.join(' → ')}；「${present[index].title}」放错了位置`,
        page, present[index].heading);
      break;
    }
  }

  // 正文：必须真的写了内容。
  const bodyHeading = sectionBlocks.get('正文');
  if (bodyHeading) {
    const after = page.blocks.slice(page.blocks.indexOf(bodyHeading) + 1);
    const nextHeading = after.findIndex((block) => block.type === 'heading');
    const content = nextHeading === -1 ? after : after.slice(0, nextHeading);
    if (!content.some((block) => block.raw.trim() !== '')) {
      push('page_body_empty', '正文不能为空：写出观众实际看到的完整文案', page, bodyHeading);
    }
    bodyBlocks += content.length;
  }

  // 出处：页末连续的引用（契约第 5 节）。位置就是语义，没有标题块。
  const pageSources = page.sources ?? [];
  sourceBlocks += pageSources.length;
  if (pageSources.length === 0) {
    const strayQuotes = page.blocks.filter((block) => block.type === 'quote');
    if (strayQuotes.length > 0) {
      warn('page_sources_not_at_end',
        '页里有引用块但不在页末：出处只能是页末连续的引用，页中引用不算出处', page, strayQuotes.at(-1));
    }
    errors.push({
      code: 'page_sources_empty',
      message: '出处不能为空：来源随文档交付，逐条写成页末连续的引用（`> …`）',
      line: page.line,
      page: pageLabel(page),
      block: null,
    });
  }
}

// ③ 图：文件存在由公共校验器负责；「登记」由公共的 doc-assets/1 校验器负责。
const images = [];
for (const block of parsed.blocks) {
  if (block.type === 'code') continue;
  for (const reference of imageReferences(block.raw)) images.push(reference);
}
let assetsReceipt = null;
if (images.length > 0) {
  let assetValidator;
  try {
    assetValidator = moduleScript('planners-review-core', 'scripts/validate-doc-assets.mjs');
  } catch (error) {
    failSetup(`无法加载 planners-review-core 的资产校验器：${error.message}`);
  }
  const args = [docPath, ...(assetsArg ? ['--manifest', resolve(assetsArg)] : [])];
  const run = spawnSync(process.execPath, [assetValidator, ...args], { encoding: 'utf8', env: process.env });
  if (run.status !== 0 && run.status !== 1) {
    failSetup(`validate-doc-assets.mjs 没有正常结束：${run.stderr || run.status}`);
  }
  try {
    assetsReceipt = JSON.parse(run.stdout);
  } catch {
    failSetup(`validate-doc-assets.mjs 没有返回 JSON：${run.stdout.slice(0, 400)}`);
  }
  errors.push(...(assetsReceipt.errors || []));
}

const allErrors = [...receipt.errors, ...errors]
  .sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || String(a.code).localeCompare(String(b.code)));
const allWarnings = [...receipt.warnings, ...warnings]
  .sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || String(a.code).localeCompare(String(b.code)));
const checked = {
  ...receipt.checked,
  pages_with_sections: pagesWithSections,
  body_blocks: bodyBlocks,
  source_blocks: sourceBlocks,
  images: images.length,
  ...(assetsReceipt?.checked ? { assets_manifest: assetsReceipt.checked.manifest ?? null } : {}),
};
const valid = allErrors.length === 0;

if (textOutput) {
  for (const warning of allWarnings) {
    const where = [warning.line ? `行 ${warning.line}` : null, warning.page, warning.block].filter(Boolean).join(' · ');
    console.log(`WARN  [${warning.code}] ${where ? `${where}：` : ''}${warning.message}`);
  }
  for (const error of allErrors) {
    const where = [error.line ? `行 ${error.line}` : null, error.page, error.block].filter(Boolean).join(' · ');
    console.log(`ERROR [${error.code}] ${where ? `${where}：` : ''}${error.message}`);
  }
  console.log(valid
    ? `\n合规：${checked.chapters} 章 ${checked.pages} 页；${checked.pages_with_sections} 页三段齐全、${checked.source_blocks} 条页末出处；${allWarnings.length} 个警告`
    : `\n不合规：${allErrors.length} 个错误、${allWarnings.length} 个警告`);
} else {
  console.log(JSON.stringify({ contract: CONTRACT, valid, errors: allErrors, warnings: allWarnings, checked }, null, 2));
}
process.exit(valid ? 0 : 1);
