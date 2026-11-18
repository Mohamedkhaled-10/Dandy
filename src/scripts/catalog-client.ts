/**
 * DANDY COSMETICS — CATALOG INTERACTIVE CONTROLLER (PHASE 5)
 * Wires desktop toolbar + accessible RTL mobile filter drawer + URL sync + DOM slot sorting.
 */

import {
  buildActiveCatalogChips,
  countActiveFilters,
  filterAndSortCatalogItems,
  getDefaultCatalogFilterState,
  normalizeCatalogCategoryParam,
  normalizePriceRange,
  normalizeSortOption,
  parseCatalogQueryState,
  serializeCatalogQueryState,
  type CatalogFilterState,
  type CatalogItemMeta,
} from './catalog';
import { createIconElement } from './icons';

interface SlotRecord {
  el: HTMLElement;
  meta: CatalogItemMeta;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.hasAttribute('hidden') && el.offsetParent !== null
  );
}

export function initCatalogControllers(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const roots = document.querySelectorAll<HTMLElement>('[data-catalog-root]');
  roots.forEach((root) => {
    if (root.dataset.catalogBound === 'true') return;
    root.dataset.catalogBound = 'true';
    setupCatalogRoot(root);
  });
}

function getRuntimeLocale(): 'ar' | 'en' {
  if (typeof document !== 'undefined') {
    const lang = (document.documentElement.getAttribute('lang') || '').trim().toLowerCase();
    if (lang.startsWith('en')) return 'en';
  }
  if (typeof window !== 'undefined') {
    const p = (window.location.pathname || '/').toLowerCase();
    if (p === '/en' || p.startsWith('/en/')) return 'en';
  }
  return 'ar';
}

function setupCatalogRoot(root: HTMLElement): void {
  const gridEl = root.querySelector<HTMLElement>('[data-catalog-grid]');
  if (!gridEl) return;

  const locale = getRuntimeLocale();
  const isEn = locale === 'en';
  const lockedCategorySlug = root.dataset.lockedCategory || null;
  const showCategoryFilter = root.dataset.showCategoryFilter !== 'false';
  const syncUrl = root.dataset.syncUrl !== 'false';

  const slotElements = Array.from(gridEl.querySelectorAll<HTMLElement>('[data-catalog-item]'));
  const slots: SlotRecord[] = slotElements.map((el, fallbackIdx) => ({
    el,
    meta: {
      id: el.dataset.productId || `item-${fallbackIdx}`,
      index: Number.parseInt(el.dataset.index || String(fallbackIdx), 10) || fallbackIdx,
      name: el.dataset.name || '',
      categorySlug: el.dataset.category || 'skin-care',
      categoryLabelAr: el.dataset.categoryLabel || '',
      currentPrice: Number.parseFloat(el.dataset.price || '0') || 0,
      isOnSale: el.dataset.onSale === 'true',
      isBestSeller: el.dataset.bestseller === 'true',
      isSoldOut: el.dataset.soldOut === 'true',
      searchText: (el.dataset.search || '').toLowerCase(),
    },
  }));

  const slotById = new Map<string, HTMLElement>(slots.map((s) => [s.meta.id, s.el]));
  const allMeta = slots.map((s) => s.meta);

  // Controls references (desktop + drawer)
  const searchInputs = Array.from(root.querySelectorAll<HTMLInputElement>('[data-catalog-search]'));
  const clearSearchButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-clear-search]'));
  const categoryButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-filter-category]'));
  const categoryCheckboxes = Array.from(root.querySelectorAll<HTMLInputElement>('[data-drawer-category]'));
  const priceSelects = Array.from(root.querySelectorAll<HTMLSelectElement>('[data-filter-price]'));
  const sortSelects = Array.from(root.querySelectorAll<HTMLSelectElement>('[data-catalog-sort]'));
  const toggleButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-filter-toggle]'));
  const drawerCheckboxes = Array.from(root.querySelectorAll<HTMLInputElement>('[data-drawer-toggle]'));
  const resetButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-catalog-reset]'));

  const countOutputs = Array.from(root.querySelectorAll<HTMLElement>('[data-catalog-count]'));
  const mobileBadge = root.querySelector<HTMLElement>('[data-mobile-filter-count]');
  const chipsBar = root.querySelector<HTMLElement>('[data-catalog-chips-bar]');
  const chipsList = root.querySelector<HTMLElement>('[data-catalog-chips-list]');
  const emptyState = root.querySelector<HTMLElement>('[data-catalog-empty]');

  // Drawer elements
  const drawerTrigger = root.querySelector<HTMLButtonElement>('[data-open-filter-drawer]');
  const drawer = document.querySelector<HTMLElement>('#dandyFilterDrawer');
  const drawerBackdrop = document.querySelector<HTMLElement>('#dandyFilterBackdrop');
  const drawerCloseBtns = drawer ? Array.from(drawer.querySelectorAll<HTMLButtonElement>('[data-close-filter-drawer]')) : [];
  const drawerApplyBtn = drawer?.querySelector<HTMLButtonElement>('[data-apply-filter-drawer]') || null;
  const drawerResetBtn = drawer?.querySelector<HTMLButtonElement>('[data-reset-filter-drawer]') || null;

  let state: CatalogFilterState = parseCatalogQueryState(window.location.search, { lockedCategorySlug });
  let lastFocusedEl: HTMLElement | null = null;
  let drawerOpen = false;

  function syncControlsFromState(targetState: CatalogFilterState): void {
    searchInputs.forEach((input) => {
      if (input.value !== targetState.search) {
        input.value = targetState.search;
      }
    });

    const hasSearch = targetState.search.trim().length > 0;
    clearSearchButtons.forEach((btn) => {
      btn.hidden = !hasSearch;
    });

    categoryButtons.forEach((btn) => {
      const catVal = btn.dataset.filterCategory || 'all';
      const isPressed =
        catVal === 'all'
          ? targetState.categories.length === 0
          : targetState.categories.includes(catVal);
      btn.setAttribute('aria-pressed', isPressed ? 'true' : 'false');
      btn.classList.toggle('is-active', isPressed);
    });

    categoryCheckboxes.forEach((chk) => {
      chk.checked = targetState.categories.includes(chk.value);
    });

    priceSelects.forEach((sel) => {
      sel.value = targetState.priceRange;
    });

    sortSelects.forEach((sel) => {
      sel.value = targetState.sort;
    });

    toggleButtons.forEach((btn) => {
      const key = btn.dataset.filterToggle as 'saleOnly' | 'bestSellerOnly' | 'inStockOnly';
      const isActive = Boolean(targetState[key]);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      btn.classList.toggle('is-active', isActive);
    });

    drawerCheckboxes.forEach((chk) => {
      const key = chk.dataset.drawerToggle as 'saleOnly' | 'bestSellerOnly' | 'inStockOnly';
      chk.checked = Boolean(targetState[key]);
    });
  }

  function renderChips(targetState: CatalogFilterState): void {
    if (!chipsBar || !chipsList) return;
    const chips = buildActiveCatalogChips(targetState, { showCategoryFilter }, locale);
    const activeCount = chips.length;

    if (mobileBadge) {
      mobileBadge.textContent = String(activeCount);
      mobileBadge.hidden = activeCount === 0;
    }

    if (chips.length === 0) {
      chipsBar.hidden = true;
      chipsList.innerHTML = '';
      return;
    }

    chipsBar.hidden = false;
    chipsList.innerHTML = '';

    chips.forEach((chip) => {
      const chipBtn = document.createElement('button');
      chipBtn.type = 'button';
      chipBtn.className = 'dandy-filter-chip';
      chipBtn.setAttribute('aria-label', isEn ? `Remove filter ${chip.label}` : `إزالة فلتر ${chip.label}`);

      const textSpan = document.createElement('span');
      textSpan.textContent = chip.label;
      chipBtn.appendChild(textSpan);

      const xIcon = createIconElement(document, 'x', { size: 13, strokeWidth: 2 });
      chipBtn.appendChild(xIcon);

      chipBtn.addEventListener('click', () => {
        if (chip.key === 'search') state.search = '';
        else if (chip.key === 'category') state.categories = state.categories.filter((c) => c !== chip.value);
        else if (chip.key === 'priceRange') state.priceRange = 'all';
        else if (chip.key === 'saleOnly') state.saleOnly = false;
        else if (chip.key === 'inStockOnly') state.inStockOnly = false;
        else if (chip.key === 'bestSellerOnly') state.bestSellerOnly = false;
        applyState();
      });

      chipsList.appendChild(chipBtn);
    });
  }

  function updateUrlFromState(targetState: CatalogFilterState): void {
    if (!syncUrl) return;
    const nextQuery = serializeCatalogQueryState(targetState, { lockedCategorySlug });
    const nextUrl = nextQuery
      ? `${window.location.pathname}?${nextQuery}${window.location.hash}`
      : `${window.location.pathname}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, '', nextUrl);
    }
  }

  function applyState(options: { updateUrl?: boolean } = {}): void {
    const filtered = filterAndSortCatalogItems(allMeta, state, locale);
    const visibleIds = new Set(filtered.map((item) => item.id));

    // Toggle visibility on slots
    slots.forEach(({ el, meta }) => {
      el.hidden = !visibleIds.has(meta.id);
    });

    // Re-append visible slots in sorted order, followed by hidden slots
    const fragment = document.createDocumentFragment();
    filtered.forEach((item) => {
      const el = slotById.get(item.id);
      if (el) fragment.appendChild(el);
    });
    slots.forEach(({ el, meta }) => {
      if (!visibleIds.has(meta.id)) fragment.appendChild(el);
    });
    gridEl.appendChild(fragment);

    // Update counts
    const countText = isEn
      ? filtered.length === allMeta.length
        ? `${filtered.length} ${filtered.length === 1 ? 'product' : 'products'}`
        : `${filtered.length} of ${allMeta.length} products`
      : filtered.length === allMeta.length
        ? `${filtered.length} منتج`
        : `${filtered.length} من ${allMeta.length} منتج`;
    countOutputs.forEach((el) => {
      el.textContent = countText;
    });

    if (emptyState) {
      emptyState.hidden = !(allMeta.length > 0 && filtered.length === 0);
    }

    gridEl.hidden = filtered.length === 0 && allMeta.length > 0;

    syncControlsFromState(state);
    renderChips(state);

    if (options.updateUrl !== false) {
      updateUrlFromState(state);
    }

    document.dispatchEvent(new CustomEvent('dandy:catalog-updated', { detail: { grid: gridEl } }));
  }

  function resetAllFilters(): void {
    state = getDefaultCatalogFilterState();
    applyState();
  }

  // Search input handlers
  searchInputs.forEach((input) => {
    input.addEventListener('input', () => {
      state.search = input.value;
      applyState();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && input.value.trim()) {
        event.stopPropagation();
        state.search = '';
        applyState();
      }
    });
  });

  clearSearchButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.search = '';
      applyState();
      searchInputs[0]?.focus();
    });
  });

  // Desktop category filter buttons (multi-select or clear via 'all')
  categoryButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const rawCat = btn.dataset.filterCategory || 'all';
      if (rawCat === 'all') {
        state.categories = [];
      } else {
        const slug = normalizeCatalogCategoryParam(rawCat) || rawCat;
        if (state.categories.includes(slug)) {
          state.categories = state.categories.filter((c) => c !== slug);
        } else {
          state.categories = [...state.categories, slug];
        }
      }
      applyState();
    });
  });

  // Price & Sort selects
  priceSelects.forEach((sel) => {
    sel.addEventListener('change', () => {
      state.priceRange = normalizePriceRange(sel.value);
      applyState();
    });
  });

  sortSelects.forEach((sel) => {
    sel.addEventListener('change', () => {
      state.sort = normalizeSortOption(sel.value);
      applyState();
    });
  });

  // Desktop quick toggle buttons
  toggleButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.filterToggle as 'saleOnly' | 'bestSellerOnly' | 'inStockOnly';
      state[key] = !state[key];
      applyState();
    });
  });

  // Global reset buttons
  resetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      resetAllFilters();
    });
  });

  // Accessible RTL Mobile Filter Drawer
  function openDrawer(): void {
    if (!drawer || !drawerBackdrop || drawerOpen) return;
    drawerOpen = true;
    lastFocusedEl = document.activeElement as HTMLElement | null;
    syncControlsFromState(state);

    drawer.hidden = false;
    drawerBackdrop.hidden = false;
    requestAnimationFrame(() => {
      drawer.classList.add('is-open');
      drawerBackdrop.classList.add('is-open');
    });

    drawerTrigger?.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';

    const focusables = getFocusableElements(drawer);
    focusables[0]?.focus();
  }

  function closeDrawer(restoreFocus = true): void {
    if (!drawer || !drawerBackdrop || !drawerOpen) return;
    drawerOpen = false;
    drawer.classList.remove('is-open');
    drawerBackdrop.classList.remove('is-open');
    drawerTrigger?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';

    window.setTimeout(() => {
      if (!drawerOpen) {
        drawer.hidden = true;
        drawerBackdrop.hidden = true;
      }
    }, 220);

    if (restoreFocus && lastFocusedEl) {
      lastFocusedEl.focus();
    }
  }

  function readDrawerDraftIntoState(): void {
    if (!drawer) return;
    if (showCategoryFilter) {
      const selectedCats = categoryCheckboxes.filter((c) => c.checked).map((c) => c.value);
      state.categories = Array.from(new Set(selectedCats));
    }

    const drawerPrice = drawer.querySelector<HTMLSelectElement>('[data-filter-price]');
    if (drawerPrice) {
      state.priceRange = normalizePriceRange(drawerPrice.value);
    }

    const drawerSort = drawer.querySelector<HTMLSelectElement>('[data-catalog-sort]');
    if (drawerSort) {
      state.sort = normalizeSortOption(drawerSort.value);
    }

    drawerCheckboxes.forEach((chk) => {
      const key = chk.dataset.drawerToggle as 'saleOnly' | 'bestSellerOnly' | 'inStockOnly';
      state[key] = chk.checked;
    });
  }

  drawerTrigger?.addEventListener('click', openDrawer);
  drawerCloseBtns.forEach((btn) => btn.addEventListener('click', () => closeDrawer(true)));
  drawerBackdrop?.addEventListener('click', () => closeDrawer(true));

  drawerApplyBtn?.addEventListener('click', () => {
    readDrawerDraftIntoState();
    applyState();
    closeDrawer(true);
  });

  drawerResetBtn?.addEventListener('click', () => {
    resetAllFilters();
    closeDrawer(true);
  });

  // Live preview count inside drawer without losing drawer state
  if (drawer) {
    drawer.addEventListener('change', () => {
      readDrawerDraftIntoState();
      applyState();
    });

    document.addEventListener('keydown', (event: KeyboardEvent) => {
      if (!drawerOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer(true);
        return;
      }
      if (event.key === 'Tab') {
        const focusables = getFocusableElements(drawer);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  }

  // Handle browser back/forward navigation cleanly
  window.addEventListener('popstate', () => {
    state = parseCatalogQueryState(window.location.search, { lockedCategorySlug });
    applyState({ updateUrl: false });
  });

  // Initial synchronous hydration on mount
  const activeCountInitial = countActiveFilters(state, { showCategoryFilter });
  if (activeCountInitial > 0 || state.sort !== 'default') {
    applyState({ updateUrl: false });
  } else {
    syncControlsFromState(state);
    renderChips(state);
  }
}
