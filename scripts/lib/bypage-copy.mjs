import {copyScalar} from './copy-scalars.mjs';

export function splitPages(content) {
  return [...content.replace(/\r\n/g, '\n').matchAll(/(?:^|\n)(---\n[\s\S]*?\n---\n[\s\S]*?)(?=\n---\ncontract_version:|$)/g)]
    .map(match => match[1].trimEnd());
}

export function pageNumber(page) {
  return Number(page.match(/^page_number:\s*(\d+)\s*$/m)?.[1]);
}

export function scalar(page, key) {
  const frontmatter = page.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1] || '';
  return copyScalar(frontmatter.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1]);
}

export function section(page, name, nextName = null) {
  const end = nextName ? `(?=\\n##\\s*${nextName})` : '$';
  return page.match(new RegExp(`##\\s*${name}\\s*\\n([\\s\\S]*?)${end}`, 'i'))?.[1]?.trim() || '';
}
