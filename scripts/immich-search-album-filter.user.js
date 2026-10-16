// ==UserScript==
// @name         Immich: album filter for search
// @description  Adds an Album section to the search filters (next to Library) so any search can be limited to one album.
// @version      1.1.2
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
// adds `albumIds` to every search request the page sends while an album is picked. The
// "Album" section is added to the filter panel's advanced filters, right below Library, using
// copies of Immich's own title and button so it looks the same. Picking an album reloads the
// page to run the search again.
//
// The choice is never remembered: every page load starts with "All albums". Picking an album
// has to reload the page (the results load once), so the choice is handed to that single
// reload through sessionStorage and then forgotten. It stays on while you refine the search on
// that page, and is dropped when you leave the search page or reload. The section also shows
// up in the filter panel on other pages (the search bar is everywhere); picking an album there
// applies to the search you run next.

(() => {
  'use strict';

  const STORAGE_KEY = 'immich-userscript:search:album';
  const SEARCH_PAGE = /^\/search(\/|$)/;
  const SEARCH_API = /\/api\/search\/(metadata|smart)$/;

  const takePending = () => {
    try {
      const value = sessionStorage.getItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
      return value;
    } catch {
      return null;
    }
  };

  const setPending = (id) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, id);
    } catch {
      // storage blocked: the filter will just switch off after the reload
    }
  };

  // the album the searches on this page are limited to, if any
  let picked = takePending();
  const getAlbum = () => picked;

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

  // --- "Album" section in the advanced filters ----------------------------

  const SECTION = '#display-options-selection';
  const ATTR = 'data-userscript-album-filter';

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

  const choose = (id) => {
    if (!SEARCH_PAGE.test(location.pathname)) {
      // no results on screen yet: just remember it for the search about to be run
      picked = id || null;
      document.querySelector(`[${ATTR}]`)?.remove(); // rebuilt with the new choice on the next tick
      return;
    }
    if (id) {
      setPending(id);
    }
    // the results load once, so reload to run the search with the new filter
    location.reload();
  };

  // One row of the list; styled by hand since it has no counterpart to copy.
  const createRow = (label, id, selected) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.textContent = label;
    row.style.cssText = [
      'display:block',
      'width:100%',
      'padding:6px 12px',
      'border:0',
      'border-radius:8px',
      'background:' + (selected ? 'rgba(128,128,128,.25)' : 'transparent'),
      'color:inherit',
      'font:inherit',
      'font-size:14px',
      'text-align:start',
      'cursor:pointer',
    ].join(';');
    row.addEventListener('mouseenter', () => (row.style.background = 'rgba(128,128,128,.18)'));
    row.addEventListener('mouseleave', () => (row.style.background = selected ? 'rgba(128,128,128,.25)' : 'transparent'));
    row.addEventListener('click', () => choose(id));
    return row;
  };

  const createSection = (library) => {
    const current = getAlbum();
    const name = albums.find(({ id }) => id === current)?.albumName;

    const section = document.createElement('div');
    section.setAttribute(ATTR, '');

    // copy Immich's own "Library" title and filter button, so the section matches
    const title = library.querySelector('fieldset > :first-child').cloneNode(true);
    title.textContent = 'Album';
    const buttons = [...library.querySelectorAll('fieldset button')];
    // prefer a button that is not switched on (those carry a check icon)
    const template = buttons.find((button) => !button.querySelector('svg')) ?? buttons[0];

    const pill = template.cloneNode(true);
    // the copy comes with Immich's inactive look; borrow the primary colour when an album is set
    pill.replaceChildren(name ?? 'All albums');
    pill.type = 'button';
    pill.title = 'Only search inside one album';
    if (name) {
      pill.style.color = 'rgb(var(--immich-primary, 66 80 175))';
      pill.style.borderColor = 'rgb(var(--immich-primary, 66 80 175))';
    }

    const list = document.createElement('div');
    list.hidden = true;
    list.style.cssText = 'margin-top:8px;padding:8px;border:1px solid rgba(128,128,128,.35);border-radius:16px';

    const filter = document.createElement('input');
    filter.type = 'text';
    filter.placeholder = 'Find an album';
    filter.autocomplete = 'off';
    filter.style.cssText =
      'box-sizing:border-box;width:100%;margin-bottom:6px;padding:6px 12px;border:1px solid rgba(128,128,128,.5);border-radius:9999px;background:transparent;color:inherit;font:inherit;font-size:14px;outline:none';

    const rows = document.createElement('div');
    rows.style.cssText = 'max-height:220px;overflow-y:auto';

    const renderRows = () => {
      const needle = filter.value.trim().toLowerCase();
      const matching = albums.filter(({ albumName }) => albumName.toLowerCase().includes(needle));
      rows.replaceChildren(
        ...(needle ? [] : [createRow('All albums', '', !current)]),
        ...matching.map(({ id, albumName }) => createRow(albumName, id, id === current)),
      );
    };
    filter.addEventListener('input', renderRows);
    renderRows();
    list.append(filter, rows);

    pill.addEventListener('click', () => {
      list.hidden = !list.hidden;
      if (!list.hidden) {
        filter.focus();
      }
    });

    const row = document.createElement('div');
    row.className = template.parentElement.className;
    row.append(pill);
    section.append(title, row, list);
    return section;
  };

  let wasOnSearch = SEARCH_PAGE.test(location.pathname);

  const sync = () => {
    const onSearch = SEARCH_PAGE.test(location.pathname);
    if (wasOnSearch && !onSearch) {
      // left the search: the next one starts with all albums again
      picked = null;
    }
    wasOnSearch = onSearch;

    // the filter panel belongs to the search bar, which is on every page
    const library = document.querySelector(SECTION);
    if (!library || library.parentElement.querySelector(`[${ATTR}]`)) {
      return;
    }
    if (!albums) {
      void loadAlbums();
      return;
    }
    // the filter panel is rebuilt each time it opens, so the section is added again each time
    if (library.querySelector('fieldset > :first-child') && library.querySelector('fieldset button')) {
      library.after(createSection(library));
    }
  };

  // Immich is a single-page app, so watch for navigation and re-renders instead of page loads.
  setInterval(sync, 300);
})();
