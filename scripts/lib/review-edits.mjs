import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { moduleScript } from './planners-modules.mjs';
const {sha256, contentHash, validateChanges, writeReviewContext} = await import(pathToFileURL(moduleScript('planners-review-core','scripts/content-review-contract.mjs')));
export {sha256, contentHash, writeReviewContext};

export function splitCopy(raw) {
  return [...raw.replace(/\r\n/g,'\n').matchAll(/(?:^|\n)(---\n[\s\S]*?\n---\n[\s\S]*?)(?=\n---\ncontract_version:|$)/g)].map(m => m[1].trimEnd());
}
function applyStructure(raw, changes) {
  const doc = JSON.parse(raw), byPage = new Map(doc.pages.map(p => [String(p.page_number),p]));
  const bySection = new Map(doc.sections.map(s => [s.section_id,s]));
  if ('thesis' in changes.edits) doc.storyline_thesis = changes.edits.thesis;
  for (const [id, patch] of Object.entries(changes.edits.sections ?? {})) {
    const s = bySection.get(id);
    for (const [key,value] of Object.entries(patch)) s[key === 'lead' ? 'audience_shift' : key] = value;
  }
  for (const [id, patch] of Object.entries(changes.edits.pages ?? {})) {
    const p = byPage.get(id);
    if ('title' in patch) p.title_intent = patch.title;
    if ('claim' in patch) p.main_message = patch.claim;
    for (const [index, block] of Object.entries(patch.blocks ?? {})) {
      if ('title' in block) p.content_blocks[index].block_title = block.title;
      if ('text' in block) p.content_blocks[index].content_requirement = block.text;
    }
  }
  doc.sections = changes.section_order.map(id => bySection.get(id));
  doc.pages = changes.page_order.map((id,i) => ({...byPage.get(String(id)),page_number:i+1}));
  for (const s of doc.sections) if (Array.isArray(s.page_numbers)) s.page_numbers = doc.pages.filter(p => p.section_id === s.section_id).map(p => p.page_number);
  return JSON.stringify(doc,null,2) + '\n';
}
const headings = ['Page Content','Speaker Notes','Production Notes','Sources'];
function applyCopy(raw, changes, context) {
  const pages = new Map(splitCopy(raw).map(p => [p.match(/^page_number:\s*(\d+)/m)[1],p]));
  for (const [id, patch] of Object.entries(changes.edits.pages ?? {})) {
    let p = pages.get(id);
    for (const [field,key] of [['title','page_title'],['claim','main_message']]) if (field in patch) p = p.replace(new RegExp('^'+key+':.*$','m'), () => key+': '+JSON.stringify(patch[field]));
    for (const [index,value] of Object.entries(patch.sections ?? {})) {
      const name = headings[Number(index)], next = headings[Number(index)+1];
      let text = value;
      for (const [local,original] of Object.entries(context.imageMap ?? {})) text = text.split(']('+local+')').join(']('+original+')');
      const pattern = new RegExp('(##\\s*'+name+'[^\\n]*\\n)[\\s\\S]*?'+(next ? '(?=\\n##\\s*'+next+')' : '$'),'i');
      p = p.replace(pattern,(_,heading) => heading+'\n'+text+'\n');
    }
    pages.set(id,p);
  }
  const prefix = raw.slice(0,raw.indexOf('---\n'));
  return prefix+changes.page_order.map((id,i) => pages.get(String(id)).replace(/^page_number:.*$/m,'page_number: '+(i+1)).trimEnd()).join('\n\n')+'\n';
}

/** Source ownership stays here. The host only writes submitted bytes. */
export function prepareEdits(submission, reviewDir) {
  if (!submission.review_changes) return null;
  const context = JSON.parse(readFileSync(join(reviewDir,'review-context.json'),'utf8'));
  if (context.reviewKind !== submission.review_kind || context.sourceSha256 !== submission.source_sha256) throw Error('提交属于旧版审阅，修改已保留，请先核对版本');
  const changes = validateChanges(submission.review_changes,context,submission);
  for (const file of context.files) if (sha256(readFileSync(file.path)) !== file.sha256) throw Error('原文已有外部修改，未覆盖任何内容：'+file.path);
  const source = context.files[0], raw = readFileSync(source.path,'utf8');
  const altered = contentHash(changes.edits) !== contentHash({pages:{},sections:{}})
    || JSON.stringify(changes.page_order) !== JSON.stringify(context.pages.map(p => p.page_number))
    || JSON.stringify(changes.section_order) !== JSON.stringify(context.sections.map(s => s.section_id));
  const output = !altered ? raw : context.type === 'architecture' ? applyStructure(raw,changes) : applyCopy(raw,changes,context);
  const separator = context.type === 'architecture' ? '\n---ASSET-MANIFEST---\n' : '\n---FACT-AUDIT---\n';
  const dependency = context.files[1] ? readFileSync(context.files[1].path,'utf8') : '';
  const sourceHash = sha256(output+separator+dependency);
  return {context,changes,source,raw,next:output,changed:output !== raw,sourceHash,
    mapping:new Map(changes.page_order.map((id,i) => [Number(id),i+1]))};
}
export function commitEdits(prepared, reviewDir) {
  if (!prepared?.changed) return;
  const archive = join(reviewDir,'history','sources'); mkdirSync(archive,{recursive:true});
  const backup = join(archive,prepared.source.sha256 + (prepared.context.type === 'architecture' ? '.json' : '.md'));
  if (!existsSync(backup)) writeFileSync(backup,prepared.raw);
  const temporary = prepared.source.path+'.review-edit.tmp'; writeFileSync(temporary,prepared.next); renameSync(temporary,prepared.source.path);
  writeFileSync(join(reviewDir,'review-snapshot.json'),JSON.stringify({source_sha256:prepared.sourceHash})+'\n');
}
