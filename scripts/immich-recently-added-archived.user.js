// ==UserScript==
// @name         Immich: show archived in Recently added
// @description  Adds a "Show archived" checkbox to the Recently added page (off by default).
// @version      1.1.0
// @updateURL    https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-recently-added-archived.user.js
// @downloadURL  https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-recently-added-archived.user.js
// @include      /^https?:\/\/immich\..*/
// @run-at       document-start
// @grant        none
// ==/UserScript==

// Runs on any site whose host starts with "immich." (for example immich.yourdomain.com).
// For another address (an IP or localhost), change the @include line above.
//
// How it works: the Recently added page asks the server for `visibility=timeline`.
// When the box is checked the script removes that parameter from the request. The
// server then returns archived and timeline assets together. It also removes
// `withPartners`, which the server refuses to combine with archived assets, so
// partners' assets are not listed while the box is checked.
//
// The web app also filters on its own: it drops any asset whose visibility is not
// "timeline" even if the server returned it. So the script relabels archived assets as
// "timeline" in the month data. Archived thumbnails get Immich's own archive icon in
// the bottom-right corner. Side effect: the Archive/Unarchive action may show the wrong
// state until reload.

(() => {
  'use strict';

  const STORAGE_KEY = 'immich-userscript:recently-added:show-archived';
  const PAGE_PATH = /^\/recently-added(\/|$)/;
  const TIMELINE_API = /\/api\/timeline\/buckets?$/;
  const TIMELINE_BUCKET = /\/api\/timeline\/bucket$/;

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
  window.fetch = async function (input, init) {
    let rewritten = false;
    try {
      if (PAGE_PATH.test(location.pathname) && isEnabled()) {
        const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const url = new URL(raw, location.href);
        if (url.origin === location.origin && TIMELINE_API.test(url.pathname) && url.searchParams.has('visibility')) {
          url.searchParams.delete('visibility');
          // the server rejects withPartners together with archived assets, so partner assets drop out too
          url.searchParams.delete('withPartners');
          input = typeof input === 'string' || input instanceof URL ? url.href : new Request(url.href, input);
          rewritten = true;
        }
      }
    } catch {
      // never break the app over a rewrite failure
    }

    const response = await originalFetch.call(this, input, init);
    return rewritten ? relabelArchived(response) : response;
  };

  // The web app drops any asset whose visibility differs from the page's own filter
  // ("timeline"), even when the server sent it. Relabel archived assets as "timeline"
  // in the month data so they are kept.
  const relabelArchived = async (response) => {
    try {
      if (!response.ok || !TIMELINE_BUCKET.test(new URL(response.url).pathname)) {
        return response;
      }
      const data = await response.clone().json();
      if (!Array.isArray(data?.visibility)) {
        return response;
      }
      data.visibility = data.visibility.map((value, i) => {
        if (value !== 'archive') {
          return value;
        }
        archivedIds.add(data.id[i]);
        return 'timeline';
      });
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      headers.delete('content-encoding');
      return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
    } catch {
      return response;
    }
  };

  // --- archived badge ------------------------------------------------------

  // ids of the assets relabelled above; thumbnails carry data-asset="<id>"
  const archivedIds = new Set();
  const MARK = 'data-userscript-archived';

  // mdiArchiveArrowDownOutline from @mdi/js, the icon Immich uses for archived assets
  const ARCHIVE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="white" d="M20 21H4V10H6V19H18V10H20V21M3 3H21V9H3V3M5 5V7H19V5M10.5 11V14H8L12 18L16 14H13.5V11"/></svg>`;

  const style = document.createElement('style');
  style.textContent = `
    [${MARK}] { position: relative; }
    [${MARK}]::after {
      content: '';
      position: absolute;
      right: 6px;
      bottom: 6px;
      z-index: 3;
      width: 26px;
      height: 26px;
      border-radius: 9999px;
      background: rgba(0, 0, 0, 0.55) url("data:image/svg+xml,${encodeURIComponent(ARCHIVE_ICON)}") center / 18px no-repeat;
      pointer-events: none;
    }`;
  document.documentElement.append(style);

  const markThumbnails = () => {
    if (archivedIds.size === 0) {
      return;
    }
    for (const element of document.querySelectorAll(`[data-asset]:not([${MARK}])`)) {
      if (archivedIds.has(element.dataset.asset)) {
        element.setAttribute(MARK, '');
      }
    }
  };

  // thumbnails are created while scrolling, so mark them as they appear
  let markQueued = false;
  new MutationObserver(() => {
    if (markQueued) {
      return;
    }
    markQueued = true;
    requestAnimationFrame(() => {
      markQueued = false;
      markThumbnails();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

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
