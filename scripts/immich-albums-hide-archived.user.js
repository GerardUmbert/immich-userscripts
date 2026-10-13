// ==UserScript==
// @name         Immich: hide archived in albums
// @description  Hides archived assets inside albums by default, with an eye button in the top bar to show them.
// @version      1.3.0
// @updateURL    https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-albums-hide-archived.user.js
// @downloadURL  https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-albums-hide-archived.user.js
// @include      /^https?:\/\/immich\..*/
// @run-at       document-start
// @grant        none
// ==/UserScript==

// Runs on any site whose host starts with "immich." (for example immich.yourdomain.com).
// For another address (an IP or localhost), change the @include line above.
//
// How it works: an album page asks the server for its assets without a visibility
// filter, so archived assets are included. Unless the eye button is toggled, the script adds
// `visibility=timeline` to those requests, which leaves archived assets out.
//
// Known limitation: the asset count in the album header comes from the album itself,
// so it still counts archived assets while they are hidden.

(() => {
  'use strict';

  const PENDING_KEY = 'immich-userscript:albums:show-archived-once';
  const PAGE_PATH = /^\/albums\/([0-9a-f-]{36})(\/|$)/i;
  const TIMELINE_API = /\/api\/timeline\/buckets?$/;

  // The state is deliberately not remembered: every album starts with archived items hidden.
  // Toggling it has to reload the page (the timeline loads its months once), so the
  // choice is handed to that single reload through sessionStorage and then forgotten.
  const takePending = () => {
    try {
      const value = sessionStorage.getItem(PENDING_KEY);
      sessionStorage.removeItem(PENDING_KEY);
      return value;
    } catch {
      return null;
    }
  };

  const setPending = (albumId) => {
    try {
      sessionStorage.setItem(PENDING_KEY, albumId);
    } catch {
      // storage blocked: the eye will just switch back after the reload
    }
  };

  const albumId = () => location.pathname.match(PAGE_PATH)?.[1] ?? null;

  // the album whose archived items are currently shown, if any
  let revealedAlbum = takePending();

  const isEnabled = () => revealedAlbum !== null && revealedAlbum === albumId();

  // --- request rewriting ---------------------------------------------------

  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      if (PAGE_PATH.test(location.pathname) && !isEnabled()) {
        const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const url = new URL(raw, location.href);
        if (
          url.origin === location.origin &&
          TIMELINE_API.test(url.pathname) &&
          url.searchParams.has('albumId') &&
          !url.searchParams.has('visibility')
        ) {
          url.searchParams.set('visibility', 'timeline');
          input = typeof input === 'string' || input instanceof URL ? url.href : new Request(url.href, input);
        }
      }
    } catch {
      // never break the app over a rewrite failure
    }
    return originalFetch.call(this, input, init);
  };


  // --- eye button in the album's top bar -----------------------------------

  // mdiEyeOffOutline / mdiEyeOutline from @mdi/js, the icon set Immich uses
  const EYE_OFF = 'M2,5.27L3.28,4L20,20.72L18.73,22L15.65,18.92C14.5,19.3 13.28,19.5 12,19.5C7,19.5 2.73,16.39 1,12C1.69,10.24 2.79,8.69 4.19,7.46L2,5.27M12,9A3,3 0 0,1 15,12C15,12.35 14.94,12.69 14.83,13L11,9.17C11.31,9.06 11.65,9 12,9M12,4.5C17,4.5 21.27,7.61 23,12C22.18,14.08 20.79,15.88 19,17.19L17.58,15.76C18.94,14.82 20.06,13.54 20.82,12C19.17,8.64 15.76,6.5 12,6.5C10.91,6.5 9.84,6.68 8.84,7L7.3,5.47C8.74,4.85 10.33,4.5 12,4.5M3.18,12C4.83,15.36 8.24,17.5 12,17.5C12.69,17.5 13.37,17.43 14,17.29L11.72,15C10.29,14.85 9.15,13.71 9,12.28L5.6,8.87C4.61,9.72 3.78,10.78 3.18,12Z';
  const EYE =
    'M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9M12,4.5C17,4.5 21.27,7.61 23,12C21.27,16.39 17,19.5 12,19.5C7,19.5 2.73,16.39 1,12C2.73,7.61 7,4.5 12,4.5M3.18,12C4.83,15.36 8.24,17.5 12,17.5C15.76,17.5 19.17,15.36 20.82,12C19.17,8.64 15.76,6.5 12,6.5C8.24,6.5 4.83,8.64 3.18,12Z';

  // the row of action buttons on the right of the album's top bar
  const ACTIONS = '#control-bar nav > div.ms-auto';

  let button;

  const render = () => {
    const shown = isEnabled();
    button.querySelector('path').setAttribute('d', shown ? EYE : EYE_OFF);
    const label = shown ? 'Showing archived (click to hide)' : 'Hiding archived (click to show)';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(shown));
  };

  // Copies the look of one of Immich's own action buttons, so the new one matches in
  // size, shape, hover and theme without any styling of its own.
  const createButton = (template) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = template.className;

    const svg = template.querySelector('svg').cloneNode(true);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    svg.replaceChildren(path);
    el.append(svg);

    el.addEventListener('click', () => {
      if (!isEnabled()) {
        setPending(albumId());
      }
      // the timeline loads its months once, so reload to fetch with the new filter
      location.reload();
    });
    return el;
  };

  const sync = () => {
    if (revealedAlbum !== null && revealedAlbum !== albumId()) {
      // left that album (or opened another one): archived items are hidden again
      revealedAlbum = null;
    }

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
    render();
  };

  // Immich is a single-page app, so watch for navigation and re-renders instead of page loads.
  setInterval(sync, 500);
})();
