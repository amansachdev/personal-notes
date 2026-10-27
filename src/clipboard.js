import { escapeHtml } from './markdown.js';

export const CLIPBOARD_DOC_ID = 'clipboard_data';

export const CATEGORIES = [
  { id: 'linkedin', label: 'LinkedIn', icon: 'in', placeholderLabel: 'LinkedIn Profile', placeholderValue: 'https://linkedin.com/in/your-handle' },
  { id: 'github', label: 'GitHub', icon: '⌘', placeholderLabel: 'GitHub Profile', placeholderValue: 'https://github.com/your-username' },
  { id: 'resume', label: 'Resume', icon: '📄', placeholderLabel: 'Resume Link / Bio', placeholderValue: 'https://drive.google.com/...' },
  { id: 'link', label: 'Link', icon: '🔗', placeholderLabel: 'Portfolio / Website', placeholderValue: 'https://example.com' },
  { id: 'address', label: 'Address', icon: '📍', placeholderLabel: 'Home / Office Address', placeholderValue: '123 Main Street, Apt 4B, City, State, ZIP' },
  { id: 'text', label: 'Important Text', icon: '¶', placeholderLabel: 'Important Snippet', placeholderValue: 'Paste frequently used text, phone, email, or template…' },
];

function getCategoryMeta(categoryId) {
  return CATEGORIES.find((cat) => cat.id === categoryId) || CATEGORIES[CATEGORIES.length - 1];
}

function isLikelyUrl(value = '') {
  return /^https?:\/\/\S+$/i.test(String(value).trim());
}

export function parseClipboardItems(rawText = '') {
  if (!rawText) return [];
  try {
    const parsed = JSON.parse(rawText);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item === 'object' && item.id && item.value);
  } catch {
    return [];
  }
}

export function serializeClipboardItems(items = []) {
  return JSON.stringify(items);
}

async function copyTextToSystemClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const temp = document.createElement('textarea');
  temp.value = text;
  temp.setAttribute('readonly', '');
  temp.style.position = 'fixed';
  temp.style.opacity = '0';
  document.body.appendChild(temp);
  temp.select();
  document.execCommand('copy');
  document.body.removeChild(temp);
}

export function createDataClipboard({
  panel,
  toggleBtn,
  countBadge,
  dialog,
  onSaveItems,
  onStatusChange,
}) {
  let items = [];
  let activeFilter = 'all';
  let searchQuery = '';
  let editingItemId = null;
  let copiedItemId = null;
  let copiedTimer = null;

  const isOpenKey = 'notepad_data_panel_open';
  const storedOpen = localStorage.getItem(isOpenKey);
  let isOpen = storedOpen !== null ? storedOpen === 'true' : window.innerWidth > 600;

  const listEl = panel.querySelector('#data-list');
  const filterBar = panel.querySelector('#data-filters');
  const searchInput = panel.querySelector('#data-search');
  const addBtn = panel.querySelector('#add-data-btn');
  const closePanelBtn = panel.querySelector('#close-data-panel');

  const form = dialog.querySelector('#data-form');
  const dialogTitle = dialog.querySelector('#data-dialog-title');
  const categoryContainer = dialog.querySelector('#data-category-chips');
  const labelInput = dialog.querySelector('#data-label-input');
  const valueInput = dialog.querySelector('#data-value-input');
  const cancelBtn = dialog.querySelector('#cancel-data-dialog');
  let selectedCategory = 'linkedin';

  function updatePanelVisibility() {
    panel.classList.toggle('open', isOpen);
    toggleBtn.classList.toggle('active', isOpen);
    toggleBtn.setAttribute('aria-expanded', String(isOpen));
    localStorage.setItem(isOpenKey, String(isOpen));
  }

  function renderCategoryChips() {
    categoryContainer.innerHTML = CATEGORIES.map((cat) => {
      const active = cat.id === selectedCategory;
      return `<button type="button" class="category-chip ${active ? 'active' : ''}" data-category="${cat.id}">
        <span class="chip-icon">${escapeHtml(cat.icon)}</span>
        <span>${escapeHtml(cat.label)}</span>
      </button>`;
    }).join('');

    const meta = getCategoryMeta(selectedCategory);
    labelInput.placeholder = meta.placeholderLabel;
    valueInput.placeholder = meta.placeholderValue;
  }

  function renderFilters() {
    const usedCategories = new Set(items.map((item) => item.category));
    const filterOptions = [
      { id: 'all', label: 'All' },
      ...CATEGORIES.filter((cat) => usedCategories.has(cat.id)),
    ];

    if (activeFilter !== 'all' && !usedCategories.has(activeFilter)) {
      activeFilter = 'all';
    }

    filterBar.innerHTML = filterOptions
      .map((opt) => {
        const active = opt.id === activeFilter;
        return `<button type="button" class="data-filter-chip ${active ? 'active' : ''}" data-filter="${opt.id}">${escapeHtml(opt.label)}</button>`;
      })
      .join('');
  }

  function renderItems() {
    countBadge.textContent = String(items.length);
    renderFilters();

    const q = searchQuery.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (activeFilter !== 'all' && item.category !== activeFilter) return false;
      if (!q) return true;
      return (
        (item.label && item.label.toLowerCase().includes(q)) ||
        (item.value && item.value.toLowerCase().includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q))
      );
    });

    if (items.length === 0) {
      listEl.innerHTML = `
        <div class="data-empty">
          <div class="data-empty-title">Your persistent clipboard is empty</div>
          <p>Save your LinkedIn, GitHub, resume links, addresses, and important snippets here to copy them with a single click anytime.</p>
          <div class="quick-preset-row">
            ${CATEGORIES.map(
              (cat) =>
                `<button type="button" class="preset-add-btn" data-quick-cat="${cat.id}">＋ ${escapeHtml(cat.label)}</button>`,
            ).join('')}
          </div>
        </div>
      `;
      return;
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="data-empty"><p>No matching items found.</p></div>`;
      return;
    }

    listEl.innerHTML = filtered
      .map((item) => {
        const meta = getCategoryMeta(item.category);
        const isCopied = copiedItemId === item.id;
        const isUrl = isLikelyUrl(item.value);
        return `
          <div class="data-card ${isCopied ? 'copied' : ''}" data-action="copy" data-id="${escapeHtml(item.id)}" role="button" tabindex="0" title="Click to copy ${escapeHtml(item.label)}">
            <div class="data-card-header">
              <div class="data-card-title-wrap">
                <span class="data-cat-badge" data-cat="${escapeHtml(meta.id)}">${escapeHtml(meta.icon)} ${escapeHtml(meta.label)}</span>
                <span class="data-card-label">${escapeHtml(item.label || meta.label)}</span>
              </div>
              <div class="data-card-actions">
                <span class="copy-hint">${isCopied ? '✓ Copied' : 'Copy'}</span>
                ${
                  isUrl
                    ? `<a class="data-icon-btn" href="${escapeHtml(item.value.trim())}" target="_blank" rel="noreferrer" data-action="open-link" title="Open link in new tab" aria-label="Open ${escapeHtml(item.label)}">↗</a>`
                    : ''
                }
                <button type="button" class="data-icon-btn" data-action="edit" data-id="${escapeHtml(item.id)}" title="Edit item" aria-label="Edit ${escapeHtml(item.label)}">✎</button>
                <button type="button" class="data-icon-btn delete" data-action="delete" data-id="${escapeHtml(item.id)}" title="Delete item" aria-label="Delete ${escapeHtml(item.label)}">×</button>
              </div>
            </div>
            <div class="data-card-value">${escapeHtml(item.value)}</div>
          </div>
        `;
      })
      .join('');
  }

  function openAddDialog(defaultCategory = 'linkedin') {
    editingItemId = null;
    selectedCategory = defaultCategory;
    dialogTitle.textContent = 'Add to Data Clipboard';
    renderCategoryChips();
    const meta = getCategoryMeta(selectedCategory);
    labelInput.value = meta.placeholderLabel;
    valueInput.value = '';
    dialog.showModal();
    valueInput.focus();
  }

  function openEditDialog(item) {
    editingItemId = item.id;
    selectedCategory = item.category || 'text';
    dialogTitle.textContent = 'Edit Clipboard Item';
    renderCategoryChips();
    labelInput.value = item.label || '';
    valueInput.value = item.value || '';
    dialog.showModal();
    valueInput.focus();
  }

  async function handleCopy(id) {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    try {
      await copyTextToSystemClipboard(item.value);
      copiedItemId = id;
      clearTimeout(copiedTimer);
      renderItems();
      onStatusChange?.(`Copied “${item.label}” to clipboard`);
      copiedTimer = setTimeout(() => {
        copiedItemId = null;
        renderItems();
      }, 1600);
    } catch (error) {
      onStatusChange?.('Could not copy to clipboard', 'error');
      console.error(error);
    }
  }

  async function handleDelete(id) {
    const item = items.find((entry) => entry.id === id);
    if (!item || !window.confirm(`Remove “${item.label}” from your Data Clipboard?`)) return;
    const nextItems = items.filter((entry) => entry.id !== id);
    items = nextItems;
    renderItems();
    await onSaveItems(nextItems);
  }

  // Event listeners
  toggleBtn.addEventListener('click', () => {
    isOpen = !isOpen;
    updatePanelVisibility();
  });

  closePanelBtn.addEventListener('click', () => {
    isOpen = false;
    updatePanelVisibility();
  });

  addBtn.addEventListener('click', () => openAddDialog('linkedin'));

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderItems();
  });

  filterBar.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-filter]');
    if (!btn) return;
    activeFilter = btn.dataset.filter;
    renderItems();
  });

  categoryContainer.addEventListener('click', (event) => {
    const chip = event.target.closest('button[data-category]');
    if (!chip) return;
    const prevMeta = getCategoryMeta(selectedCategory);
    selectedCategory = chip.dataset.category;
    const nextMeta = getCategoryMeta(selectedCategory);
    if (!editingItemId && (!labelInput.value.trim() || labelInput.value === prevMeta.placeholderLabel)) {
      labelInput.value = nextMeta.placeholderLabel;
    }
    renderCategoryChips();
    valueInput.focus();
  });

  listEl.addEventListener('click', (event) => {
    const quickBtn = event.target.closest('button[data-quick-cat]');
    if (quickBtn) {
      openAddDialog(quickBtn.dataset.quickCat);
      return;
    }

    const openLink = event.target.closest('[data-action="open-link"]');
    if (openLink) {
      event.stopPropagation();
      return;
    }

    const actionBtn = event.target.closest('button[data-action]');
    if (actionBtn) {
      event.stopPropagation();
      const { action, id } = actionBtn.dataset;
      if (action === 'edit') {
        const item = items.find((entry) => entry.id === id);
        if (item) openEditDialog(item);
      } else if (action === 'delete') {
        handleDelete(id);
      }
      return;
    }

    const card = event.target.closest('.data-card[data-action="copy"]');
    if (card) {
      handleCopy(card.dataset.id);
    }
  });

  listEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      const card = event.target.closest('.data-card[data-action="copy"]');
      if (card && event.target === card) {
        event.preventDefault();
        handleCopy(card.dataset.id);
      }
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const meta = getCategoryMeta(selectedCategory);
    const label = labelInput.value.trim() || meta.label;
    const value = valueInput.value.trim();
    if (!value) return;

    let nextItems;
    if (editingItemId) {
      nextItems = items.map((entry) =>
        entry.id === editingItemId
          ? { ...entry, category: selectedCategory, label, value, updatedAt: Date.now() }
          : entry,
      );
    } else {
      const newItem = {
        id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        category: selectedCategory,
        label,
        value,
        createdAt: Date.now(),
      };
      nextItems = [newItem, ...items];
    }

    items = nextItems;
    renderItems();
    dialog.close();
    await onSaveItems(nextItems);
  });

  cancelBtn.addEventListener('click', () => dialog.close());

  updatePanelVisibility();
  renderItems();

  return {
    setItems(nextItems = []) {
      items = nextItems;
      renderItems();
    },
    getItems() {
      return items;
    },
  };
}
