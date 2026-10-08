export function copyPageNumbers(content) {
  return [...String(content).replace(/\r\n/g, '\n').matchAll(/(?:^|\n)---\n([\s\S]*?)\n---\n[\s\S]*?(?=\n---\ncontract_version:|$)/g)]
    .map(match => Number(match[1].match(/^page_number:\s*(\d+)\s*$/m)?.[1]));
}
