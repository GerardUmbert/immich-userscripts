// ==UserScript==
// @name         Immich: sort an album's contents
// @description  Adds a sort button to an album's top bar (longest video, largest file, name, date added...) that opens the album as sorted search results.
// @version      1.0.0
// @updateURL    https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-album-sort.user.js
// @downloadURL  https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-album-sort.user.js
// @include      /^https?:\/\/immich\..*/
// @grant        none
// ==/UserScript==

// Runs on any site whose host starts with "immich." (for example immich.yourdomain.com).
// For another address (an IP or localhost), change the @include line above.
//
// Needs the "Immich: sort search results" script (immich-search-sort-added) as well.
//
// How it works: an album page is a timeline grouped by date, so it cannot be re-sorted by video
// length or file size in place. Instead the button opens a search for everything in the album
// (the search accepts an `albumIds` filter) and tells the search sort script which order to
// use, by leaving its choice in sessionStorage for the page that loads next. The search sort
// script then loads all the results and sorts them. Archived items are not included, because
// the search page leaves them out unless asked.

(() => {
  'use strict';

  const PAGE_PATH = /^\/albums\/([0-9a-f-]{36})(\/|$)/i;
  // the key and order names the search sort script reads
  const SORT_KEY = 'immich-userscript:search:sort-once';
  const SORTS = [
    ['added', 'Date added (newest first)'],
    ['longest', 'Longest video first'],
    ['shortest', 'Shortest video first'],
    ['largest', 'Largest file first'],
    ['smallest', 'Smallest file first'],
    ['name', 'Name (A to Z)'],
    ['taken', "Immich's own order"],
  ];

  const albumId = () => location.pathname.match(PAGE_PATH)?.[1] ?? null;

  const openSorted = (key) => {
    const id = albumId();
    if (!id) {
      return;
    }
    try {
      sessionStorage.setItem(SORT_KEY, key);
    } catch {
      // storage blocked: the results open in the default order
    }
    location.assign(`/search?query=${encodeURIComponent(JSON.stringify({ albumIds: [id] }))}`);
  };

  // --- the menu ------------------------------------------------------------

  let menu;

  const closeMenu = () => {
    menu?.remove();
    menu = undefined;
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
  };

  const onOutside = (event) => {
    if (menu && !menu.contains(event.target) && !event.target.closest?.('[data-userscript-album-sort]')) {
      closeMenu();
    }
  };

  const onKey = (event) => {
    if (event.key === 'Escape') {
      closeMenu();
    }
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
      'position:fixed',
      'top:72px',
      'right:16px',
      'z-index:60',
      'min-width:220px',
      'padding:6px',
      'border-radius:16px',
      'border:1px solid rgba(128,128,128,.35)',
      'box-shadow:0 8px 24px rgba(0,0,0,.25)',
      `background:${dark ? '#1a1b1e' : '#fff'}`,
      `color:${dark ? '#e5e7eb' : '#1f2937'}`,
    ].join(';');

    const heading = document.createElement('div');
    heading.textContent = 'Open this album sorted by';
    heading.style.cssText = 'padding:6px 12px;font-size:12px;opacity:.7';
    menu.append(heading);

    for (const [key, label] of SORTS) {
      const item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      item.textContent = label;
      item.style.cssText = [
        'display:block',
        'width:100%',
        'padding:8px 12px',
        'border:0',
        'border-radius:10px',
        'background:transparent',
        'color:inherit',
        'font:inherit',
        'font-size:14px',
        'text-align:start',
        'white-space:nowrap',
        'cursor:pointer',
      ].join(';');
      item.addEventListener('mouseenter', () => (item.style.background = 'rgba(128,128,128,.18)'));
      item.addEventListener('mouseleave', () => (item.style.background = 'transparent'));
      item.addEventListener('click', () => openSorted(key));
      menu.append(item);
    }

    document.body.append(menu);
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
  };

  // --- sort button in the album's top bar ----------------------------------

  // mdiSort from @mdi/js, the icon set Immich uses
  const SORT_ICON = 'M3 13H9V11H3V13M3 6V8H21V6H3M3 18H15V16H3V18Z';

  // the row of action buttons on the right of the album's top bar
  const ACTIONS = '#control-bar nav > div.ms-auto';

  let button;

  // Copies the look of one of Immich's own action buttons, so the new one matches in
  // size, shape, hover and theme without any styling of its own.
  const createButton = (template) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = template.className;
    el.title = 'Open this album sorted';
    el.setAttribute('aria-label', 'Open this album sorted');
    el.setAttribute('data-userscript-album-sort', '');

    const svg = template.querySelector('svg').cloneNode(true);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', SORT_ICON);
    svg.replaceChildren(path);
    el.append(svg);

    el.addEventListener('click', openMenu);
    return el;
  };

  const sync = () => {
    const actions = PAGE_PATH.test(location.pathname) ? document.querySelector(ACTIONS) : null;
    // the bar for picking assets or a cover has a title; only the normal view has none
    const isViewBar = actions && !actions.closest('nav').querySelector('div.flex-col.truncate');
    if (!isViewBar) {
      closeMenu();
      button?.remove();
      button = undefined;
      return;
    }

    if (!button || !actions.contains(button)) {
      const template = [...actions.querySelectorAll('button')].find((candidate) => candidate.querySelector('svg'));
      if (!template) {
        return; // the bar has not rendered its buttons yet
      }
      button = createButton(template);
      actions.prepend(button);
    }
  };

  // Immich is a single-page app, so watch for navigation and re-renders instead of page loads.
  setInterval(sync, 500);
})();
