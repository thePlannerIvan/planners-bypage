/**
 * 图表渲染库：把 Mermaid 文字源**确定性**渲染成 SVG 文件。
 *
 * 定位：这是「内容阶段的可见化」，不是终稿版面。产物必须能被事实核查回读，
 * 因此源永远留在 diagram-manifest 里，正文只引用产物路径。
 *
 * 依赖解析的哲学与 planners-modules 一致，但对象是 npm 包而不是 Skill 目录：
 *   ① $PLANNERS_PELE_ENTRY（直接指 dist/pele.js，调试用）
 *   ② $PLANNERS_PELE_HOME（含 node_modules/pele 或 pele/ 的目录）
 *   ③ 从项目目录 / cwd 向上找 node_modules/pele（项目自带最省事）
 *   ④ ~/.planners-modules/pele-pkg/node_modules/pele（默认安装根）
 *   ⑤ 都没有 → 自动装到 ④，装完复验；PLANNERS_NO_AUTO_INSTALL=1 时只报不装。
 *
 * 版本**严格钉死**：解析到的版本必须等于 PELE_VERSION，否则报错并给出重装命令。
 * 理由：渲染是确定性契约，换版本就可能换字节，Hash 门禁和重渲染比对都会失效。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PELE_VERSION = '1.6.0';
export const DIAGRAM_CONTRACT = 'diagram-manifest/1.0.0';

/**
 * 烘焙进 SVG 的主题。SVG 走 `<img>` 时是隔离文档，页面 CSS 变量进不去 ——
 * 所以颜色/字体必须在渲染时写成字面值，产物才在审阅页、PPT Hell、浏览器里长得一样。
 */
export const FONT_STACK = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif';

export const THEMES = {
  paper: {
    '--pele-bg': '#fffdf8',
    '--pele-fg': '#191817',
    '--pele-muted': '#6b6a66',
    '--pele-line': '#191817',
    '--pele-surface': '#f4f1e8',
    '--pele-surface-alt': '#e9e5d9',
    '--pele-border': '#c9c5b8',
    '--pele-accent': '#1f5c8b',
    '--pele-radius': '6px',
  },
  ink: {
    '--pele-bg': '#141413',
    '--pele-fg': '#f4f1e8',
    '--pele-muted': '#a8a59a',
    '--pele-line': '#f4f1e8',
    '--pele-surface': '#232220',
    '--pele-surface-alt': '#2f2d29',
    '--pele-border': '#4a4842',
    '--pele-accent': '#7fb3d5',
    '--pele-radius': '6px',
  },
};

const INSTALL_ROOT = () => join(homedir(), '.planners-modules', 'pele-pkg');

/**
 * 图型词表：写 source 之前先挑一个。
 *
 * 这份清单刻意**短** —— 它出现在「决定要不要画图」的那一刻，太长就不会被读。
 * 完整词表（30 种）见 references/diagram-lifecycle.md；这里只给能办事的那几行。
 */
export const DIAGRAM_TYPES = [
  ['链 / 流程', 'flowchart TD|LR', '因果推进、管线、分叉与汇合；横版页用 LR'],
  ['时序', 'sequenceDiagram', '谁在什么时候调用谁'],
  ['状态 / 决策', 'stateDiagram-v2', '状态迁移、开关条件'],
  ['时间', 'timeline / gantt', '阶段、排期'],
  ['用户', 'journey', '触点与情绪起伏'],
  ['位置', 'quadrantChart', '2×2 取舍'],
  ['归因', 'ishikawa', '主因 / 次因'],
  ['占比', 'pie', '构成'],
  ['结构', 'block / architecture / C4', '分层、组件、部署'],
  ['层级', 'mindmap / treemap', '拆解、体积'],
  ['流向', 'sankey', '分流与损耗'],
  ['战略', 'wardley / cynefin', '演化、判断类型'],
  ['对比', 'radar / venn', '多维、交叠'],
  ['数量', 'xychart', '趋势、分布'],
];
export const DIAGRAM_TYPES_NOTE = '几何即含义的图（三角、漏斗、金字塔、同心圆）不在词表里 —— 那是手工 SVG 的活，别硬拼成流程图。';

function ancestors(start, maxDepth = 6) {
  const out = [];
  let current = resolve(start);
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
    out.push(current);
  }
  return out;
}

/** 候选路径：目录型（含 package.json 的 pele 包根）。 */
export function peleCandidates({ env = process.env, projectDir = process.cwd(), home = homedir() } = {}) {
  const out = [];
  const push = (p) => { if (p) out.push(resolve(p)); };
  if (env.PLANNERS_PELE_HOME) {
    push(join(env.PLANNERS_PELE_HOME, 'node_modules/pele'));
    push(join(env.PLANNERS_PELE_HOME, 'pele'));
    push(env.PLANNERS_PELE_HOME);
  }
  for (const start of [projectDir, process.cwd()]) {
    for (const dir of [resolve(start), ...ancestors(start)]) push(join(dir, 'node_modules/pele'));
  }
  push(join(home, '.planners-modules', 'pele-pkg', 'node_modules/pele'));
  push(join(home, '.planners-modules', 'pele', 'node_modules', 'pele'));
  return [...new Set(out)];
}

function readPackage(dir) {
  try { return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); } catch { return null; }
}

/** 某个候选是否可用：包在、入口在、版本正好等于钉死的版本。 */
export function inspectCandidate(dir) {
  if (!dir || !existsSync(dir)) return { usable: false, reason: '不存在' };
  const pkg = readPackage(dir);
  if (!pkg) return { usable: false, reason: '不是 npm 包目录' };
  const entry = join(dir, 'dist', 'pele.js');
  if (!existsSync(entry)) return { usable: false, reason: '缺 dist/pele.js', version: pkg.version };
  if (pkg.version !== PELE_VERSION) {
    return { usable: false, reason: `版本 ${pkg.version} ≠ 钉死的 ${PELE_VERSION}`, version: pkg.version, wrongVersion: true, entry };
  }
  return { usable: true, entry, version: pkg.version };
}

function npm(args, options = {}) {
  return spawnSync('npm', args, { encoding: 'utf8', ...options });
}

export function manualInstallCommands() {
  const root = INSTALL_ROOT();
  return {
    one: `npm install pele@${PELE_VERSION} --prefix "${root}"`,
    verify: `node -e "console.log(require('${join(root, 'node_modules/pele/package.json')}').version)"`,
    alt: `或在项目里装：cd <项目目录> && npm install pele@${PELE_VERSION}`,
  };
}

/** 缺依赖时自动装到默认安装根（装完复验版本）。 */
export function ensurePele({ env = process.env, projectDir = process.cwd(), home = homedir(), log = () => {} } = {}) {
  const candidates = peleCandidates({ env, projectDir, home });
  const found = [];
  for (const dir of candidates) {
    const info = inspectCandidate(dir);
    if (info.usable) return { path: dir, entry: info.entry, version: info.version, candidates, action: 'reused' };
    if (info.wrongVersion) found.push({ dir, ...info });
  }
  if (found.length) {
    throw new Error(
      `解析到 pele，但版本不对：\n  ${found.map(f => `${f.dir} → ${f.version}`).join('\n  ')}\n`
      + `本 Skill 钉死 pele@${PELE_VERSION}（渲染确定性契约）。重装：\n  ${manualInstallCommands().one}`,
    );
  }
  if (env.PLANNERS_NO_AUTO_INSTALL === '1') {
    throw new Error(
      `找不到 pele（自动安装已关闭）。找过：\n  ${candidates.join('\n  ')}\n装法：\n  ${manualInstallCommands().one}\n  ${manualInstallCommands().alt}`,
    );
  }
  const root = INSTALL_ROOT();
  log(`缺少渲染依赖 pele@${PELE_VERSION}，装到 ${root}`);
  mkdirSync(root, { recursive: true });
  const result = npm(
    ['install', `pele@${PELE_VERSION}`, '--prefix', root, '--no-audit', '--no-fund', '--no-save',
      '--cache', join(root, '.npm-cache')],
    { cwd: root, env: { ...env } },
  );
  if (result.status !== 0) {
    const why = (result.stderr || result.stdout || '').trim().split('\n').slice(-3).join(' / ');
    throw new Error(`自动安装 pele 失败（${why}）。手动装：\n  ${manualInstallCommands().one}`);
  }
  const installed = inspectCandidate(join(root, 'node_modules/pele'));
  if (!installed.usable) throw new Error(`装完了但复验不过：${installed.reason}。手动装：\n  ${manualInstallCommands().one}`);
  return { path: join(root, 'node_modules/pele'), entry: installed.entry, version: installed.version, candidates, action: 'installed' };
}

let cached = null;
/** 加载渲染器（同一进程内只加载一次）。 */
export async function loadPele(options = {}) {
  if (cached) return cached;
  const resolved = ensurePele(options);
  const module = await import(pathToFileURL(resolved.entry).href);
  if (typeof module.render !== 'function') throw new Error('pele 入口没有导出 render()，版本或入口不对');
  cached = { ...resolved, render: module.render };
  return cached;
}

/** 长中文标签不自动换行会横向撑开——按字数插入软换行（只动方/花/圆括号里的节点标签）。 */
export function wrapLabels(source, limit) {
  if (!limit || limit < 4) return source;
  const wrapOne = (text) => {
    if ([...text].length <= limit) return text;
    const chunks = [];
    let line = '';
    for (const char of [...text]) {
      line += char;
      // 避开在标点后立刻断开，读起来才自然
      if ([...line].length >= limit && !/[，、。；：！？]$/.test(char)) { chunks.push(line); line = ''; }
    }
    if (line) chunks.push(line);
    return chunks.join('\\n');
  };
  // 只匹配同一行内、不含嵌套括号的标签；注释行与纯文本行不受影响
  return String(source).replace(/(\[|\{|\()([^[\]{}()\n|]+)(\]|\}|\))/g, (whole, open, text, close) => (
    [...text.trim()].length > limit ? open + wrapOne(text.trim()) + close : whole
  ));
}

/** 给 SVG 烘焙主题与字体：写在内部 <style> 里，脱离页面也一致。 */
export function bakeTheme(svg, { preset = 'paper', font = FONT_STACK, variables = {} } = {}) {
  const base = THEMES[preset] || THEMES.paper;
  const vars = { ...base, ...variables, '--pele-font': font };
  const css = Object.entries(vars)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}:${String(value).replace(/<\/?style/gi, '')}`)
    .join(';');
  return String(svg).replace(/(<svg\b[^>]*>)/, `$1<style>:root{${css}}</style>`);
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decode(text) {
  return String(text).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** 抽出 SVG 里**人眼看得见**的文字（不含 title/desc）。 */
export function extractTexts(svg) {
  const out = [];
  for (const match of String(svg).matchAll(/<tspan\b[^>]*>([^<]*)<\/tspan>|<text\b[^>]*>([^<]*)<\/text>/g)) {
    const text = decode(match[1] ?? match[2] ?? '').replace(/\s+/g, ' ').trim();
    if (text) out.push(text);
  }
  return [...new Set(out)];
}

/**
 * 把图装进一个固定画框（页面可用区）。
 *
 * 为什么需要：SVG 走 `<img>` 时是隔离文档，不会跟着容器重排，页面能做的只有缩放 ——
 * 缩放会让字变小。所以「适配页面」必须在渲染时定下来。
 *
 * 两种贴法：
 *   contain（默认）画布 = 画框尺寸，内容等比居中，空隙是透明的（图本来就没画背景）；
 *   width / height  只钉一个方向，另一个按内容比例走，不留空隙。
 */
export function applyFrame(svg, { frame, fit = 'contain', content } = {}) {
  if (!frame || !Number.isFinite(frame.width) || !Number.isFinite(frame.height)) return svg;
  const width = content?.width || frame.width;
  const height = content?.height || frame.height;
  let box = { width: frame.width, height: frame.height };
  let par = 'xMidYMid meet';
  if (fit === 'width') { box = { width: frame.width, height: Math.round(frame.width * height / width) }; par = 'xMidYMin meet'; }
  else if (fit === 'height') { box = { width: Math.round(frame.height * width / height), height: frame.height }; par = 'xMinYMid meet'; }
  return String(svg).replace(/<svg\b([^>]*)>/, (whole, attrs) => {
    const cleaned = String(attrs).replace(/\s(?:width|height|preserveAspectRatio)="[^"]*"/g, '');
    return `<svg${cleaned} width="${Math.round(box.width)}" height="${Math.round(box.height)}" preserveAspectRatio="${par}">`;
  });
}

/** 渲染一张图。返回 svg（已烘焙主题、可装入画框）与尺寸/类型。 */
export function renderDiagram(pele, { source, options = {}, theme = {} }) {
  const renderOptions = {
    fontFamily: theme.font || FONT_STACK,
    fontSize: options.font_size ?? 15,
    padding: options.padding ?? 12,
    autoDirection: options.auto_direction !== false,
  };
  // maxWidth 决定「宽栏还是窄栏」的布局：给了就按容器宽度自适应（可能转纵向）。
  if (options.max_width) renderOptions.maxWidth = options.max_width;
  const sourceText = options.wrap ? wrapLabels(source, options.wrap) : source;
  const result = pele.render(sourceText, renderOptions);
  const framed = applyFrame(bakeTheme(result.svg, theme), {
    ...options,
    content: { width: result.width, height: result.height },
  });
  return {
    svg: framed,
    width: result.width ?? null,
    height: result.height ?? null,
    frame: options.frame ? { ...options.frame, fit: options.fit || 'contain' } : null,
    type: result.type ?? null,
    wrapped: sourceText !== source,
  };
}
