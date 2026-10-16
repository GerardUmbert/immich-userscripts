// ==UserScript==
// @name         Immich: sort search results
// @description  Sorts the search results by date added (the default), video length, file size or name, with a sort menu in the top bar.
// @version      1.1.0
// @updateURL    https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-search-sort-added.user.js
// @downloadURL  https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-search-sort-added.user.js
// @include      /^https?:\/\/immich\..*/
// @run-at       document-start
// @grant        none
// ==/UserScript==

// Runs on any site whose host starts with "immich." (for example immich.yourdomain.com).
// For another address (an IP or localhost), change the @include line above.
//
// How it works: the search API cannot order by upload date, video length or name. Smart search
// is ordered by relevance and has no ordering option; metadata search only orders by capture
// date, local date, file size or rating. So the script does the sorting itself: when the search
// page asks for its first page of results, the script fetches every remaining page of the same
// search, sorts all the assets, and hands the app one combined page with nothing after it.
//
// Side effects: the whole result set is loaded up front (a big search takes longer to show),
// and the relevance order of smart search is lost while a sort is applied. Loading stops
// after MAX_PAGES pages as a safety limit.
//
// The sort menu in the top bar offers: date added (the default), Immich's own order, longest or
// shortest video first, largest or smallest file first, and name. Items without a length
// (photos) go last in the length orders. The choice is never remembered, so every page load
// starts with date added again.

(() => {
  'use strict';

  const PENDING_KEY = 'immich-userscript:search:sort-once';
  const SEARCH_PAGE = /^\/search(\/|$)/;
  const SEARCH_API = /\/api\/search\/(metadata|smart)$/;
  const MAX_PAGES = 40;

  // Assets that lack the value (photos have no length) go last in both directions.
  const missingLast = (value, a, b, descending) => {
    const x = value(a);
    const y = value(b);
    if (x === null || y === null) {
      return (x === null) - (y === null);
    }
    return descending ? y - x : x - y;
  };
  const duration = (asset) => (typeof asset.duration === 'number' ? asset.duration : null);
  const size = (asset) => (typeof asset.exifInfo?.fileSizeInByte === 'number' ? asset.exifInfo.fileSizeInByte : null);

  // Each order: its label in the menu and how to compare two assets (negative = a first).
  // A null compare means Immich's own order, left alone.
  const SORTS = {
    added: {
      label: 'Date added (newest first)',
      compare: (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0),
    },
    taken: { label: "Immich's own order", compare: null },
    longest: { label: 'Longest video first', compare: (a, b) => missingLast(duration, a, b, true) },
    shortest: { label: 'Shortest video first', compare: (a, b) => missingLast(duration, a, b, false) },
    largest: { label: 'Largest file first', compare: (a, b) => missingLast(size, a, b, true) },
    smallest: { label: 'Smallest file first', compare: (a, b) => missingLast(size, a, b, false) },
    name: {
      label: 'Name (A to Z)',
      compare: (a, b) =>
        (a.originalFileName ?? '').localeCompare(b.originalFileName ?? '', undefined, { numeric: true, sensitivity: 'base' }),
    },
  };

  // Switching the order has to reload the page (the results load once), so the choice is
  // handed to that single reload through sessionStorage and then forgotten.
  const takePending = () => {
    try {
      const value = sessionStorage.getItem(PENDING_KEY);
      sessionStorage.removeItem(PENDING_KEY);
      return value in SORTS ? value : 'added';
    } catch {
      return 'added';
    }
  };

  let mode = takePending();

  const onSearchPage = () => SEARCH_PAGE.test(location.pathname);
  const sortsMyself = () => onSearchPage() && SORTS[mode].compare !== null;

  // --- request and response rewriting --------------------------------------

  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    try {
      if (sortsMyself()) {
        const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const url = new URL(raw, location.href);
        const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
        if (method === 'POST' && url.origin === location.origin && SEARCH_API.test(url.pathname)) {
          const sorted = await fetchAllSorted(url.href, input, init);
          if (sorted) {
            return sorted;
          }
        }
      }
    } catch {
      // never break the app over a rewrite failure
    }
    return originalFetch.call(this, input, init);
  };

  const readBody = async (input, init) => {
    const body = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
    return typeof body === 'string' ? JSON.parse(body) : undefined;
  };

  const post = (href, input, init, body) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('content-type', 'application/json');
    return originalFetch.call(window, href, {
      method: 'POST',
      headers,
      credentials: init?.credentials ?? 'same-origin',
      signal: init?.signal,
      body: JSON.stringify(body),
    });
  };

  // Load all pages of the search the app just asked for and return them as one sorted page.
  // Returns null (so the app's own request goes through untouched) if anything looks off.
  const fetchAllSorted = async (href, input, init) => {
    const body = await readBody(input, init);
    if (!body || typeof body !== 'object') {
      return null;
    }

    const first = await post(href, input, init, body);
    if (!first.ok) {
      return first;
    }
    const data = await first.clone().json();
    if (!Array.isArray(data?.assets?.items)) {
      return first;
    }

    // the app asks for the first page only; a later page means it is not the one we merged
    if ((body.page ?? 1) !== 1 || body.cursor) {
      return first;
    }

    const items = [...data.assets.items];
    let nextPage = data.assets.nextPage;
    let nextCursor = data.assets.nextCursor;
    for (let n = 1; n < MAX_PAGES && (nextCursor || nextPage); n++) {
      const next = nextCursor ? { ...body, cursor: nextCursor } : { ...body, page: Number(nextPage) };
      const response = await post(href, input, init, next);
      if (!response.ok) {
        break;
      }
      const page = (await response.json())?.assets;
      if (!Array.isArray(page?.items)) {
        break;
      }
      items.push(...page.items);
      nextPage = page.nextPage;
      nextCursor = page.nextCursor;
    }

    items.sort(SORTS[mode].compare);

    data.assets = { ...data.assets, items, count: items.length, nextPage: null, nextCursor: null };
    const headers = new Headers(first.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    return new Response(JSON.stringify(data), { status: first.status, statusText: first.statusText, headers });
  };

  // --- sort menu -----------------------------------------------------------

  // mdiSort from @mdi/js, the icon set Immich uses
  const ICON = 'M3 13H9V11H3V13M3 6V8H21V6H3M3 18H15V16H3V18Z';

  let button;
  let caption;
  let menu;

  const onOutside = (event) => {
    if (menu && !menu.contains(event.target) && !button?.contains(event.target)) {
      closeMenu();
    }
  };

  const onKey = (event) => {
    if (event.key === 'Escape') {
      closeMenu();
    }
  };

  const closeMenu = () => {
    menu?.remove();
    menu = undefined;
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
  };

  const choose = (key) => {
    closeMenu();
    if (key === mode) {
      return;
    }
    try {
      sessionStorage.setItem(PENDING_KEY, key);
    } catch {
      // storage blocked: the order will just switch back after the reload
    }
    // the results load once, so reload to fetch them in the other order
    location.reload();
  };

  const openMenu = () => {
    if (menu) {
      closeMenu();
      return;
    }
    const dark = document.documentElement.classList.contains('dark');
    menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    menu.style.cssText = [
      'position:absolute',
      'top:calc(100% + 4px)',
      'right:0',
      'z-index:70',
      'min-width:220px',
      'padding:6px',
      'border-radius:16px',
      'border:1px solid rgba(128,128,128,.35)',
      'box-shadow:0 8px 24px rgba(0,0,0,.25)',
      `background:${dark ? '#1a1b1e' : '#fff'}`,
      `color:${dark ? '#e5e7eb' : '#1f2937'}`,
    ].join(';');

    for (const [key, { label }] of Object.entries(SORTS)) {
      const selected = key === mode;
      const resting = selected ? 'rgba(128,128,128,.25)' : 'transparent';
      const item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', String(selected));
      item.textContent = `${selected ? '✓' : ' '} ${label}`;
      item.style.cssText = [
        'display:block',
        'width:100%',
        'padding:8px 12px',
        'border:0',
        'border-radius:10px',
        `background:${resting}`,
        'color:inherit',
        'font:inherit',
        'font-size:14px',
        'text-align:start',
        'white-space:nowrap',
        'cursor:pointer',
      ].join(';');
      item.addEventListener('mouseenter', () => (item.style.background = 'rgba(128,128,128,.18)'));
      item.addEventListener('mouseleave', () => (item.style.background = resting));
      item.addEventListener('click', () => choose(key));
      menu.append(item);
    }
    button.append(menu);
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
  };

  const createButton = () => {
    const el = document.createElement('div');
    // the search field is centred in the top bar, so the control sits at the bar's right end
    el.style.cssText = 'position:absolute;top:50%;right:24px;transform:translateY(-50%);z-index:1';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.title = 'Sort the results';
    trigger.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'gap:8px',
      'padding:6px 14px',
      'border:1px solid rgba(128,128,128,.4)',
      'border-radius:9999px',
      'background:rgba(128,128,128,.18)',
      'backdrop-filter:blur(6px)',
      'color:inherit',
      'font:inherit',
      'font-size:14px',
      'cursor:pointer',
      'white-space:nowrap',
    ].join(';');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('fill', 'currentColor');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICON);
    svg.append(path);

    caption = document.createElement('span');
    caption.textContent = SORTS[mode].label;
    trigger.append(svg, caption);
    trigger.addEventListener('click', openMenu);
    el.append(trigger);
    return el;
  };

  const sync = () => {
    if (!onSearchPage()) {
      // left the search: the next visit sorts by date added again
      mode = 'added';
      closeMenu();
      button?.remove();
      button = undefined;
      return;
    }
    // the top bar ("control-bar") is absolutely positioned, so it anchors the control
    const bar = document.getElementById('control-bar');
    if (!bar) {
      button?.remove();
      button = undefined;
      return;
    }
    if (!button || !bar.contains(button)) {
      button = createButton();
      bar.append(button);
    }
  };

  // Immich is a single-page app, so watch for navigation instead of page loads.
  setInterval(sync, 500);
})();
