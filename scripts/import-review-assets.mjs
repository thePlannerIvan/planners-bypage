#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';

const args = {};
for (let i = 0; i < process.argv.slice(2).length; i += 2) args[process.argv.slice(2)[i]] = process.argv.slice(2)[i + 1];
for (const key of ['--feedback', '--manifest', '--source-id']) if (!args[key]) throw new Error('缺少 ' + key);
const feedbackPath = resolve(args['--feedback']);
const manifestPath = resolve(args['--manifest']);
const feedback = JSON.parse(readFileSync(feedbackPath, 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const assetRoot = resolve(dirname(manifestPath), manifest.asset_root || '.');
const uploadRoot = resolve(assetRoot, 'original', 'review-uploads');
mkdirSync(uploadRoot, { recursive: true });
const byHash = new Map(manifest.assets.map(item => [item.source_sha256, item]));
const imported = [];
for (const decision of feedback.decisions || []) {
  for (const attachment of decision.attachments || []) {
    const rawPath = attachment.path || attachment.url;
    const source = resolve(dirname(feedbackPath), rawPath || '');
    if (!rawPath || !existsSync(source)) throw new Error('审阅上传文件不存在：' + rawPath);
    const buffer = readFileSync(source);
    const hash = createHash('sha256').update(buffer).digest('hex');
    let asset = byHash.get(hash);
    if (!asset) {
      const pageDir = resolve(uploadRoot, 'page-' + String(decision.page_number).padStart(2, '0'));
      mkdirSync(pageDir, { recursive: true });
      let destination = resolve(pageDir, basename(source));
      for (let index = 2; existsSync(destination); index++) {
        const name = basename(source); const dot = name.lastIndexOf('.');
        destination = resolve(pageDir, dot > 0 ? name.slice(0, dot) + '-' + index + name.slice(dot) : name + '-' + index);
      }
      copyFileSync(source, destination);
      asset = {
        asset_id: 'asset-upload-' + hash.slice(0, 12),
        path: relative(assetRoot, destination).split('\\').join('/'),
        preview_path: null,
        processed_path: null,
        source_sha256: hash,
        processed_sha256: null,
        kind: 'review_upload',
        semantic_class: 'uncertain',
        source_id: args['--source-id'],
        source_context: '用户在第 ' + decision.page_number + ' 页审阅中上传：' + (attachment.caption || attachment.alt || basename(source)),
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
      byHash.set(hash, asset);
    }
    imported.push({ page_number: decision.page_number, asset_id: asset.asset_id });
  }
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
process.stdout.write(JSON.stringify({ valid: true, imported }) + '\n');
