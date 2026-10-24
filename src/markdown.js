const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPE_MAP[char]);
}

/**
 * Detects whether a plain-text string contains Markdown formatting patterns.
 */
export function looksLikeMarkdown(text = '') {
  if (!text || typeof text !== 'string') return false;
  const patterns = [
    /^#{1,3}\s+\S/m, // Headings: # H1, ## H2, ### H3
    /^[\t ]*(?:[-*+]\s+)?\[[ xX]?\]\s+/m, // Task list: - [ ] or [x]
    /^[\t ]*[-*+]\s+\S/m, // Unordered list: - item, * item
    /^[\t ]*\d+\.\s+\S/m, // Ordered list: 1. item
    /^[\t ]*>\s+\S/m, // Blockquote: > quote
    /^```[\s\S]*?```/m, // Fenced code block
    /\*\*[^*\n]+\*\*/, // Bold: **text**
    /__[^_\n]+__/, // Bold: __text__
    /(?<!\*)\*[^*\s][^*\n]*\*(?!\*)/, // Italic: *text*
    /~~[^~\n]+~~/, // Strikethrough: ~~text~~
    /`[^`\n]+`/, // Inline code: `code`
  ];
  return patterns.some((regex) => regex.test(text));
}

/**
 * Formats inline Markdown syntax (bold, italic, strikethrough, inline code) into HTML.
 * Input text is escaped first so raw HTML in plain text is safe.
 */
export function parseInlineMarkdown(text = '') {
  const codeSpans = [];
  // Extract inline code first so contents inside backticks are not formatted
  const withPlaceholders = String(text).replace(/`([^`\n]+)`/g, (_, code) => {
    const index = codeSpans.length;
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000CODE${index}\u0000`;
  });

  let html = escapeHtml(withPlaceholders);

  // Bold + Italic: ***text***
  html = html.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold: **text** or __text__
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  // Italic: *text* or _text_
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/(?<![a-zA-Z0-9_])_([^_\n]+)_(?![a-zA-Z0-9_])/g, '<em>$1</em>');
  // Strikethrough: ~~text~~
  html = html.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

  // Restore inline code spans
  html = html.replace(/\u0000CODE(\d+)\u0000/g, (_, index) => codeSpans[Number(index)] || '');

  return html;
}

/**
 * Converts a Markdown or plain-text document into editor HTML.
 */
export function markdownToHtml(markdown = '') {
  if (!markdown) return '';
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];

  let inCodeBlock = false;
  let codeLines = [];
  let listType = null; // 'ul' | 'ol' | 'task'
  let listItems = [];
  let quoteLines = [];

  const flushList = () => {
    if (!listType || !listItems.length) return;
    if (listType === 'task') {
      blocks.push(`<ul class="task-list">${listItems.join('')}</ul>`);
    } else if (listType === 'ul') {
      blocks.push(`<ul>${listItems.join('')}</ul>`);
    } else if (listType === 'ol') {
      blocks.push(`<ol>${listItems.join('')}</ol>`);
    }
    listType = null;
    listItems = [];
  };

  const flushQuote = () => {
    if (!quoteLines.length) return;
    const inner = quoteLines.map((line) => parseInlineMarkdown(line)).join('<br>');
    blocks.push(`<blockquote>${inner || '<br>'}</blockquote>`);
    quoteLines = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // Fenced code blocks
    if (/^[\t ]*```/.test(line)) {
      flushList();
      flushQuote();
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLines = [];
      } else {
        blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n')) || '\n'}</code></pre>`);
        inCodeBlock = false;
        codeLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Blockquotes: > text
    const quoteMatch = line.match(/^[\t ]*>\s?(.*)$/);
    if (quoteMatch) {
      flushList();
      quoteLines.push(quoteMatch[1]);
      continue;
    }
    flushQuote();

    // Task list item: - [ ] text, * [x] text, [ ] text, [x] text
    const taskMatch = line.match(/^[\t ]*(?:[-*+]\s+)?\[([ xX]?)\]\s+(.*)$/);
    if (taskMatch) {
      if (listType && listType !== 'task') flushList();
      listType = 'task';
      const checked = taskMatch[1].toLowerCase() === 'x';
      const content = parseInlineMarkdown(taskMatch[2]);
      listItems.push(
        `<li class="task-item" data-checked="${checked}"><input type="checkbox" class="task-checkbox" contenteditable="false"${checked ? ' checked' : ''}><span class="task-text">${content || '<br>'}</span></li>`,
      );
      continue;
    }

    // Unordered list item: - text, * text, + text
    const ulMatch = line.match(/^[\t ]*[-*+]\s+(.*)$/);
    if (ulMatch) {
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(`<li>${parseInlineMarkdown(ulMatch[1]) || '<br>'}</li>`);
      continue;
    }

    // Ordered list item: 1. text
    const olMatch = line.match(/^[\t ]*\d+\.\s+(.*)$/);
    if (olMatch) {
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(`<li>${parseInlineMarkdown(olMatch[1]) || '<br>'}</li>`);
      continue;
    }

    flushList();

    // Headings: #, ##, ###
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${parseInlineMarkdown(headingMatch[2]) || '<br>'}</h${level}>`);
      continue;
    }

    // Empty line
    if (!line.trim()) {
      blocks.push('<p><br></p>');
      continue;
    }

    // Regular paragraph line
    blocks.push(`<p>${parseInlineMarkdown(line)}</p>`);
  }

  if (inCodeBlock) {
    blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n')) || '\n'}</code></pre>`);
  }
  flushList();
  flushQuote();

  return blocks.join('');
}

const KNOWN_HTML_START = /^\s*<(?:p|h[1-6]|ul|ol|li|blockquote|pre|div|strong|em|del|code|br)\b/i;

/**
 * Converts stored note text (either rich HTML or legacy plain text / Markdown) into editor HTML.
 */
export function storedTextToHtml(raw = '') {
  if (!raw) return '';
  if (KNOWN_HTML_START.test(raw)) {
    return raw;
  }
  return markdownToHtml(raw);
}
