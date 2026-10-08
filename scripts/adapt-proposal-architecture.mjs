#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i]] = process.argv[i + 1];
if (!args['--input'] || !args['--output']) throw new Error('用法：--input <Proposal architecture> --output <Bypage architecture>');
const input = resolve(args['--input']);
const output = resolve(args['--output']);
if (input === output || existsSync(output)) throw new Error('保留上游原件及已有工作结构；输出必须为新文件');
const source = JSON.parse(readFileSync(input, 'utf8'));
if (source.contract_version !== '2.0.0') throw new Error('输入必须是 Proposal 2.0.0 结构');
const pages = source.pages.map(page => {
  const blocks = page.content_blocks.map(block => {
    const result = { block_title: block.block_title, role: block.role, content_requirement: block.content_requirement };
    if (block.suggested_form != null) result.suggested_form = block.suggested_form;
    return result;
  });
  for (const [field, title] of [['boundary', '论证边界'], ['chart_brief', '图表要求'], ['layout_direction', '表达要求']]) {
    if (typeof page[field] === 'string' && page[field].trim()) {
      blocks.push({ block_title: title, role: '保留上游要求', content_requirement: page[field] });
    }
  }
  return {
    page_number: page.page_number, section_id: page.section_id, page_type: 'freeform',
    page_job: page.page_job, title_intent: page.title_intent, main_message: page.claim,
    content_blocks: blocks, source_needs: page.evidence_needs,
    recommended_assets: [], other_candidate_assets: [], transition: page.transition,
  };
});
const sections = source.sections.map(section => ({
  section_id: section.section_id, title: section.title,
  audience_shift: section.cognitive_job, transition: section.transition,
}));
if (source.appendix?.length) {
  let id = 'sec-proposal-appendix';
  while (sections.some(section => section.section_id === id)) id += '-x';
  sections.push({ section_id: id, title: '附录', audience_shift: '保留必要口径与背景', transition: '' });
  for (const entry of source.appendix) {
    pages.push({
      page_number: pages.length + 1, section_id: id, page_type: 'appendix',
      page_job: `保留上游附录 ${entry.appendix_id}`, title_intent: entry.title,
      main_message: entry.title,
      content_blocks: [{ block_title: entry.title, role: '附录', content_requirement: entry.content }],
      source_needs: [], recommended_assets: [], other_candidate_assets: [], transition: '',
    });
  }
}
const result = { contract_version: 'page-architecture/1.0.0', project_id: source.project_id,
  storyline_thesis: source.storyline_thesis, sections, pages };
// Validate before exposing the candidate as a usable working architecture.
mkdirSync(dirname(output), { recursive: true });
// The validator is file-based; preserve failed candidates for inspection.
const candidate = `${output}.candidate`;
if (existsSync(candidate)) throw new Error(`已有待检查转换文件：${candidate}`);
writeFileSync(candidate, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
const checked = spawnSync(process.execPath, [resolve(import.meta.dirname, 'validate-page-architecture.mjs'), candidate], { encoding: 'utf8' });
if (checked.status !== 0) throw new Error(`转换结构无效：${checked.stdout || checked.stderr}；保留 ${candidate}`);
renameSync(candidate, output);
console.log(JSON.stringify({ valid: true, input, output, pages: pages.length }));
