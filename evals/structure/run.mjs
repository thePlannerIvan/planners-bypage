import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assert, jsonOutput, pass, runNode } from '../lib/assert.mjs';
import { moduleScript } from '../../scripts/lib/planners-modules.mjs';

const root = resolve(import.meta.dirname, '../..');
const skill = readFileSync(join(root, 'SKILL.md'), 'utf8');
assert(skill.includes('name: planners-bypage'), 'frontmatter 必须使用 planners-bypage');
assert(skill.includes('$planners-ppt-hell'), '必须明确交给下游 PPT Skill');
assert(skill.includes('planners-method-wiki') && skill.includes('slide-copy'), '方法与文案表达由独立 Skill 提供');
assert(existsSync(moduleScript('planners-method-wiki', 'scripts/query-wiki.mjs')), 'Wiki 查询入口可解析');
assert(existsSync(moduleScript('planners-method-wiki', 'scripts/lint-wiki.mjs')), 'Wiki 校验入口可解析');
assert(skill.includes('.planners/storyline.md') && skill.includes('.planners/by-page.md'), '工作区统一收敛到 .planners/');
assert(skill.includes('沿用同一') && skill.includes('新项目工作目录'), '两入口必须区分复用与新建');
assert(skill.includes('按该 Skill 的规则复用') && !skill.includes('子代理复用（调用方）'), '核查代理规则由 Fact Check 拥有');

const handoff = readFileSync(join(root, 'references/content-handoff.md'), 'utf8');
assert(handoff.includes('不要求 Proposal') && handoff.includes('恢复原目录'), 'PPT Hell 资料入口无需 Proposal 且须恢复原项目');
assert(handoff.includes('同一核查员续检') && handoff.includes('同一 Bypage 正式稿'), '返修必须使用同一活动稿件与核查上下文');

for (const needle of ['.planners/storyline.md', '.planners/by-page.md', 'import-storyline-doc.mjs', 'validate-bypage-doc.mjs', 'doc-workbench.mjs', 'doc-surface.mjs']) {
  assert(skill.includes(needle), `SKILL 必须指向文档形态入口：${needle}`);
}
for (const legacy of ['page_title', 'main_message', 'Page Content', 'asset-manifest', 'page-architecture']) {
  assert(!skill.includes(legacy), `SKILL 不再描述旧 JSON / 资产清单字段：${legacy}`);
}
assert(jsonOutput(runNode(join(root, 'scripts/validate-bypage-doc.mjs'), [join(root, 'templates/by-page.md')])).valid, 'By-page 文档模板必须通过');

const temp = mkdtempSync(join(tmpdir(), 'planners-bypage-structure-'));
try {
  mkdirSync(join(temp, 'source'));
  const research = Buffer.from('# Research\n');
  writeFileSync(join(temp, 'source/research.md'), research);
  const sourceIndex = join(temp, 'source-index.json');
  writeFileSync(sourceIndex, JSON.stringify({
    contract_version: 'source-index/2.1.0',
    source_root: '.',
    sources: [{
      source_id: 'src-research',
      origin: { path: 'source/research.md', sha256: createHash('sha256').update(research).digest('hex'), bytes: research.length },
      kind: 'document',
      provenance: 'primary',
      role: '主要内容',
      audit_layer: { mode: 'source_file', path: null, sha256: null, derived_from_sha256: null, snapshot_sha256: null, method: null, anchor_marks: null },
      coverage: { status: 'full', scope: null, reason: null, impact_if_incomplete: null, counts: null },
      anchors: [{ kind: 'section', value: '全文' }],
      conflicts: [],
      notes: '',
    }],
  }, null, 2));
  assert(jsonOutput(runNode(join(root, 'scripts/validate-source-index.mjs'), [sourceIndex])).valid, 'Source Index 2.1.0 必须验证真实文件');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
pass('结构、source-index/2.1.0 与 planners-doc/2 契约对齐');
