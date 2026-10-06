/** Double-quoted frontmatter uses JSON escaping; retain the legacy single-quote form. */
export function copyScalar(value) {
  const text = String(value ?? '').trim();
  if (text.startsWith('"') && text.endsWith('"')) {
    try { return JSON.parse(text); } catch { return text.slice(1,-1); }
  }
  return text.startsWith("'") && text.endsWith("'") ? text.slice(1,-1) : text;
}
