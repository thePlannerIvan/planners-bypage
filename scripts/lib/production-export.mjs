import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync} from 'node:fs';
import {basename, dirname, relative, resolve, sep} from 'node:path';
import {pageNumber, scalar, section, splitPages} from './bypage-copy.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function canonicalFile(path) {
  if (!path) throw new Error('Structured production export requires --memory');
  const absolute = resolve(path);
  if (absolute.split(sep).some(part => part.startsWith('.env'))) throw new Error('Environment files are not production inputs');
  const canonical = realpathSync(absolute);
  if (canonical.split(sep).some(part => part.startsWith('.env'))) throw new Error('Environment files are not production inputs');
  if (!statSync(canonical).isFile()) throw new Error(`Production input must be a regular file: ${canonical}`);
  return canonical;
}
function readBinding(path) {
  const canonical = canonicalFile(path);
  const bytes = readFileSync(canonical);
  return {file: {path: canonical, sha256: digest(bytes)}, bytes};
}

export function writeProductionExport(options) {
  const {copyPath, auditPath, feedbackPath, manifestPath, outputPath,
    deliveredManifestPath, pages, outputPages} = options;
  const inputs = new Map();
  const binding = path => {
    const {file, bytes} = readBinding(path);
    const previous = inputs.get(file.path);
    if (previous && !previous.equals(bytes)) throw new Error(`Production input changed while binding: ${file.path}`);
    inputs.set(file.path, bytes);
    return file;
  };
  const auditBinding = binding(auditPath);
  const audit = JSON.parse(inputs.get(auditBinding.path).toString('utf8'));
  const upstream = {
    copy: binding(copyPath), memory: binding(options.memory),
    source_index: binding(resolve(dirname(auditBinding.path), audit.source_index.path)),
    audit: auditBinding,
    ...(options.workbenchPath ? {workbench:binding(options.workbenchPath)} : {feedback:binding(feedbackPath)}),
    asset_manifest: binding(manifestPath), deliverable: binding(outputPath),
    delivered_asset_manifest: binding(deliveredManifestPath),
  };
  for (const key of ['architecture', 'materials']) {
    if (options[key]) upstream[key] = binding(options[key]);
  }
  const parsedPages = splitPages(inputs.get(upstream.copy.path).toString('utf8'));
  if (!parsedPages.length || JSON.stringify(pages) !== JSON.stringify(parsedPages)) {
    throw new Error('Production pages differ from the hash-bound Bypage copy');
  }
  const deliveredText = inputs.get(upstream.deliverable.path).toString('utf8').replace(/\r\n/g, '\n').trim();
  const deliveredBody = deliveredText.replace(/^# [^\n]*\n+/, '');
  if (!Array.isArray(outputPages) || outputPages.length !== parsedPages.length ||
      outputPages.join('\n\n---\n\n').trim() !== deliveredBody) {
    throw new Error('Production pages differ from the hash-bound deliverable');
  }
  const manifest = JSON.parse(inputs.get(upstream.delivered_asset_manifest.path).toString('utf8'));
  const root = resolve(dirname(upstream.delivered_asset_manifest.path), manifest.asset_root || '.');
  const registered = new Map();
  for (const asset of manifest.assets || []) {
    for (const field of ['path', 'processed_path']) {
      if (asset[field]) {
        const path = canonicalFile(resolve(root, asset[field]));
        const expected = asset[field === 'path' ? 'source_sha256' : 'processed_sha256'];
        if (!/^[0-9a-f]{64}$/.test(expected || '')) throw new Error(`Invalid approved asset SHA-256: ${path}`);
        const previous = registered.get(path);
        if (previous && (previous.asset_id !== asset.asset_id || previous.expected_sha256 !== expected)) {
          throw new Error(`Ambiguous approved asset binding: ${path}`);
        }
        registered.set(path, {...asset, expected_sha256: expected});
      }
    }
  }
  const seen = new Set();
  const productionPages = pages.map((page, index) => {
    const number = pageNumber(page);
    const declaredKey = scalar(page, 'page_key');
    const declaredId = scalar(page, 'page_id');
    if (declaredKey && declaredId && declaredKey !== declaredId) {
      throw new Error('page_key and page_id disagree; resolve the upstream identity explicitly');
    }
    const explicit = declaredKey || declaredId;
    const identity = explicit
      ? {kind: 'explicit', value: explicit}
      : {kind: 'numbered-baseline', value: number, copy_sha256: upstream.copy.sha256};
    const pageKey = explicit && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(explicit)
      ? explicit
      : `bp-${digest(`${explicit ? '' : upstream.copy.path}\0${JSON.stringify(identity)}`).slice(0, 24)}`;
    if (seen.has(pageKey)) throw new Error(`Duplicate Bypage identity: ${pageKey}`);
    seen.add(pageKey);
    const delivered = outputPages[index];
    const content = delivered.split('\n').slice(2).join('\n').split('\n## Speaker Notes')[0].trim();
    const productionNotes = section(delivered, 'Production Notes', 'Sources');
    const assets = [];
    const references = [...content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1].trim().replace(/^<|>$/g, ''));
    for (const [path] of registered) {
      // Production Notes may use a registered file without a Markdown image.
      const rel = relative(dirname(upstream.deliverable.path), path).split(sep).join('/');
      if (productionNotes.includes(rel)) references.push(rel);
    }
    for (const reference of new Set(references)) {
      if (/^https?:\/\//i.test(reference)) throw new Error(`Local production assets required: ${reference}`);
      const file = binding(resolve(dirname(upstream.deliverable.path), reference));
      const matchingAssets = [...registered.values()].filter(asset => asset.expected_sha256 === file.sha256);
      const uniqueIds = new Set(matchingAssets.map(asset => asset.asset_id));
      const asset = registered.get(file.path) || (uniqueIds.size === 1 ? matchingAssets[0] : null);
      if (asset?.expected_sha256 && asset.expected_sha256 !== file.sha256) {
        throw new Error(`Delivered asset differs from approved manifest: ${file.path}`);
      }
      assets.push({...file, reference, asset_id: asset?.asset_id || null, source_id: asset?.source_id || null});
    }
    return {
      page_key: pageKey, identity, page_number: number,
      section_id: scalar(page, 'section_id'), page_type: scalar(page, 'page_type'),
      title: scalar(page, 'page_title'), main_message: scalar(page, 'main_message'),
      content: section(delivered, 'Page Content', 'Speaker Notes') || content,
      notes: section(page, 'Speaker Notes', 'Production Notes'),
      production_notes: productionNotes, sources: section(page, 'Sources'), assets,
    };
  });
  const output = resolve(options.output);
  if (output.split(sep).some(part => part.startsWith('.env'))) throw new Error('Environment files are not production outputs');
  mkdirSync(dirname(output), {recursive: true});
  const canonicalOutput = existsSync(output) ? realpathSync(output)
    : resolve(realpathSync(dirname(output)), basename(output));
  const protectedPaths = new Set([...Object.values(upstream).map(item => item.path),
    ...productionPages.flatMap(page => page.assets.map(asset => asset.path))]);
  if (protectedPaths.has(canonicalOutput)) throw new Error('Production export cannot replace an upstream input');
  if (canonicalOutput.split(sep).some(part => part.startsWith('.env'))) throw new Error('Environment files are not production outputs');
  writeFileSync(output, `${JSON.stringify({
    version: 'bypage-production/1', route: 'slides',
    upstream, order: productionPages.map(page => page.page_key), pages: productionPages,
    provenance: {kind: 'upstream-baseline', audit_scope: 'original-bypage-copy', reverse_sync: false},
  }, null, 2)}\n`);
  return output;
}
