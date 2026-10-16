// ==UserScript==
// @name         Immich: search within an album
// @description  Adds a search button to an album's top bar that searches only the assets inside that album.
// @version      1.1.1
// @updateURL    https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-album-search.user.js
// @downloadURL  https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-album-search.user.js
// @include      /^https?:\/\/immich\..*/
// @grant        none
// ==/UserScript==

// Runs on any site whose host starts with "immich." (for example immich.yourdomain.com).
// For another address (an IP or localhost), change the @include line above.
//
// How it works: Immich's search accepts an `albumIds` filter, but its search page has no way
// to set it. The page reads its whole search from the address (/search?query=<json>), so the
// button opens a small search panel (text, what to match, kind of file) and then opens a
// search with those terms and `albumIds` set to the current album.
//
// "Content" is a normal search (the same as typing it in the search bar); "File name" matches
// part of the file name, so ".mp4" finds that extension. Leave the text empty to list every
// file of the chosen kind. The search page shows the album filter as an "albumIds" chip;
// removing it searches everywhere.

(() => {
  'use strict';

  const PAGE_PATH = /^\/albums\/([0-9a-f-]{36})(\/|$)/i;

  const albumId = () => location.pathname.match(PAGE_PATH)?.[1] ?? null;

  // --- the search panel ----------------------------------------------------

  let panel;

  const closePanel = () => {
    panel?.remove();
    panel = undefined;
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
  };

  const onOutside = (event) => {
    if (panel && !panel.contains(event.target) && !event.target.closest?.('[data-userscript-album-search]')) {
      closePanel();
    }
  };

  const onKey = (event) => {
    if (event.key === 'Escape') {
      closePanel();
    }
  };

  // a row of mutually exclusive choices, shown as pills
  const choices = (name, options, selected) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
    for (const [value, label] of options) {
      const pill = document.createElement('label');
      pill.style.cssText =
        'display:inline-flex;align-items:center;padding:4px 12px;border:1px solid rgba(128,128,128,.5);border-radius:9999px;font-size:14px;cursor:pointer;user-select:none';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = name;
      radio.value = value;
      radio.checked = value === selected;
      radio.style.display = 'none';
      const paint = () => {
        for (const other of row.querySelectorAll('label')) {
          const on = other.querySelector('input').checked;
          other.style.background = on ? 'rgba(128,128,128,.35)' : 'transparent';
          other.style.fontWeight = on ? '600' : '400';
        }
      };
      radio.addEventListener('change', paint);
      pill.append(radio, label);
      row.append(pill);
    }
    queueMicrotask(() => row.querySelector('input')?.dispatchEvent(new Event('change')));
    return row;
  };

  const caption = (text) => {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = 'font-size:12px;opacity:.7;margin:12px 0 6px';
    return el;
  };

  const search = (form) => {
    const id = albumId();
    if (!id) {
      return;
    }
    const text = form.elements.text.value.trim();
    const type = form.elements.type.value;
    const terms = { albumIds: [id] };
    if (type) {
      terms.type = type;
    }
    if (text) {
      terms[form.elements.match.value === 'file' ? 'originalFileName' : 'query'] = text;
    }
    location.assign(`/search?query=${encodeURIComponent(JSON.stringify(terms))}`);
  };

  const openPanel = () => {
    if (panel) {
      closePanel();
      return;
    }
    const dark = document.documentElement.classList.contains('dark');

    panel = document.createElement('form');
    panel.style.cssText = [
      'position:fixed',
      'top:72px',
      'right:16px',
      'z-index:60',
      'width:min(340px,calc(100vw - 32px))',
      'padding:16px',
      'border-radius:16px',
      'box-shadow:0 8px 24px rgba(0,0,0,.25)',
      'border:1px solid rgba(128,128,128,.35)',
      `background:${dark ? '#1a1b1e' : '#fff'}`,
      `color:${dark ? '#e5e7eb' : '#1f2937'}`,
      'font-size:14px',
    ].join(';');

    const text = document.createElement('input');
    text.name = 'text';
    text.type = 'text';
    text.placeholder = 'Search this album';
    text.autocomplete = 'off';
    text.style.cssText =
      'box-sizing:border-box;width:100%;padding:8px 12px;border:1px solid rgba(128,128,128,.5);border-radius:9999px;background:transparent;color:inherit;font:inherit;outline:none';

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Search';
    submit.style.cssText =
      'margin-top:16px;width:100%;padding:8px 12px;border:0;border-radius:9999px;background:rgb(66 80 175);color:#fff;font:inherit;font-weight:600;cursor:pointer';

    panel.append(
      text,
      caption('Match'),
      choices('match', [['content', 'Content'], ['file', 'File name']], 'content'),
      caption('Kind of file'),
      choices('type', [['', 'Any'], ['IMAGE', 'Photos'], ['VIDEO', 'Videos'], ['AUDIO', 'Audio'], ['OTHER', 'Other']], ''),
      submit,
    );
    panel.addEventListener('submit', (event) => {
      event.preventDefault();
      search(panel);
    });

    document.body.append(panel);
    text.focus();
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
  };

  // --- search button in the album's top bar --------------------------------

  // mdiMagnify from @mdi/js, the icon set Immich uses
  const MAGNIFY =
    'M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z';

  // the row of action buttons on the right of the album's top bar
  const ACTIONS = '#control-bar nav > div.ms-auto';

  let button;

  // Copies the look of one of Immich's own action buttons, so the new one matches in
  // size, shape, hover and theme without any styling of its own.
  const createButton = (template) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = template.className;
    el.title = 'Search this album';
    el.setAttribute('aria-label', 'Search this album');
    el.setAttribute('data-userscript-album-search', '');

    const svg = template.querySelector('svg').cloneNode(true);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', MAGNIFY);
    svg.replaceChildren(path);
    el.append(svg);

    el.addEventListener('click', openPanel);
    return el;
  };

  const sync = () => {
    const actions = PAGE_PATH.test(location.pathname) ? document.querySelector(ACTIONS) : null;
    // the bar for picking assets or a cover has a title; only the normal view has none
    const isViewBar = actions && !actions.closest('nav').querySelector('div.flex-col.truncate');
    if (!isViewBar) {
      closePanel();
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
