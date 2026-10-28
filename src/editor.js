import { escapeHtml, looksLikeMarkdown, markdownToHtml, storedTextToHtml } from './markdown.js';

/**
 * Creates a task-list `<li>` element.
 */
function createTaskItemElement(checked = false, innerHtml = '<br>') {
  const li = document.createElement('li');
  li.className = 'task-item';
  li.dataset.checked = checked ? 'true' : 'false';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.contentEditable = 'false';
  checkbox.checked = Boolean(checked);
  if (checked) checkbox.setAttribute('checked', '');

  const span = document.createElement('span');
  span.className = 'task-text';
  span.innerHTML = innerHtml || '<br>';

  li.append(checkbox, span);
  return li;
}

/**
 * Places the caret at the beginning or end of a DOM node.
 */
function placeCaret(node, atStart = true) {
  if (!node) return;
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();

  if (node.nodeType === Node.TEXT_NODE) {
    const offset = atStart ? 0 : node.textContent.length;
    range.setStart(node, offset);
    range.collapse(true);
  } else {
    range.selectNodeContents(node);
    range.collapse(atStart);
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Returns the closest block element inside `editor` for a given node.
 */
function getClosestBlock(node, editor) {
  let curr = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (curr && curr !== editor) {
    if (
      /^(P|H1|H2|H3|H4|H5|H6|LI|BLOCKQUOTE|PRE|DIV)$/.test(curr.tagName) &&
      !curr.classList.contains('task-text')
    ) {
      return curr;
    }
    curr = curr.parentElement;
  }
  return null;
}

/**
 * Sanitizes pasted external HTML so only clean semantic formatting is kept.
 */
function sanitizeHtml(dirtyHtml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(dirtyHtml, 'text/html');
  const allowedTags = new Set([
    'P', 'BR', 'H1', 'H2', 'H3', 'STRONG', 'B', 'EM', 'I', 'DEL', 'S', 'STRIKE',
    'CODE', 'PRE', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'SPAN', 'INPUT',
  ]);

  function cleanNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.textContent);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return document.createDocumentFragment();
    }

    const tag = node.tagName.toUpperCase();
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'META' || tag === 'LINK') {
      return document.createDocumentFragment();
    }

    if (tag === 'INPUT') {
      if (node.getAttribute('type') === 'checkbox') {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'task-checkbox';
        input.contentEditable = 'false';
        const isChecked = node.hasAttribute('checked') || node.checked;
        input.checked = isChecked;
        if (isChecked) input.setAttribute('checked', '');
        return input;
      }
      return document.createDocumentFragment();
    }

    let targetTag = tag;
    if (tag === 'B') targetTag = 'STRONG';
    if (tag === 'I') targetTag = 'EM';
    if (tag === 'S' || tag === 'STRIKE') targetTag = 'DEL';
    if (tag === 'H4' || tag === 'H5' || tag === 'H6') targetTag = 'H3';
    if (tag === 'DIV') targetTag = 'P';

    if (!allowedTags.has(targetTag)) {
      const frag = document.createDocumentFragment();
      Array.from(node.childNodes).forEach((child) => frag.appendChild(cleanNode(child)));
      return frag;
    }

    const el = document.createElement(targetTag.toLowerCase());
    if (targetTag === 'UL' && node.classList.contains('task-list')) {
      el.className = 'task-list';
    }
    if (targetTag === 'LI' && (node.classList.contains('task-item') || node.querySelector('input[type="checkbox"]'))) {
      el.className = 'task-item';
      const checked =
        node.dataset.checked === 'true' ||
        Boolean(node.querySelector('input[type="checkbox"][checked]'));
      el.dataset.checked = checked ? 'true' : 'false';
    }
    if (targetTag === 'SPAN' && node.classList.contains('task-text')) {
      el.className = 'task-text';
    }

    Array.from(node.childNodes).forEach((child) => el.appendChild(cleanNode(child)));
    return el;
  }

  const fragment = document.createDocumentFragment();
  Array.from(doc.body.childNodes).forEach((child) => fragment.appendChild(cleanNode(child)));
  const wrapper = document.createElement('div');
  wrapper.appendChild(fragment);
  return wrapper.innerHTML;
}

/**
 * Ensures all task items in the editor have a valid checkbox and `.task-text` wrapper.
 *
 * `fromStorage` = true when loading saved HTML (checked state comes from attributes).
 * Otherwise the live checkbox `.checked` property is the source of truth, and the DOM is only
 * touched when something is actually wrong, preserving the caret position while typing.
 */
function normalizeTaskLists(editor, { fromStorage = false } = {}) {
  const selection = window.getSelection();
  const savedAnchor =
    selection && selection.rangeCount && editor.contains(selection.anchorNode)
      ? { node: selection.anchorNode, offset: selection.anchorOffset }
      : null;
  let movedNodes = false;

  editor.querySelectorAll('ul.task-list > li, li.task-item').forEach((li) => {
    const parentUl = li.parentElement;
    if (parentUl && parentUl.tagName === 'UL' && !parentUl.classList.contains('task-list')) {
      parentUl.classList.add('task-list');
    }
    if (!li.classList.contains('task-item')) li.classList.add('task-item');

    let checkbox = li.querySelector(':scope > input.task-checkbox, :scope > input[type="checkbox"]');
    let isChecked;
    if (!checkbox) {
      isChecked = li.dataset.checked === 'true';
    } else if (fromStorage) {
      isChecked = checkbox.hasAttribute('checked') || li.dataset.checked === 'true';
    } else {
      isChecked = checkbox.checked;
    }
    const checkedStr = isChecked ? 'true' : 'false';
    if (li.dataset.checked !== checkedStr) li.dataset.checked = checkedStr;

    if (!checkbox) {
      checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-checkbox';
      checkbox.contentEditable = 'false';
      li.prepend(checkbox);
    } else {
      if (checkbox.className !== 'task-checkbox') checkbox.className = 'task-checkbox';
      if (checkbox.getAttribute('contenteditable') !== 'false') checkbox.contentEditable = 'false';
    }
    if (checkbox.checked !== isChecked) checkbox.checked = isChecked;
    if (checkbox.hasAttribute('checked') !== isChecked) checkbox.toggleAttribute('checked', isChecked);

    let textSpan = li.querySelector(':scope > span.task-text');
    if (!textSpan) {
      textSpan = document.createElement('span');
      textSpan.className = 'task-text';
      const otherNodes = Array.from(li.childNodes).filter((n) => n !== checkbox);
      otherNodes.forEach((n) => textSpan.appendChild(n));
      if (!textSpan.childNodes.length) textSpan.appendChild(document.createElement('br'));
      li.appendChild(textSpan);
      movedNodes = true;
    } else if (!textSpan.childNodes.length) {
      // Append (instead of resetting innerHTML) so the caret is not thrown out of the span
      textSpan.appendChild(document.createElement('br'));
    }
  });

  // Restore the caret if moving nodes into a wrapper collapsed the selection
  if (movedNodes && savedAnchor && savedAnchor.node.isConnected && editor.contains(savedAnchor.node)) {
    try {
      const range = document.createRange();
      range.setStart(savedAnchor.node, savedAnchor.offset);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } catch {
      // Ignore invalid offsets
    }
  }
}

/**
 * Sets up the Rich WYSIWYG + Markdown editor.
 */
export function createRichEditor({ editor, toolbar, onChange }) {
  try {
    document.execCommand('defaultParagraphSeparator', false, 'p');
  } catch {
    // Ignore if unsupported
  }

  function isEditorEmpty() {
    const hasText = editor.textContent.replace(/\u200B/g, '').trim().length > 0;
    if (hasText) return false;
    const hasStructure = Boolean(
      editor.querySelector('ul, ol, pre, blockquote, h1, h2, h3, input[type="checkbox"]'),
    );
    return !hasStructure;
  }

  function updateEmptyState() {
    if (isEditorEmpty()) {
      editor.dataset.empty = 'true';
    } else {
      delete editor.dataset.empty;
    }
  }

  function getCharacterCount() {
    const text = editor.innerText || '';
    const cleaned = text.replace(/\u200B/g, '').replace(/\n$/, '');
    return isEditorEmpty() ? 0 : cleaned.length;
  }

  function getSerializedValue() {
    if (isEditorEmpty()) return '';
    return editor.innerHTML;
  }

  function emitChange() {
    normalizeTaskLists(editor);
    updateEmptyState();
    updateToolbarState();
    onChange(getSerializedValue());
  }

  function setValue(rawText = '') {
    const html = storedTextToHtml(rawText);
    editor.innerHTML = html;
    normalizeTaskLists(editor, { fromStorage: true });
    updateEmptyState();
    updateToolbarState();
  }

  function setDisabled(disabled) {
    editor.contentEditable = disabled ? 'false' : 'true';
    if (disabled) {
      editor.dataset.disabled = 'true';
    } else {
      delete editor.dataset.disabled;
    }
    toolbar.querySelectorAll('button').forEach((btn) => {
      btn.disabled = disabled;
    });
  }

  function ensureSelectionInEditor() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !editor.contains(sel.anchorNode)) {
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }

  function getActiveBlock() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const node = sel.anchorNode;
    if (!node || !editor.contains(node)) return null;
    return getClosestBlock(node, editor);
  }

  function updateToolbarState() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !editor.contains(sel.anchorNode)) {
      toolbar.querySelectorAll('button[data-cmd]').forEach((btn) => btn.classList.remove('active'));
      return;
    }

    const anchorEl =
      sel.anchorNode.nodeType === Node.TEXT_NODE ? sel.anchorNode.parentElement : sel.anchorNode;
    const block = getActiveBlock();
    const inPre = Boolean(anchorEl?.closest('pre'));
    const inCode = Boolean(anchorEl?.closest('code')) && !inPre;
    const inQuote = Boolean(anchorEl?.closest('blockquote'));
    const inTask = Boolean(anchorEl?.closest('li.task-item, ul.task-list'));
    const inUl = Boolean(anchorEl?.closest('ul')) && !inTask;
    const inOl = Boolean(anchorEl?.closest('ol'));

    const activeStates = {
      h1: block?.tagName === 'H1',
      h2: block?.tagName === 'H2',
      h3: block?.tagName === 'H3',
      bold: !inPre && document.queryCommandState('bold'),
      italic: !inPre && document.queryCommandState('italic'),
      strikeThrough: !inPre && document.queryCommandState('strikeThrough'),
      inlineCode: inCode,
      ul: inUl,
      ol: inOl,
      taskList: inTask,
      blockquote: inQuote,
      codeBlock: inPre,
    };

    toolbar.querySelectorAll('button[data-cmd]').forEach((btn) => {
      const cmd = btn.dataset.cmd;
      btn.classList.toggle('active', Boolean(activeStates[cmd]));
      btn.setAttribute('aria-pressed', Boolean(activeStates[cmd]));
    });
  }

  /**
   * Unwraps a list item (`<li>`) out of its parent `<ul>`/`<ol>` into a replacement block element.
   */
  function replaceListItemWithBlock(li, newBlock) {
    const list = li.parentElement;
    if (!list || !/^(UL|OL)$/.test(list.tagName)) {
      li.replaceWith(newBlock);
      return;
    }

    const items = Array.from(list.children);
    const index = items.indexOf(li);

    if (items.length === 1) {
      list.replaceWith(newBlock);
    } else if (index === 0) {
      list.before(newBlock);
      li.remove();
    } else if (index === items.length - 1) {
      list.after(newBlock);
      li.remove();
    } else {
      const afterList = list.cloneNode(false);
      items.slice(index + 1).forEach((item) => afterList.appendChild(item));
      li.remove();
      list.after(newBlock);
      newBlock.after(afterList);
    }
  }

  function toggleHeading(tag) {
    ensureSelectionInEditor();
    const block = getActiveBlock();
    const upperTag = tag.toUpperCase();

    if (block && block.tagName === upperTag) {
      const p = document.createElement('p');
      p.innerHTML = block.innerHTML || '<br>';
      block.replaceWith(p);
      placeCaret(p, false);
      emitChange();
      return;
    }

    if (block && block.tagName === 'LI') {
      const heading = document.createElement(tag);
      const taskText = block.querySelector('.task-text');
      heading.innerHTML = (taskText ? taskText.innerHTML : block.innerHTML) || '<br>';
      replaceListItemWithBlock(block, heading);
      placeCaret(heading, false);
      emitChange();
      return;
    }

    if (block && block !== editor) {
      const heading = document.createElement(tag);
      heading.innerHTML = block.innerHTML || '<br>';
      block.replaceWith(heading);
      placeCaret(heading, false);
    } else {
      const heading = document.createElement(tag);
      heading.innerHTML = editor.innerHTML || '<br>';
      editor.innerHTML = '';
      editor.appendChild(heading);
      placeCaret(heading, false);
    }
    emitChange();
  }

  function toggleInlineCode() {
    ensureSelectionInEditor();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const anchorEl =
      sel.anchorNode.nodeType === Node.TEXT_NODE ? sel.anchorNode.parentElement : sel.anchorNode;
    const existingCode = anchorEl?.closest('code');

    if (existingCode && !existingCode.closest('pre')) {
      const textNode = document.createTextNode(existingCode.textContent);
      existingCode.replaceWith(textNode);
      const newRange = document.createRange();
      newRange.selectNodeContents(textNode);
      sel.removeAllRanges();
      sel.addRange(newRange);
      emitChange();
      return;
    }

    if (!range.collapsed) {
      const text = range.toString();
      const code = document.createElement('code');
      code.textContent = text;
      range.deleteContents();
      range.insertNode(code);
      const after = document.createTextNode('\u200B');
      code.after(after);
      placeCaret(after, false);
    } else {
      const code = document.createElement('code');
      code.textContent = '\u200B';
      range.insertNode(code);
      placeCaret(code, false);
    }
    emitChange();
  }

  function toggleTaskList() {
    ensureSelectionInEditor();
    const block = getActiveBlock();

    // If already in a task item, convert it back to a paragraph
    if (block && block.classList.contains('task-item')) {
      const p = document.createElement('p');
      const span = block.querySelector('.task-text');
      p.innerHTML = (span ? span.innerHTML : block.innerHTML) || '<br>';
      replaceListItemWithBlock(block, p);
      placeCaret(p, false);
      emitChange();
      return;
    }

    // If inside a normal UL or OL, convert the list to a task list
    if (block && block.tagName === 'LI') {
      const parentList = block.parentElement;
      const ul = document.createElement('ul');
      ul.className = 'task-list';
      let targetSpan = null;
      Array.from(parentList.children).forEach((li) => {
        const taskLi = createTaskItemElement(false, li.innerHTML || '<br>');
        if (li === block) {
          targetSpan = taskLi.querySelector('.task-text');
        }
        ul.appendChild(taskLi);
      });
      parentList.replaceWith(ul);
      placeCaret(targetSpan || ul, false);
      emitChange();
      return;
    }

    // Convert current block (or empty editor) into a task list
    const ul = document.createElement('ul');
    ul.className = 'task-list';
    const currentHtml = block ? block.innerHTML : editor.innerHTML;
    const taskLi = createTaskItemElement(false, currentHtml || '<br>');
    ul.appendChild(taskLi);

    if (block && block !== editor) {
      block.replaceWith(ul);
    } else {
      editor.innerHTML = '';
      editor.appendChild(ul);
    }

    const span = taskLi.querySelector('.task-text');
    placeCaret(span, false);
    emitChange();
  }

  function toggleStandardList(type) {
    ensureSelectionInEditor();
    const block = getActiveBlock();

    // If currently inside a task list, convert the task list to a standard UL/OL
    if (block && block.classList.contains('task-item')) {
      const parentList = block.parentElement;
      const newList = document.createElement(type === 'ol' ? 'ol' : 'ul');
      let targetLi = null;
      Array.from(parentList.children).forEach((li) => {
        const normalLi = document.createElement('li');
        const span = li.querySelector('.task-text');
        normalLi.innerHTML = (span ? span.innerHTML : li.innerHTML) || '<br>';
        if (li === block) targetLi = normalLi;
        newList.appendChild(normalLi);
      });
      parentList.replaceWith(newList);
      placeCaret(targetLi || newList, false);
      emitChange();
      return;
    }

    document.execCommand(type === 'ol' ? 'insertOrderedList' : 'insertUnorderedList');
    emitChange();
  }

  function toggleBlockquote() {
    ensureSelectionInEditor();
    const sel = window.getSelection();
    const anchorEl =
      sel?.anchorNode?.nodeType === Node.TEXT_NODE
        ? sel.anchorNode.parentElement
        : sel?.anchorNode;
    const existingQuote = anchorEl?.closest('blockquote');

    if (existingQuote) {
      const p = document.createElement('p');
      p.innerHTML = existingQuote.innerHTML || '<br>';
      existingQuote.replaceWith(p);
      placeCaret(p, false);
      emitChange();
      return;
    }

    const block = getActiveBlock();
    const quote = document.createElement('blockquote');

    if (block && block.tagName === 'LI') {
      const span = block.querySelector('.task-text');
      quote.innerHTML = (span ? span.innerHTML : block.innerHTML) || '<br>';
      replaceListItemWithBlock(block, quote);
    } else if (block && block !== editor) {
      quote.innerHTML = block.innerHTML || '<br>';
      block.replaceWith(quote);
    } else {
      quote.innerHTML = editor.innerHTML || '<br>';
      editor.innerHTML = '';
      editor.appendChild(quote);
    }

    placeCaret(quote, false);
    emitChange();
  }

  function toggleCodeBlock() {
    ensureSelectionInEditor();
    const sel = window.getSelection();
    const anchorEl =
      sel?.anchorNode?.nodeType === Node.TEXT_NODE
        ? sel.anchorNode.parentElement
        : sel?.anchorNode;
    const existingPre = anchorEl?.closest('pre');

    if (existingPre) {
      const p = document.createElement('p');
      p.innerHTML = escapeHtml(existingPre.textContent) || '<br>';
      existingPre.replaceWith(p);
      placeCaret(p, false);
      emitChange();
      return;
    }

    const block = getActiveBlock();
    const pre = document.createElement('pre');
    const code = document.createElement('code');

    if (block && block !== editor) {
      const text = block.innerText || '';
      code.textContent = text;
      if (!text) code.innerHTML = '<br>';
      pre.appendChild(code);
      if (block.tagName === 'LI') {
        replaceListItemWithBlock(block, pre);
      } else {
        block.replaceWith(pre);
      }
    } else {
      code.innerHTML = '<br>';
      pre.appendChild(code);
      editor.appendChild(pre);
    }

    placeCaret(code, false);
    emitChange();
  }

  function executeCommand(cmd) {
    if (editor.contentEditable === 'false') return;
    switch (cmd) {
      case 'h1':
      case 'h2':
      case 'h3':
        toggleHeading(cmd);
        break;
      case 'bold':
      case 'italic':
      case 'strikeThrough':
        ensureSelectionInEditor();
        document.execCommand(cmd);
        emitChange();
        break;
      case 'inlineCode':
        toggleInlineCode();
        break;
      case 'ul':
        toggleStandardList('ul');
        break;
      case 'ol':
        toggleStandardList('ol');
        break;
      case 'taskList':
        toggleTaskList();
        break;
      case 'blockquote':
        toggleBlockquote();
        break;
      case 'codeBlock':
        toggleCodeBlock();
        break;
      default:
        break;
    }
  }

  /**
   * Checks if the user just typed a live Markdown shortcut (block or inline) and applies it.
   */
  function tryApplyLiveMarkdown() {
    const sel = window.getSelection();
    if (!sel || !sel.isCollapsed || !sel.rangeCount) return false;

    const anchorNode = sel.anchorNode;
    if (!anchorNode || anchorNode.nodeType !== Node.TEXT_NODE) return false;
    if (anchorNode.parentElement?.closest('pre, code')) return false;

    const block = getClosestBlock(anchorNode, editor);
    if (!block) return false;

    const offset = sel.anchorOffset;
    const textBeforeCaret = anchorNode.textContent.slice(0, offset);

    // Check if anchorNode is at the very beginning of the block
    const rangeFromBlockStart = document.createRange();
    const containerForStart = block.querySelector('.task-text') || block;
    rangeFromBlockStart.setStart(containerForStart, 0);
    rangeFromBlockStart.setEnd(anchorNode, offset);
    const fullPrefix = rangeFromBlockStart.toString();

    // 1. Block-level Markdown triggers
    if (!block.classList.contains('task-item')) {
      // Headings: # , ## , ###
      const headingMatch = fullPrefix.match(/^(#{1,3})\s$/);
      if (headingMatch && /^(P|DIV)$/.test(block.tagName)) {
        const level = headingMatch[1].length;
        rangeFromBlockStart.deleteContents();
        const h = document.createElement(`h${level}`);
        h.innerHTML = block.innerHTML || '<br>';
        block.replaceWith(h);
        placeCaret(h, true);
        return true;
      }

      // Task list trigger inside paragraph or normal <li>: - [ ] , [ ] , [] , - [x] , [x]
      const taskTriggerMatch = fullPrefix.match(/^(?:[-*+]\s+)?\[([ xX]?)\]\s$/);
      if (taskTriggerMatch && /^(P|DIV|LI)$/.test(block.tagName)) {
        const checked = taskTriggerMatch[1].toLowerCase() === 'x';
        rangeFromBlockStart.deleteContents();
        const remainingHtml = block.innerHTML.trim() || '<br>';
        const taskLi = createTaskItemElement(checked, remainingHtml);

        if (block.tagName === 'LI') {
          const parentList = block.parentElement;
          if (parentList && parentList.children.length === 1) {
            parentList.className = 'task-list';
            block.replaceWith(taskLi);
          } else {
            const ul = document.createElement('ul');
            ul.className = 'task-list';
            ul.appendChild(taskLi);
            replaceListItemWithBlock(block, ul);
          }
        } else {
          const ul = document.createElement('ul');
          ul.className = 'task-list';
          ul.appendChild(taskLi);
          block.replaceWith(ul);
        }

        placeCaret(taskLi.querySelector('.task-text'), true);
        return true;
      }

      // Unordered list trigger: -  or *
      if (/^[-*+]\s$/.test(fullPrefix) && /^(P|DIV)$/.test(block.tagName)) {
        rangeFromBlockStart.deleteContents();
        const ul = document.createElement('ul');
        const li = document.createElement('li');
        li.innerHTML = block.innerHTML.trim() || '<br>';
        ul.appendChild(li);
        block.replaceWith(ul);
        placeCaret(li, true);
        return true;
      }

      // Ordered list trigger: 1.
      if (/^1\.\s$/.test(fullPrefix) && /^(P|DIV)$/.test(block.tagName)) {
        rangeFromBlockStart.deleteContents();
        const ol = document.createElement('ol');
        const li = document.createElement('li');
        li.innerHTML = block.innerHTML.trim() || '<br>';
        ol.appendChild(li);
        block.replaceWith(ol);
        placeCaret(li, true);
        return true;
      }

      // Blockquote trigger: >
      if (/^>\s$/.test(fullPrefix) && /^(P|DIV)$/.test(block.tagName)) {
        rangeFromBlockStart.deleteContents();
        const quote = document.createElement('blockquote');
        quote.innerHTML = block.innerHTML.trim() || '<br>';
        block.replaceWith(quote);
        placeCaret(quote, true);
        return true;
      }

      // Fenced code block trigger: ```
      if (/^```\s?$/.test(fullPrefix) && /^(P|DIV)$/.test(block.tagName)) {
        rangeFromBlockStart.deleteContents();
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.innerHTML = block.textContent.trim() ? escapeHtml(block.textContent) : '<br>';
        pre.appendChild(code);
        block.replaceWith(pre);
        placeCaret(code, true);
        return true;
      }
    }

    // 2. Inline Markdown triggers within current text node
    const inlineRules = [
      { regex: /\*\*([^*\s][^*]*)\*\*$/, tag: 'strong' },
      { regex: /__([^_\s][^_]*)__$/, tag: 'strong' },
      { regex: /(?<!\*)\*([^*\s][^*]*)\*$/, tag: 'em' },
      { regex: /~~([^~\s][^~]*)~~$/, tag: 'del' },
      { regex: /`([^`]+)`$/, tag: 'code' },
    ];

    for (const rule of inlineRules) {
      const match = textBeforeCaret.match(rule.regex);
      if (match) {
        const fullMatch = match[0];
        const innerText = match[1];
        const startIdx = offset - fullMatch.length;

        const replaceRange = document.createRange();
        replaceRange.setStart(anchorNode, startIdx);
        replaceRange.setEnd(anchorNode, offset);
        replaceRange.deleteContents();

        const el = document.createElement(rule.tag);
        el.textContent = innerText;
        replaceRange.insertNode(el);

        const spacer = document.createTextNode('\u200B');
        el.after(spacer);
        placeCaret(spacer, false);
        return true;
      }
    }

    return false;
  }

  /**
   * Inserts HTML at the current selection inside the editor.
   */
  function insertHtmlAtCursor(htmlString) {
    ensureSelectionInEditor();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    // If editor is completely empty, set innerHTML directly for clean block structure
    if (isEditorEmpty()) {
      editor.innerHTML = htmlString;
      normalizeTaskLists(editor);
      placeCaret(editor, false);
      emitChange();
      return;
    }

    document.execCommand('insertHTML', false, htmlString);
    normalizeTaskLists(editor);
    emitChange();
  }

  // Toolbar click handler
  toolbar.addEventListener('mousedown', (event) => {
    // Keep focus inside editor when clicking toolbar buttons
    if (event.target.closest('button')) {
      event.preventDefault();
    }
  });

  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-cmd]');
    if (!button || button.disabled) return;
    executeCommand(button.dataset.cmd);
  });

  // Checkbox toggle handler inside editor
  editor.addEventListener('change', (event) => {
    const checkbox = event.target.closest('input.task-checkbox, input[type="checkbox"]');
    if (!checkbox) return;
    const li = checkbox.closest('li.task-item');
    if (li) {
      const checked = checkbox.checked;
      li.dataset.checked = checked ? 'true' : 'false';
      checkbox.toggleAttribute('checked', checked);
    }
    emitChange();
  });

  // Keyboard handling for task lists, code blocks, blockquotes, headings, and shortcuts
  editor.addEventListener('keydown', (event) => {
    const isMod = event.metaKey || event.ctrlKey;

    // Keyboard shortcuts
    if (isMod && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === 'b' && !event.shiftKey) {
        event.preventDefault();
        executeCommand('bold');
        return;
      }
      if (key === 'i' && !event.shiftKey) {
        event.preventDefault();
        executeCommand('italic');
        return;
      }
      if (key === 'x' && event.shiftKey) {
        event.preventDefault();
        executeCommand('strikeThrough');
        return;
      }
      if (key === 'e' && !event.shiftKey) {
        event.preventDefault();
        executeCommand('inlineCode');
        return;
      }
    }

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const block = getActiveBlock();

    // Tab / Shift+Tab inside code blocks or lists
    if (event.key === 'Tab') {
      const inPre = block?.closest('pre');
      if (inPre) {
        event.preventDefault();
        document.execCommand('insertText', false, '  ');
        emitChange();
        return;
      }
    }

    // Enter key behaviors
    if (event.key === 'Enter' && !event.shiftKey) {
      // 1. Inside a code block (<pre>)
      const pre = block?.closest('pre');
      if (pre) {
        event.preventDefault();
        const code = pre.querySelector('code') || pre;
        const afterRange = document.createRange();
        afterRange.setStart(range.endContainer, range.endOffset);
        afterRange.setEnd(code, code.childNodes.length);
        const textAfter = afterRange.toString();

        const beforeRange = document.createRange();
        beforeRange.setStart(code, 0);
        beforeRange.setEnd(range.startContainer, range.startOffset);
        const textBefore = beforeRange.toString();

        // Double Enter at the end of a code block exits into a new paragraph
        if (textAfter === '' && textBefore.endsWith('\n')) {
          // Remove trailing newline from code block
          if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
            range.startContainer.textContent = range.startContainer.textContent.slice(0, -1);
          }
          const p = document.createElement('p');
          p.innerHTML = '<br>';
          pre.after(p);
          placeCaret(p, true);
          emitChange();
          return;
        }

        // Insert a newline inside the code block
        range.deleteContents();
        const newlineNode = document.createTextNode(textAfter === '' ? '\n\n' : '\n');
        range.insertNode(newlineNode);
        const newRange = document.createRange();
        newRange.setStart(newlineNode, 1);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        emitChange();
        return;
      }

      // 2. Inside a task list item (<li class="task-item">)
      const taskItem = block?.closest('li.task-item');
      if (taskItem) {
        event.preventDefault();
        const taskSpan = taskItem.querySelector('.task-text') || taskItem;
        const itemText = taskSpan.textContent.replace(/\u200B/g, '').trim();

        // Empty task item -> exit task list into a regular paragraph
        if (!itemText) {
          const p = document.createElement('p');
          p.innerHTML = '<br>';
          replaceListItemWithBlock(taskItem, p);
          placeCaret(p, true);
          emitChange();
          return;
        }

        // Split task item at cursor into a new unchecked task item
        range.deleteContents();
        const splitRange = document.createRange();
        splitRange.setStart(range.startContainer, range.startOffset);
        splitRange.setEnd(taskSpan, taskSpan.childNodes.length);
        const trailingFrag = splitRange.extractContents();

        const tempDiv = document.createElement('div');
        tempDiv.appendChild(trailingFrag);
        const trailingHtml = tempDiv.innerHTML.trim() || '<br>';

        if (!taskSpan.innerHTML.trim()) {
          taskSpan.innerHTML = '<br>';
        }

        const newTaskItem = createTaskItemElement(false, trailingHtml);
        taskItem.after(newTaskItem);
        placeCaret(newTaskItem.querySelector('.task-text'), true);
        emitChange();
        return;
      }

      // 3. Inside a blockquote: Enter on an empty blockquote exits into paragraph
      const quote = block?.closest('blockquote');
      if (quote && !quote.textContent.replace(/\u200B/g, '').trim()) {
        event.preventDefault();
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        quote.replaceWith(p);
        placeCaret(p, true);
        emitChange();
        return;
      }

      // 4. Inside a heading (H1, H2, H3) at the end of the line: create a paragraph below
      if (block && /^H[1-3]$/.test(block.tagName)) {
        const afterRange = document.createRange();
        afterRange.setStart(range.endContainer, range.endOffset);
        afterRange.setEnd(block, block.childNodes.length);
        if (afterRange.toString().trim() === '') {
          event.preventDefault();
          const p = document.createElement('p');
          p.innerHTML = '<br>';
          block.after(p);
          placeCaret(p, true);
          emitChange();
          return;
        }
      }
    }

    // Backspace key behaviors at the start of special blocks
    if (event.key === 'Backspace' && sel.isCollapsed) {
      const taskItem = block?.closest('li.task-item');
      if (taskItem) {
        const taskSpan = taskItem.querySelector('.task-text') || taskItem;
        const beforeRange = document.createRange();
        beforeRange.setStart(taskSpan, 0);
        beforeRange.setEnd(range.startContainer, range.startOffset);
        if (beforeRange.toString().replace(/\u200B/g, '').length === 0) {
          event.preventDefault();
          const p = document.createElement('p');
          p.innerHTML = taskSpan.innerHTML || '<br>';
          replaceListItemWithBlock(taskItem, p);
          placeCaret(p, true);
          emitChange();
          return;
        }
      }

      if (block && /^(H[1-3]|BLOCKQUOTE|PRE)$/.test(block.tagName)) {
        const beforeRange = document.createRange();
        beforeRange.setStart(block, 0);
        beforeRange.setEnd(range.startContainer, range.startOffset);
        if (beforeRange.toString().replace(/\u200B/g, '').length === 0) {
          event.preventDefault();
          const p = document.createElement('p');
          p.innerHTML =
            block.tagName === 'PRE'
              ? escapeHtml(block.textContent) || '<br>'
              : block.innerHTML || '<br>';
          block.replaceWith(p);
          placeCaret(p, true);
          emitChange();
        }
      }
    }
  });

  // Input event: apply live Markdown shortcuts & notify parent
  editor.addEventListener('input', (event) => {
    // Checkbox toggles fire `input` before `change`; they are handled by the `change` listener.
    // Running normalization here used to read the stale data-checked="true" and re-check the box,
    // which made it impossible to untick a completed task.
    if (event.target instanceof HTMLInputElement) return;
    tryApplyLiveMarkdown();
    emitChange();
  });

  // Paste event: auto-format pasted Markdown or clean HTML
  editor.addEventListener('paste', (event) => {
    if (editor.contentEditable === 'false') return;
    const clipboard = event.clipboardData;
    if (!clipboard) return;

    const plain = clipboard.getData('text/plain');
    const html = clipboard.getData('text/html');
    const block = getActiveBlock();

    // Inside a code block, always paste plain text
    if (block?.closest('pre')) {
      event.preventDefault();
      document.execCommand('insertText', false, plain);
      emitChange();
      return;
    }

    // If pasted plain text contains Markdown syntax, convert it to rich HTML automatically
    if (plain && looksLikeMarkdown(plain)) {
      event.preventDefault();
      const formattedHtml = markdownToHtml(plain);
      insertHtmlAtCursor(formattedHtml);
      return;
    }

    // If clipboard has rich HTML, sanitize and insert it
    if (html && html.trim()) {
      event.preventDefault();
      const clean = sanitizeHtml(html);
      insertHtmlAtCursor(clean);
      return;
    }

    // Fallback for plain text
    if (plain) {
      event.preventDefault();
      if (plain.includes('\n')) {
        insertHtmlAtCursor(markdownToHtml(plain));
      } else {
        document.execCommand('insertText', false, plain);
        emitChange();
      }
    }
  });

  // Keep toolbar active states in sync with cursor movement
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === editor) {
      updateToolbarState();
    }
  });

  return {
    setValue,
    getValue: getSerializedValue,
    getCharacterCount,
    setDisabled,
    focus: () => editor.focus(),
    isFocused: () => editor.contains(document.activeElement),
  };
}
