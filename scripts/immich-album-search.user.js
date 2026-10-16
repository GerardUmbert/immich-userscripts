// ==UserScript==
// @name         Immich: search within an album
// @description  Adds a search button to an album's top bar that searches only the assets inside that album.
// @version      1.0.0
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
// button asks for some text and opens a search with that text and `albumIds` set to the
// current album.
//
// The text is a normal search (the same as typing it in the search bar). Start it with
// "file:" to match file names instead, for example "file:IMG_20240" or "file:.mp4" for an
// extension. Add "type:image", "type:video", "type:audio" or "type:other" anywhere in the
// text to limit the kind of file; "type:video" alone lists every video in the album. The
// search page shows the album filter as an "albumIds" chip; removing it searches everywhere.

(() => {
  'use strict';

  const PAGE_PATH = /^\/albums\/([0-9a-f-]{36})(\/|$)/i;
  const FILE_PREFIX = /^file:\s*/i;
  const TYPE_TOKEN = /\btype:(image|video|audio|other)\b/i;
  const HELP = 'Search this album.\nfile:name matches file names (file:.mp4 for an extension); type:image or type:video limits the kind of file.';

  const albumId = () => location.pathname.match(PAGE_PATH)?.[1] ?? null;

  const search = () => {
    const id = albumId();
    const input = id ? prompt(HELP) : null;
    if (!input?.trim()) {
      return;
    }
    // "type:video" can sit anywhere in the text; what is left is the search text
    const type = input.match(TYPE_TOKEN)?.[1].toUpperCase();
    const text = input.replace(TYPE_TOKEN, ' ').trim();

    const terms = { albumIds: [id] };
    if (type) {
      terms.type = type;
    }
    if (FILE_PREFIX.test(text)) {
      terms.originalFileName = text.replace(FILE_PREFIX, '').trim();
    } else if (text) {
      terms.query = text;
    }
    location.assign(`/search?query=${encodeURIComponent(JSON.stringify(terms))}`);
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

    const svg = template.querySelector('svg').cloneNode(true);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', MAGNIFY);
    svg.replaceChildren(path);
    el.append(svg);

    el.addEventListener('click', search);
    return el;
  };

  const sync = () => {
    const actions = PAGE_PATH.test(location.pathname) ? document.querySelector(ACTIONS) : null;
    // the bar for picking assets or a cover has a title; only the normal view has none
    const isViewBar = actions && !actions.closest('nav').querySelector('div.flex-col.truncate');
    if (!isViewBar) {
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
