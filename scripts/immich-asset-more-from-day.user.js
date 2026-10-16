// ==UserScript==
// @name         Immich: see more from this day
// @description  Adds a "See more from this day" link under the date in the photo viewer's info panel. It opens a search for everything taken that day.
// @version      1.0.0
// @updateURL    https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-asset-more-from-day.user.js
// @downloadURL  https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-asset-more-from-day.user.js
// @include      /^https?:\/\/immich\..*/
// @grant        none
// ==/UserScript==

// Runs on any site whose host starts with "immich." (for example immich.yourdomain.com).
// For another address (an IP or localhost), change the @include line above.
//
// How it works: the info panel shows the capture date as text in the user's locale, which is
// not reliable to parse. So the script reads the asset id from the address (.../photos/<id>),
// asks the API for the asset's dates, and works out the day the photo was taken in the time
// zone it was taken in: the difference between localDateTime and fileCreatedAt is that
// zone's offset. The link then opens /search with takenAfter / takenBefore set to that day.
//
// The search filters on the capture instant (fileCreatedAt), the same as Immich's own date
// filter.

(() => {
  'use strict';

  const ASSET_PATH = /\/photos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;
  const DATE_BUTTON = '[data-testid="detail-panel-edit-date-button"]';
  const LINK_ATTR = 'data-userscript-more-from-day';
  const DAY_MS = 24 * 60 * 60 * 1000;

  const searches = new Map(); // asset id -> search address (or null if it could not be built)

  const loadSearch = async (id) => {
    if (searches.has(id)) {
      return searches.get(id);
    }
    searches.set(id, null);
    try {
      const response = await fetch(`/api/assets/${id}`, { credentials: 'same-origin' });
      if (!response.ok) {
        return null;
      }
      const asset = await response.json();
      const local = Date.parse(asset.localDateTime);
      const taken = Date.parse(asset.fileCreatedAt);
      if (Number.isNaN(local) || Number.isNaN(taken)) {
        return null;
      }
      // localDateTime is the wall-clock time written as UTC, so its UTC midnight is the
      // start of the day there; shifting by the offset gives the real instant
      const offset = local - taken;
      const dayStart = Math.floor(local / DAY_MS) * DAY_MS - offset;
      const query = {
        takenAfter: new Date(dayStart).toISOString(),
        takenBefore: new Date(dayStart + DAY_MS - 1).toISOString(),
      };
      const address = `/search?query=${encodeURIComponent(JSON.stringify(query))}`;
      searches.set(id, address);
      return address;
    } catch {
      return null;
    }
  };

  const sync = async () => {
    const id = location.pathname.match(ASSET_PATH)?.[1];
    const dateButton = id ? document.querySelector(DATE_BUTTON) : null;
    if (!dateButton) {
      return;
    }

    const existing = dateButton.parentElement.querySelector(`[${LINK_ATTR}]`);
    if (existing?.getAttribute(LINK_ATTR) === id) {
      return;
    }
    existing?.remove();

    const address = await loadSearch(id);
    // the viewer may have moved on while the dates were loading
    if (!address || !dateButton.isConnected || location.pathname.match(ASSET_PATH)?.[1] !== id) {
      return;
    }
    if (dateButton.parentElement.querySelector(`[${LINK_ATTR}]`)) {
      return;
    }

    const link = document.createElement('a');
    link.href = address;
    link.setAttribute(LINK_ATTR, id);
    link.textContent = 'See more from this day';
    // indented to line up with the date text, which sits after the 24px icon and a 16px gap
    link.style.cssText = 'display:block;margin:-8px 0 8px 40px;font-size:14px;color:rgb(var(--immich-primary, 66 80 175));text-decoration:underline;cursor:pointer';
    dateButton.after(link);
  };

  // Immich is a single-page app, so watch for the viewer opening instead of page loads.
  setInterval(sync, 500);
})();
