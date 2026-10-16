// ==UserScript==
// @name         Immich: album filter for search
// @description  Adds an album picker to the search page's top bar so any search can be limited to one album.
// @version      1.0.0
// @updateURL    https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-search-album-filter.user.js
// @downloadURL  https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-search-album-filter.user.js
// @include      /^https?:\/\/immich\..*/
// @run-at       document-start
// @grant        none
// ==/UserScript==

// Runs on any site whose host starts with "immich." (for example immich.yourdomain.com).
// For another address (an IP or localhost), change the @include line above.
//
// How it works: the search API takes an `albumIds` filter, but Immich's filter panel has no
// album section, and the panel rebuilds the whole search from its own state, so anything added
// to the address is lost on the next search. So the choice is kept by the script instead: it
// adds `albumIds` to every search request the page sends while an album is picked. The picker
// lists every album you can see, and picking one reloads the page to run the search again.
//
// The picked album is kept for the browser tab (sessionStorage), so it stays on while you
// refine the search, and is dropped when you pick "All albums" or close the tab.

(() => {
  'use strict';

  const STORAGE_KEY = 'immich-userscript:search:album';
  const SEARCH_PAGE = /^\/search(\/|$)/;
  const SEARCH_API = /\/api\/search\/(metadata|smart)$/;

  const getAlbum = () => {
    try {
      return sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  };

  const setAlbum = (id) => {
    try {
      if (id) {
        sessionStorage.setItem(STORAGE_KEY, id);
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // storage blocked: the picker will just not hold its value
    }
  };

  // --- request rewriting ---------------------------------------------------

  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    try {
      const album = getAlbum();
      if (album && SEARCH_PAGE.test(location.pathname)) {
        const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const url = new URL(raw, location.href);
        const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
        if (method === 'POST' && url.origin === location.origin && SEARCH_API.test(url.pathname)) {
          const text = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
          const body = typeof text === 'string' ? JSON.parse(text) : undefined;
          // the search page uses the flat request shape; leave the structured one alone
          if (body && typeof body === 'object' && !body.filter && !body.albumIds) {
            body.albumIds = [album];
            const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
            headers.set('content-type', 'application/json');
            return originalFetch.call(this, url.href, {
              method: 'POST',
              headers,
              credentials: init?.credentials ?? 'same-origin',
              signal: init?.signal,
              body: JSON.stringify(body),
            });
          }
        }
      }
    } catch {
      // never break the app over a rewrite failure
    }
    return originalFetch.call(this, input, init);
  };

  // --- album picker in the top bar -----------------------------------------

  let picker;
  let albums; // [{ id, albumName }] once loaded
  let loading = false;

  const loadAlbums = async () => {
    if (albums || loading) {
      return;
    }
    loading = true;
    try {
      const response = await originalFetch('/api/albums', { credentials: 'same-origin' });
      if (response.ok) {
        albums = (await response.json())
          .map(({ id, albumName }) => ({ id, albumName }))
          .sort((a, b) => a.albumName.localeCompare(b.albumName, undefined, { sensitivity: 'base' }));
      }
    } catch {
      // try again on the next tick
    } finally {
      loading = false;
    }
  };

  const fillPicker = () => {
    const current = getAlbum();
    const options = [new Option('All albums', '')];
    for (const { id, albumName } of albums) {
      options.push(new Option(albumName, id));
    }
    picker.replaceChildren(...options);
    picker.value = albums.some(({ id }) => id === current) ? current : '';
    picker.style.borderColor = picker.value ? 'currentColor' : 'rgba(128,128,128,.4)';
  };

  const createPicker = () => {
    const el = document.createElement('select');
    el.title = 'Only search inside this album';
    el.setAttribute('aria-label', 'Album filter');
    // sits at the left of the top bar, clear of the centred search field
    el.style.cssText = [
      'position:absolute',
      'top:50%',
      'left:72px',
      'transform:translateY(-50%)',
      'z-index:1',
      'max-width:200px',
      'padding:6px 10px',
      'border:1px solid rgba(128,128,128,.4)',
      'border-radius:9999px',
      'background:rgba(128,128,128,.18)',
      'color:inherit',
      'font:inherit',
      'font-size:14px',
      'cursor:pointer',
    ].join(';');
    el.addEventListener('change', () => {
      setAlbum(el.value);
      // the results load once, so reload to run the search with the new filter
      location.reload();
    });
    return el;
  };

  const sync = () => {
    // the top bar ("control-bar") is absolutely positioned, so it anchors the picker
    const bar = SEARCH_PAGE.test(location.pathname) ? document.getElementById('control-bar') : null;
    if (!bar) {
      picker?.remove();
      picker = undefined;
      return;
    }
    if (!albums) {
      void loadAlbums();
      return;
    }
    if (!picker || !bar.contains(picker)) {
      picker = createPicker();
      bar.append(picker);
      fillPicker();
    }
  };

  // Immich is a single-page app, so watch for navigation instead of page loads.
  setInterval(sync, 500);
})();
