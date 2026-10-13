// ==UserScript==
// @name         Immich: show archived in Recently added
// @description  Adds an eye toggle next to the Recently added title to show archived items (hidden by default).
// @version      1.3.0
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
// When archived items are shown the script removes that parameter from the request. The
// server then returns archived and timeline assets together. It also removes
// `withPartners`, which the server refuses to combine with archived assets, so
// partners' assets are not listed while archived items are shown.
//
// The web app also filters on its own: it drops any asset whose visibility is not
// "timeline" even if the server returned it. So the script relabels archived assets as
// "timeline" in the month data. Archived thumbnails get Immich's own archive icon in
// the bottom-right corner. Side effect: the Archive/Unarchive action may show the wrong
// state until reload.

(() => {
  'use strict';

  const PENDING_KEY = 'immich-userscript:recently-added:show-archived-once';
  const PAGE_PATH = /^\/recently-added(\/|$)/;
  const TIMELINE_API = /\/api\/timeline\/buckets?$/;
  const TIMELINE_BUCKET = /\/api\/timeline\/bucket$/;

  // The state is deliberately not remembered: every visit starts with archived items hidden.
  // Toggling it has to reload the page (the timeline loads its months once), so the
  // choice is handed to that single reload through sessionStorage and then forgotten.
  const takePending = () => {
    try {
      const value = sessionStorage.getItem(PENDING_KEY);
      sessionStorage.removeItem(PENDING_KEY);
      return value === '1';
    } catch {
      return false;
    }
  };

  const setPending = () => {
    try {
      sessionStorage.setItem(PENDING_KEY, '1');
    } catch {
      // storage blocked: the eye will just switch back after the reload
    }
  };

  // whether archived items are currently shown
  let revealed = takePending();

  const isEnabled = () => revealed && PAGE_PATH.test(location.pathname);

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

  // --- eye button next to the page title -----------------------------------

  // mdiEyeOffOutline / mdiEyeOutline from @mdi/js, the icon set Immich uses
  const EYE_OFF = 'M2,5.27L3.28,4L20,20.72L18.73,22L15.65,18.92C14.5,19.3 13.28,19.5 12,19.5C7,19.5 2.73,16.39 1,12C1.69,10.24 2.79,8.69 4.19,7.46L2,5.27M12,9A3,3 0 0,1 15,12C15,12.35 14.94,12.69 14.83,13L11,9.17C11.31,9.06 11.65,9 12,9M12,4.5C17,4.5 21.27,7.61 23,12C22.18,14.08 20.79,15.88 19,17.19L17.58,15.76C18.94,14.82 20.06,13.54 20.82,12C19.17,8.64 15.76,6.5 12,6.5C10.91,6.5 9.84,6.68 8.84,7L7.3,5.47C8.74,4.85 10.33,4.5 12,4.5M3.18,12C4.83,15.36 8.24,17.5 12,17.5C12.69,17.5 13.37,17.43 14,17.29L11.72,15C10.29,14.85 9.15,13.71 9,12.28L5.6,8.87C4.61,9.72 3.78,10.78 3.18,12Z';
  const EYE =
    'M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9M12,4.5C17,4.5 21.27,7.61 23,12C21.27,16.39 17,19.5 12,19.5C7,19.5 2.73,16.39 1,12C2.73,7.61 7,4.5 12,4.5M3.18,12C4.83,15.36 8.24,17.5 12,17.5C15.76,17.5 19.17,15.36 20.82,12C19.17,8.64 15.76,6.5 12,6.5C8.24,6.5 4.83,8.64 3.18,12Z';

  let button;
  let caption;

  const render = () => {
    const shown = isEnabled();
    button.querySelector('path').setAttribute('d', shown ? EYE : EYE_OFF);
    caption.textContent = shown ? 'Showing archived' : 'Hiding archived';
    button.title = shown ? 'Click to hide archived' : 'Click to show archived';
    button.setAttribute('aria-pressed', String(shown));
  };

  const createButton = () => {
    const el = document.createElement('button');
    el.type = 'button';
    el.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'gap:8px',
      'padding:6px 14px',
      'border:0',
      'border-radius:9999px',
      'background:transparent',
      'color:inherit',
      'font:inherit',
      'font-size:14px',
      'cursor:pointer',
      'white-space:nowrap',
    ].join(';');
    el.addEventListener('mouseenter', () => (el.style.background = 'rgba(128,128,128,.18)'));
    el.addEventListener('mouseleave', () => (el.style.background = 'transparent'));

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('fill', 'currentColor');
    svg.append(document.createElementNS('http://www.w3.org/2000/svg', 'path'));

    caption = document.createElement('span');
    el.append(svg, caption);

    el.addEventListener('click', () => {
      if (!isEnabled()) {
        setPending();
      }
      // the timeline loads its months once, so reload to fetch with the new filter
      location.reload();
    });
    return el;
  };

  const sync = () => {
    const onPage = PAGE_PATH.test(location.pathname);
    if (revealed && !onPage) {
      // left the page: archived items are hidden again next time
      revealed = false;
    }

    // the title bar: [title and description] on the left, anything else pushed to the right
    const bar = onPage ? document.getElementById('user-page-header')?.closest('div.justify-between') : null;
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

  // Immich is a single-page app, so watch for navigation and re-renders instead of page loads.
  setInterval(sync, 500);
})();
