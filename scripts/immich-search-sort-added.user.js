// ==UserScript==
// @name         Immich: sort search results by date added
// @description  Orders the search results by upload date (newest first), with a button to switch back to Immich's own order.
// @version      1.0.1
// @updateURL    https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-search-sort-added.user.js
// @downloadURL  https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-search-sort-added.user.js
// @include      /^https?:\/\/immich\..*/
// @run-at       document-start
// @grant        none
// ==/UserScript==

// Runs on any site whose host starts with "immich." (for example immich.yourdomain.com).
// For another address (an IP or localhost), change the @include line above.
//
// How it works: the search API cannot order by upload date. Smart search is ordered by
// relevance and has no ordering option; metadata search only orders by capture date, local
// date, file size or rating. So the script does the sorting itself: when the search page asks
// for its first page of results, the script fetches every remaining page of the same search,
// sorts all the assets by their upload date (createdAt), and hands the app one combined page
// with nothing after it.
//
// Side effects: the whole result set is loaded up front (a big search takes longer to show),
// and the relevance order of smart search is lost while sorted by date added. Loading stops
// after MAX_PAGES pages as a safety limit.
//
// The default is date added. The button, in the top bar next to the search field, switches to Immich's own order for that visit; it is
// never remembered, so every page load starts with date added again.

(() => {
  'use strict';

  const PENDING_KEY = 'immich-userscript:search:own-order-once';
  const SEARCH_PAGE = /^\/search(\/|$)/;
  const SEARCH_API = /\/api\/search\/(metadata|smart)$/;
  const MAX_PAGES = 40;

  // Switching the order has to reload the page (the results load once), so the choice is
  // handed to that single reload through sessionStorage and then forgotten.
  const takePending = () => {
    try {
      const value = sessionStorage.getItem(PENDING_KEY);
      sessionStorage.removeItem(PENDING_KEY);
      return value === '1';
    } catch {
      return false;
    }
  };

  let ownOrder = takePending();

  const onSearchPage = () => SEARCH_PAGE.test(location.pathname);
  const sortsByAdded = () => onSearchPage() && !ownOrder;

  // --- request and response rewriting --------------------------------------

  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    try {
      if (sortsByAdded()) {
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

    const time = (asset) => Date.parse(asset.createdAt) || 0;
    items.sort((a, b) => time(b) - time(a));

    data.assets = { ...data.assets, items, count: items.length, nextPage: null, nextCursor: null };
    const headers = new Headers(first.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    return new Response(JSON.stringify(data), { status: first.status, statusText: first.statusText, headers });
  };

  // --- sort button ---------------------------------------------------------

  // mdiCalendarPlus / mdiCameraOutline from @mdi/js, the icon set Immich uses
  const ICON_ADDED =
    'M19 19V8H5V19H19M16 1H18V3H19C20.11 3 21 3.9 21 5V19C21 20.11 20.11 21 19 21H5C3.89 21 3 20.1 3 19V5C3 3.89 3.89 3 5 3H6V1H8V3H16V1M11 9.5H13V12.5H16V14.5H13V17.5H11V14.5H8V12.5H11V9.5Z';
  const ICON_OWN =
    'M20,4H16.83L15,2H9L7.17,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6A2,2 0 0,0 20,4M20,18H4V6H8.05L9.88,4H14.12L15.95,6H20V18M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15Z';

  let button;
  let caption;

  const render = () => {
    const added = sortsByAdded();
    button.querySelector('path').setAttribute('d', added ? ICON_ADDED : ICON_OWN);
    caption.textContent = added ? 'Sorted by date added' : "Immich's own order";
    button.title = added ? "Click to use Immich's own order" : 'Click to sort by date added';
  };

  const createButton = () => {
    const el = document.createElement('button');
    el.type = 'button';
    // the search bar is centred in the top bar, so the button sits at the bar's right end
    el.style.cssText = [
      'position:absolute',
      'top:50%',
      'right:24px',
      'transform:translateY(-50%)',
      'z-index:1',
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
    svg.append(document.createElementNS('http://www.w3.org/2000/svg', 'path'));

    caption = document.createElement('span');
    el.append(svg, caption);

    el.addEventListener('click', () => {
      if (sortsByAdded()) {
        try {
          sessionStorage.setItem(PENDING_KEY, '1');
        } catch {
          // storage blocked: the order will just switch back after the reload
        }
      }
      // the results load once, so reload to fetch them in the other order
      location.reload();
    });
    return el;
  };

  const sync = () => {
    if (!onSearchPage()) {
      // left the search: the next visit sorts by date added again
      ownOrder = false;
      button?.remove();
      button = undefined;
      return;
    }
    // the top bar ("control-bar") is absolutely positioned, so it anchors the button
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
    render();
  };

  // Immich is a single-page app, so watch for navigation instead of page loads.
  setInterval(sync, 500);
})();
