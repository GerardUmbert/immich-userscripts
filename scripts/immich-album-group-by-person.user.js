// ==UserScript==
// @name         Immich: group an album by person
// @description  Adds a button to an album's top bar that shows the album grouped by the people in it: a section per person with their photos.
// @version      1.0.1
// @updateURL    https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-album-group-by-person.user.js
// @downloadURL  https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-album-group-by-person.user.js
// @include      /^https?:\/\/immich\..*/
// @grant        none
// ==/UserScript==

// Runs on any site whose host starts with "immich." (for example immich.yourdomain.com).
// For another address (an IP or localhost), change the @include line above.
//
// How it works: Immich's album and search grids are flat, so they cannot show a heading per
// person. The button opens a full-page panel of its own instead. It searches for everything in
// the album (the search accepts an `albumIds` filter and `withPeople`, which adds the
// recognised people to each result), groups the results by person, and draws a section for each
// one: the person's face, name and photo count, then their thumbnails. A photo with several
// people appears in each of their sections. Clicking a thumbnail closes the panel and opens the
// photo in Immich's viewer.
//
// Sections: named people by photo count (most first), then one "Unnamed people" section for
// faces you have not named yet, then "No person" for photos without a recognised person.
// People you have hidden in Immich are skipped.
//
// Archived items follow the eye button of the "hide archived in albums" script: shown when
// the eye says "Showing archived", left out when it says "Hiding archived". Without that
// script, archived items are included, as the album itself shows them.

(() => {
  'use strict';

  const PAGE_PATH = /^\/albums\/([0-9a-f-]{36})(\/|$)/i;
  const PAGE_SIZE = 1000;
  const MAX_PAGES = 40;

  const albumId = () => location.pathname.match(PAGE_PATH)?.[1] ?? null;

  // The eye of the "hide archived in albums" script says which state the album is in.
  const archivedShown = () => {
    const eye = [...document.querySelectorAll('[data-testid="control-bar"] nav button[title], #control-bar nav button[title]')].find(
      (candidate) => /^(Showing|Hiding) archived/.test(candidate.title),
    );
    return !eye || eye.title.startsWith('Showing');
  };

  // --- loading ---------------------------------------------------------------

  const searchAll = async (id, visibility, signal) => {
    const items = [];
    for (let page = 1, n = 0; page && n < MAX_PAGES; n++) {
      const response = await fetch('/api/search/metadata', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        signal,
        body: JSON.stringify({ albumIds: [id], withPeople: true, visibility, size: PAGE_SIZE, page }),
      });
      if (!response.ok) {
        throw new Error(`search failed (${response.status})`);
      }
      const assets = (await response.json())?.assets;
      if (!Array.isArray(assets?.items)) {
        throw new Error('unexpected search response');
      }
      items.push(...assets.items);
      page = assets.nextPage ? Number(assets.nextPage) : 0;
    }
    return items;
  };

  const loadAlbum = async (id, signal) => {
    // the search cannot ask for both visibilities at once, so archived items are a second search
    const loads = [searchAll(id, 'timeline', signal)];
    if (archivedShown()) {
      loads.push(searchAll(id, 'archive', signal));
    }
    return (await Promise.all(loads)).flat();
  };

  const takenAt = (asset) => Date.parse(asset.localDateTime ?? asset.fileCreatedAt ?? '') || 0;

  // -> [{ key, name, personId, assets }] in display order
  const group = (items) => {
    const people = new Map(); // named people
    const unnamed = new Map(); // asset id -> asset
    const without = [];
    for (const asset of items) {
      const faces = (asset.people ?? []).filter((person) => !person.isHidden);
      if (faces.length === 0) {
        without.push(asset);
        continue;
      }
      for (const person of faces) {
        if (person.name) {
          if (!people.has(person.id)) {
            people.set(person.id, { key: person.id, name: person.name, personId: person.id, assets: [] });
          }
          people.get(person.id).assets.push(asset);
        } else {
          unnamed.set(asset.id, asset);
        }
      }
    }

    const byNewest = (a, b) => takenAt(b) - takenAt(a);
    const sections = [...people.values()].sort(
      (a, b) => b.assets.length - a.assets.length || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
    if (unnamed.size > 0) {
      sections.push({ key: 'unnamed', name: 'Unnamed people', personId: null, assets: [...unnamed.values()] });
    }
    if (without.length > 0) {
      sections.push({ key: 'none', name: 'No person', personId: null, assets: without });
    }
    for (const section of sections) {
      section.assets.sort(byNewest);
    }
    return sections;
  };

  // --- the panel ---------------------------------------------------------------

  let panel;
  let loading;

  const closePanel = () => {
    loading?.abort();
    loading = undefined;
    panel?.remove();
    panel = undefined;
    document.removeEventListener('keydown', onKey, true);
  };

  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closePanel();
    }
  };

  const el = (tag, css, text) => {
    const node = document.createElement(tag);
    if (css) {
      node.style.cssText = css;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  };

  const renderSection = (section, id) => {
    const wrap = el('section', 'margin:0 0 32px');

    const head = el('div', 'display:flex;align-items:center;gap:12px;margin:0 0 12px');
    if (section.personId) {
      const face = el('img', 'width:48px;height:48px;border-radius:9999px;object-fit:cover;background:rgba(128,128,128,.25)');
      face.src = `/api/people/${section.personId}/thumbnail`;
      face.alt = '';
      face.loading = 'lazy';
      head.append(face);
    }
    head.append(el('h2', 'margin:0;font-size:20px;font-weight:600', section.name));
    head.append(el('span', 'font-size:14px;opacity:.7', `${section.assets.length} ${section.assets.length === 1 ? 'photo' : 'photos'}`));
    wrap.append(head);

    const grid = el('div', 'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:4px');
    for (const asset of section.assets) {
      const link = el('a', 'position:relative;display:block;aspect-ratio:1;overflow:hidden;border-radius:8px;background:rgba(128,128,128,.25)');
      link.href = `/albums/${id}/photos/${asset.id}`;
      link.title = asset.originalFileName ?? '';
      // Immich's router follows the link by itself; the panel only has to get out of the way.
      // A modified click (new tab or window) leaves the panel open.
      link.addEventListener('click', (event) => {
        if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
          setTimeout(closePanel, 0);
        }
      });
      const image = el('img', 'width:100%;height:100%;object-fit:cover;display:block');
      image.src = `/api/assets/${asset.id}/thumbnail?size=thumbnail`;
      image.alt = asset.originalFileName ?? '';
      image.loading = 'lazy';
      link.append(image);
      if (asset.type === 'VIDEO') {
        link.append(el('span', 'position:absolute;right:6px;bottom:6px;padding:0 6px;border-radius:9999px;font-size:12px;background:rgba(0,0,0,.6);color:#fff', '▶'));
      }
      grid.append(link);
    }
    wrap.append(grid);
    return wrap;
  };

  const openPanel = async () => {
    if (panel) {
      closePanel();
      return;
    }
    const id = albumId();
    if (!id) {
      return;
    }
    const dark = document.documentElement.classList.contains('dark');
    panel = el(
      'div',
      [
        'position:fixed',
        'inset:0',
        'z-index:60',
        'overflow:auto',
        `background:${dark ? '#0b0c0e' : '#fafafa'}`,
        `color:${dark ? '#e5e7eb' : '#1f2937'}`,
      ].join(';'),
    );
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Album grouped by person');

    const bar = el(
      'div',
      `position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:12px;padding:12px 20px;background:${dark ? '#0b0c0e' : '#fafafa'};border-bottom:1px solid rgba(128,128,128,.3)`,
    );
    const close = el('button', 'padding:6px 14px;border:1px solid rgba(128,128,128,.4);border-radius:9999px;background:transparent;color:inherit;font:inherit;font-size:14px;cursor:pointer', 'Close');
    close.type = 'button';
    close.addEventListener('click', closePanel);
    bar.append(close, el('strong', 'font-size:16px', 'Grouped by person'));
    const status = el('span', 'font-size:14px;opacity:.7', archivedShown() ? 'including archived' : 'archived hidden');
    bar.append(status);

    const body = el('div', 'padding:20px;max-width:1600px;margin:0 auto');
    body.append(el('p', 'opacity:.7', 'Loading...'));
    panel.append(bar, body);
    document.body.append(panel);
    document.addEventListener('keydown', onKey, true);

    const controller = new AbortController();
    loading = controller;
    try {
      const sections = group(await loadAlbum(id, controller.signal));
      if (controller.signal.aborted) {
        return;
      }
      body.replaceChildren(
        ...(sections.length > 0
          ? sections.map((section) => renderSection(section, id))
          : [el('p', 'opacity:.7', 'Nothing to show in this album.')]),
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        body.replaceChildren(el('p', 'color:#ef4444', `Could not load the album: ${error.message}`));
      }
    }
  };

  // --- button in the album's top bar -------------------------------------------

  // Material Design "group" icon
  const ICON =
    'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z';

  // the row of action buttons on the right of the album's top bar
  const ACTIONS = '#control-bar nav > div.ms-auto, [data-testid="control-bar"] nav > div.ms-auto';

  let button;

  // Copies the look of one of Immich's own action buttons, so the new one matches in
  // size, shape, hover and theme without any styling of its own.
  const createButton = (template) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = template.className;
    node.title = 'Group this album by person';
    node.setAttribute('aria-label', 'Group this album by person');
    node.setAttribute('data-userscript-album-group', '');

    const svg = template.querySelector('svg').cloneNode(true);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICON);
    svg.replaceChildren(path);
    node.append(svg);

    node.addEventListener('click', openPanel);
    return node;
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
