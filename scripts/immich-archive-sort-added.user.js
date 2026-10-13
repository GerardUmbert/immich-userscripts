// ==UserScript==
// @name         Immich: sort the archive by date added
// @description  Orders the Archive page by upload date (newest first), with a button next to the title to switch back to capture date.
// @version      1.1.0
// @updateURL    https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-archive-sort-added.user.js
// @downloadURL  https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-archive-sort-added.user.js
// @include      /^https?:\/\/immich\..*/
// @run-at       document-start
// @grant        none
// ==/UserScript==

// Runs on any site whose host starts with "immich." (for example immich.yourdomain.com).
// For another address (an IP or localhost), change the @include line above.
//
// How it works: the Archive page asks the server for its months and assets ordered by
// capture date. The script adds `orderBy=createdAt` to those requests, so the server
// groups and sorts by the date each asset was added to Immich, like Recently added does.
//
// The Archive page itself still assumes capture-date order and would drop any asset that
// falls outside the month it asked for. So the script also rewrites the month data: each
// asset's capture date is replaced by its upload date (in UTC, to match how the server
// builds the months). Side effect: the date headings show when assets were added, not
// when they were taken. The photo viewer still shows the real capture date.
//
// The default is date added. The button at the right end of the title bar switches to
// Immich's own order (date taken) for that visit; it is never remembered, so every page
// load starts with date added again.

(() => {
  'use strict';

  const PENDING_KEY = 'immich-userscript:archive:sort-by-taken-once';
  const PAGE_PATH = /^\/archive(\/|$)/;
  const TIMELINE_API = /\/api\/timeline\/buckets?$/;
  const TIMELINE_BUCKET = /\/api\/timeline\/bucket$/;

  // Switching the order has to reload the page (the timeline loads its months once), so the
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
      // storage blocked: the order will just switch back after the reload
    }
  };

  // whether Immich's own order (date taken) is currently in use
  let byTaken = takePending();

  const sortsByAdded = () => !byTaken && PAGE_PATH.test(location.pathname);

  // --- request and response rewriting --------------------------------------

  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    let rewritten = false;
    try {
      if (sortsByAdded()) {
        const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const url = new URL(raw, location.href);
        if (url.origin === location.origin && TIMELINE_API.test(url.pathname) && !url.searchParams.has('orderBy')) {
          url.searchParams.set('orderBy', 'createdAt');
          input = typeof input === 'string' || input instanceof URL ? url.href : new Request(url.href, input);
          rewritten = true;
        }
      }
    } catch {
      // never break the app over a rewrite failure
    }

    const response = await originalFetch.call(this, input, init);
    return rewritten ? useUploadDates(response) : response;
  };

  // Month data is a set of parallel arrays. The web app derives each asset's date from
  // fileCreatedAt plus localOffsetHours, so point those at the upload date instead.
  const useUploadDates = async (response) => {
    try {
      if (!response.ok || !TIMELINE_BUCKET.test(new URL(response.url).pathname)) {
        return response;
      }
      const data = await response.clone().json();
      if (![data?.createdAt, data?.fileCreatedAt, data?.localOffsetHours].every(Array.isArray)) {
        return response;
      }
      data.fileCreatedAt = [...data.createdAt];
      data.localOffsetHours = data.createdAt.map(() => 0);
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      headers.delete('content-encoding');
      return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
    } catch {
      return response;
    }
  };

  // --- sort button next to the page title ----------------------------------

  // mdiCalendarPlus / mdiCameraOutline from @mdi/js, the icon set Immich uses
  const ICON_ADDED =
    'M19 19V8H5V19H19M16 1H18V3H19C20.11 3 21 3.9 21 5V19C21 20.11 20.11 21 19 21H5C3.89 21 3 20.1 3 19V5C3 3.89 3.89 3 5 3H6V1H8V3H16V1M11 9.5H13V12.5H16V14.5H13V17.5H11V14.5H8V12.5H11V9.5Z';
  const ICON_TAKEN =
    'M20,4H16.83L15,2H9L7.17,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6A2,2 0 0,0 20,4M20,18H4V6H8.05L9.88,4H14.12L15.95,6H20V18M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15Z';

  let button;
  let caption;

  const render = () => {
    const added = sortsByAdded();
    button.querySelector('path').setAttribute('d', added ? ICON_ADDED : ICON_TAKEN);
    caption.textContent = added ? 'Sorted by date added' : 'Sorted by date taken';
    button.title = added ? 'Click to sort by date taken' : 'Click to sort by date added';
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
      if (sortsByAdded()) {
        setPending();
      }
      // the timeline loads its months once, so reload to fetch in the other order
      location.reload();
    });
    return el;
  };

  const sync = () => {
    const onPage = PAGE_PATH.test(location.pathname);
    if (byTaken && !onPage) {
      // left the page: the next visit sorts by date added again
      byTaken = false;
    }

    // the title bar: [title] on the left, anything else pushed to the right
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
