// HTML helpers the Arena's search handler may call. Nothing here is ever put
// into the real page: the game draws every response from typed blocks.

/** The standard HTML escape: the five characters that can start or end markup. */
export function escapeHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ALLOWED_TAGS = new Set(['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'li', 'h2']);

/** An allow-list sanitiser in the spirit of DOMPurify: known formatting tags stay, every other tag goes. */
export function sanitizeHtml(input: unknown): string {
  return String(input ?? '').replace(/<\s*\/?\s*([a-zA-Z][\w-]*)[^>]*>/g, (tag, name: string) => (ALLOWED_TAGS.has(name.toLowerCase()) ? `<${tag.startsWith('</') ? '/' : ''}${name.toLowerCase()}>` : ''));
}
