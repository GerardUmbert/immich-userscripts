// ==UserScript==
// @name         Immich: hide archived in albums
// @description  Hides archived assets inside albums by default, with a "Show archived" checkbox to bring them back.
// @version      1.1.0
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
// filter, so archived assets are included. Unless the box is checked, the script adds
// `visibility=timeline` to those requests, which leaves archived assets out.
//
// Known limitation: the asset count in the album header comes from the album itself,
// so it still counts archived assets while they are hidden.

(() => {
  'use strict';

  const STORAGE_KEY = 'immich-userscript:albums:show-archived';
  const PAGE_PATH = /^\/albums\/[0-9a-f-]{36}(\/|$)/i;
  const TIMELINE_API = /\/api\/timeline\/buckets?$/;

  const isEnabled = () => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  };

  const setEnabled = (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      // storage blocked: the checkbox simply won't persist
    }
  };

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

  // --- checkbox ------------------------------------------------------------

  let widget;

  const createWidget = () => {
    const label = document.createElement('label');
    label.style.cssText = [
      'position:fixed',
      'bottom:16px',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:30',
      'display:flex',
      'align-items:center',
      'gap:8px',
      'padding:8px 16px',
      'border-radius:9999px',
      'border:1px solid rgba(128,128,128,.4)',
      'background:color-mix(in srgb, canvas 80%, transparent)',
      'color:canvastext',
      'backdrop-filter:blur(8px)',
      'font-size:14px',
      'cursor:pointer',
      'user-select:none',
    ].join(';');

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = isEnabled();
    box.style.cursor = 'pointer';
    box.addEventListener('change', () => {
      setEnabled(box.checked);
      // the timeline loads its months once, so reload to fetch with the new filter
      location.reload();
    });

    label.append(box, document.createTextNode('Show archived'));
    return label;
  };

  const sync = () => {
    const onPage = PAGE_PATH.test(location.pathname);
    if (onPage && !widget && document.body) {
      widget = createWidget();
      document.body.append(widget);
    } else if (!onPage && widget) {
      widget.remove();
      widget = undefined;
    }
    if (widget) {
      widget.style.colorScheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
  };

  // Immich is a single-page app, so watch for navigation instead of page loads.
  setInterval(sync, 500);
})();
