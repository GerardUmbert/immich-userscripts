// ==UserScript==
// @name         Immich: video volume keys
// @description  Control the volume of the video in the viewer with the up and down arrow keys, with a small volume readout.
// @version      1.0.0
// @updateURL    https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-video-volume-keys.user.js
// @downloadURL  https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-video-volume-keys.user.js
// @include      /^https?:\/\/immich\..*/
// @grant        none
// ==/UserScript==

// Runs on any site whose host starts with "immich." (for example immich.yourdomain.com).
// For another address (an IP or localhost), change the @include line above.
//
// How it works: while the viewer shows a <video> (or <hls-video>) element, the up and down
// arrow keys change that element's volume by 5 percentage points. Up also unmutes. The key
// press is swallowed so the page does not also scroll or react to it. Nothing is stored on the
// server and the volume is whatever the player normally remembers.

(() => {
  'use strict';

  const ASSET_PATH = /\/photos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/|$)/i;
  const VIDEO = 'hls-video, video';
  const STEP = 0.05;
  const TOAST_ATTR = 'data-userscript-video-volume';

  let toastTimer;

  const showToast = (volume) => {
    let toast = document.querySelector(`[${TOAST_ATTR}]`);
    if (!toast) {
      toast = document.createElement('div');
      toast.setAttribute(TOAST_ATTR, '');
      toast.style.cssText =
        'position:fixed;top:72px;left:50%;transform:translateX(-50%);z-index:100000;padding:6px 14px;border-radius:9999px;background:rgba(0,0,0,0.7);color:white;font:600 14px sans-serif;pointer-events:none;transition:opacity 0.2s';
      document.body.append(toast);
    }
    toast.textContent = volume === 0 ? 'Volume: muted' : `Volume: ${Math.round(volume * 100)}%`;
    toast.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.style.opacity = '0'), 900);
  };

  const typing = (target) =>
    target instanceof Element &&
    (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"]'));

  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || typing(event.target)) {
        return;
      }
      if (!ASSET_PATH.test(location.pathname)) {
        return;
      }
      const video = document.querySelector(VIDEO);
      if (!video) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      const up = event.key === 'ArrowUp';
      const base = video.muted ? 0 : video.volume;
      // round to avoid float drift like 0.30000000000000004
      const volume = Math.min(1, Math.max(0, Math.round((base + (up ? STEP : -STEP)) * 100) / 100));
      if (up && video.muted) {
        video.muted = false;
      }
      video.volume = volume;
      showToast(video.muted ? 0 : volume);
    },
    true,
  );
})();
