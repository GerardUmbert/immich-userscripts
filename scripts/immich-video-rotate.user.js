// ==UserScript==
// @name         Immich: rotate video
// @description  Adds rotate-left and rotate-right buttons to the video viewer's top bar. They turn the video picture itself by 90 degrees, the player controls stay upright.
// @version      1.0.0
// @updateURL    https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-video-rotate.user.js
// @downloadURL  https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-video-rotate.user.js
// @include      /^https?:\/\/immich\..*/
// @grant        none
// ==/UserScript==

// Runs on any site whose host starts with "immich." (for example immich.yourdomain.com).
// For another address (an IP or localhost), change the @include line above.
//
// How it works: the viewer plays the file in a <video> (or <hls-video>) element, and the
// controls are separate elements next to it. The script puts a CSS rotation on that video
// element only, scaled down so the turned picture still fits the screen. The file on the
// server is not changed, and the rotation only exists in this browser. It is remembered per
// video, so reopening the same video shows it turned again.

(() => {
  'use strict';

  const ASSET_PATH = /\/photos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;
  const NAVBAR = '[data-testid="asset-viewer-navbar-actions"]';
  const VIDEO = 'hls-video, video';
  const GROUP_ATTR = 'data-userscript-video-rotate';
  const STORAGE_KEY = 'userscript-video-rotate';

  const ICON_LEFT = 'M4 2v6h6V6H7.1a7 7 0 1 1-2.1 6.6l-2 .5A9 9 0 1 0 5.7 6.3V2z';
  const ICON_RIGHT = 'M20 2v6h-6V6h2.9a7 7 0 1 0 2.1 6.6l2 .5A9 9 0 1 1 18.3 6.3V2z';

  const load = () => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
    } catch {
      return {};
    }
  };
  const save = (id, degrees) => {
    try {
      const all = load();
      if (degrees) {
        all[id] = degrees;
      } else {
        delete all[id];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // storage unavailable: the rotation just is not remembered
    }
  };

  const currentId = () => location.pathname.match(ASSET_PATH)?.[1];

  const apply = (video, degrees) => {
    // measured from the unturned size, so clear any earlier rotation first
    video.style.transform = '';
    if (!degrees) {
      return;
    }
    let scale = 1;
    const box = video.getBoundingClientRect();
    const vw = video.videoWidth || video.clientWidth;
    const vh = video.videoHeight || video.clientHeight;
    // the picture inside the element is fitted with "contain"; find its on-screen size
    // before turning, then shrink so the turned picture fits the same box
    if (degrees % 180 !== 0 && box.width && box.height && vw && vh) {
      const fit = Math.min(box.width / vw, box.height / vh);
      const shownW = vw * fit;
      const shownH = vh * fit;
      scale = Math.min(box.width / shownH, box.height / shownW);
    }
    video.style.transform = `rotate(${degrees}deg) scale(${scale})`;
  };

  const rotate = (step) => {
    const id = currentId();
    const video = document.querySelector(VIDEO);
    if (!id || !video) {
      return;
    }
    const degrees = (((load()[id] ?? 0) + step) % 360 + 360) % 360;
    save(id, degrees);
    apply(video, degrees);
  };

  const makeButton = (label, path, step) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.style.cssText =
      'display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:9999px;border:0;background:transparent;color:white;cursor:pointer';
    button.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="${path}"/></svg>`;
    button.addEventListener('mouseenter', () => (button.style.background = 'rgba(255,255,255,0.2)'));
    button.addEventListener('mouseleave', () => (button.style.background = 'transparent'));
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      rotate(step);
    });
    return button;
  };

  const sync = () => {
    const id = currentId();
    const video = id ? document.querySelector(VIDEO) : null;
    const navbar = document.querySelector(NAVBAR);
    const existing = navbar?.querySelector(`[${GROUP_ATTR}]`);

    if (!video || !navbar) {
      existing?.remove();
      return;
    }

    if (!existing) {
      const group = document.createElement('div');
      group.setAttribute(GROUP_ATTR, '');
      group.style.cssText = 'display:inline-flex;align-items:center';
      group.append(makeButton('Rotate left', ICON_LEFT, -90), makeButton('Rotate right', ICON_RIGHT, 90));
      navbar.prepend(group);
    }

    // Immich reuses the viewer between assets and may replace the element, so
    // re-apply whenever the video or the asset differs from what was last applied
    const wanted = load()[id] ?? 0;
    const key = `${id}:${wanted}:${video.videoWidth}x${video.videoHeight}:${innerWidth}x${innerHeight}`;
    if (video.getAttribute(GROUP_ATTR) !== key) {
      video.setAttribute(GROUP_ATTR, key);
      apply(video, wanted);
    }
  };

  // Immich is a single-page app, so watch for the viewer opening instead of page loads.
  setInterval(sync, 500);
})();
