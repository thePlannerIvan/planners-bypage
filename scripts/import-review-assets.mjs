#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve, sep } from 'node:path';

import {pathToFileURL} from 'node:url';
import {moduleScript} from './lib/planners-modules.mjs';
const args = {};
for (let i = 0; i < process.argv.slice(2).length; i += 2) args[process.argv.slice(2)[i]] = process.argv.slice(2)[i + 1];
for (const key of ['--manifest', '--source-id']) if (!args[key]) throw new Error('缺少 ' + key);
if (Boolean(args['--feedback']) === Boolean(args['--workbench'])) throw new Error('提供 --workbench <审阅目录>；仅旧项目使用 --feedback，不能混用');
const manifestPath = resolve(args['--manifest']);
const feedbackPath = args['--feedback'] ? resolve(args['--feedback']) : null;
const reviewDir = args['--workbench'] ? realpathSync(args['--workbench']) : dirname(feedbackPath);
let decisions;
if (args['--workbench']) {
  const context = JSON.parse(readFileSync(resolve(reviewDir,'review-context.json'),'utf8'));
  const {savedContent} = await import(pathToFileURL(moduleScript('planners-review-core','scripts/content-snapshot.mjs')));
  const {head} = savedContent(reviewDir,context.files[0].path);
  if (head.context.type !== 'copy') throw new Error('只接收完整逐页稿工作台上传');
  decisions = Object.entries(head.state.attachments ?? {}).map(([id,attachments]) => ({page_number:head.page_mapping[id],attachments}));
} else decisions = JSON.parse(readFileSync(feedbackPath,'utf8')).decisions || [];
const pages = args['--pages'] ? new Set(args['--pages'].split(',').map(Number)) : null;
if (pages && [...pages].some(p => !Number.isInteger(p) || p < 1)) throw new Error('--pages 应为当前页号，逗号分隔');
// Resolve every input before creating or updating assets.
const uploads = decisions.filter(d => !pages || pages.has(d.page_number)).flatMap(d => (d.attachments || []).map(attachment => {
  const raw = attachment.path || attachment.url;
  if (!raw || typeof raw !== 'string') throw new Error('上传路径为空');
  if (args['--workbench'] && (!d.page_number || !raw.startsWith('uploads/'))) throw new Error('上传未绑定活动页面或上传目录');
  const source = realpathSync(resolve(reviewDir,raw));
  if (args['--workbench']) {
    const root = realpathSync(resolve(reviewDir,'uploads'));
    if (!source.startsWith(root + sep)) throw new Error('上传文件越出上传目录');
  }
  if (source.split(sep).some(part => /^\.env(?:\.|$)|^\.venv$/.test(part))) throw new Error('敏感文件不是图片资产');
  return {page_number:d.page_number,attachment,source};
}));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const assetRoot = resolve(dirname(manifestPath), manifest.asset_root || '.');
const uploadRoot = resolve(assetRoot, 'original', 'review-uploads');
mkdirSync(uploadRoot, { recursive: true });
const byHash = new Map(manifest.assets.map(item => [item.source_sha256 + ':' + item.source_id, item]));
const imported = [];
for (const {page_number,attachment,source} of uploads) {
    const buffer = readFileSync(source);
    const hash = createHash('sha256').update(buffer).digest('hex');
    let asset = byHash.get(hash + ':' + args['--source-id']);
    if (!asset) {
      const pageDir = resolve(uploadRoot, 'page-' + String(page_number).padStart(2, '0'));
      mkdirSync(pageDir, { recursive: true });
      let destination = resolve(pageDir, basename(source));
      for (let index = 2; existsSync(destination); index++) {
        const name = basename(source); const dot = name.lastIndexOf('.');
        destination = resolve(pageDir, dot > 0 ? name.slice(0, dot) + '-' + index + name.slice(dot) : name + '-' + index);
      }
      copyFileSync(source, destination);
      asset = {
        asset_id: 'asset-upload-' + createHash('sha256').update(hash + ':' + args['--source-id']).digest('hex').slice(0, 16),
        path: relative(assetRoot, destination).split('\\').join('/'),
        preview_path: null,
        processed_path: null,
        source_sha256: hash,
        processed_sha256: null,
        kind: 'review_upload',
        semantic_class: 'uncertain',
        source_id: args['--source-id'],
        source_context: '用户在第 ' + page_number + ' 页审阅中上传：' + (attachment.caption || attachment.alt || basename(source)),
        status: 'selected',
        processing_level: 'none',
        processing_notes: '',
        visual_check: {
          status: 'pending',
          method: '',
          notes: '审阅上传已登记，尚待检查图片内容。',
        },
        width: null,
        height: null,
        issues: [],
      };
      manifest.assets.push(asset);
      byHash.set(hash + ':' + args['--source-id'], asset);
    }
    imported.push({ page_number: page_number, asset_id: asset.asset_id });
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
process.stdout.write(JSON.stringify({ valid: true, imported }) + '\n');
