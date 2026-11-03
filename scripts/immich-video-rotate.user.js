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
// element only, resized so the turned picture fills the player the other way round (a
// portrait video turned sideways becomes as wide as the player allows). The file on the
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
    let shift = '';
    // the element is only as wide as the picture (it has a height but no width of its own),
    // so the room to grow into is the player around it, not the element's own box
    const area = (video.closest('media-controller') ?? video.parentElement).getBoundingClientRect();
    const box = video.getBoundingClientRect();
    if (degrees % 180 !== 0 && box.width && box.height && area.width && area.height) {
      // swap width and height: the turned picture has to fit the player the other way round
      let shownW = box.width;
      let shownH = box.height;
      if (video.videoWidth && video.videoHeight) {
        // the picture is fitted with "contain" inside the element, which can leave bars
        const fit = Math.min(box.width / video.videoWidth, box.height / video.videoHeight);
        shownW = video.videoWidth * fit;
        shownH = video.videoHeight * fit;
      }
      scale = Math.min(area.width / shownH, area.height / shownW);
      // turn around the middle of the player, not the middle of the narrower element
      const dx = area.left + area.width / 2 - (box.left + box.width / 2);
      const dy = area.top + area.height / 2 - (box.top + box.height / 2);
      shift = `translate(${dx}px, ${dy}px) `;
    }
    video.style.transform = `${shift}rotate(${degrees}deg) scale(${scale})`;
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
