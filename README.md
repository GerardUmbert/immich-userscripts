# immich-userscripts

Tampermonkey userscripts for the Immich web UI. They only change what your browser asks for and shows. Nothing is changed on the server.

| Script | What it does |
| --- | --- |
| [immich-recently-added-archived](scripts/immich-recently-added-archived.user.js) | Adds an eye toggle at the right end of the *Recently added* title bar ("Hiding archived" / "Showing archived"). Archived items get Immich's archive icon in the bottom-right corner of the thumbnail. |
| [immich-albums-hide-archived](scripts/immich-albums-hide-archived.user.js) | Hides archived items inside albums by default. An eye button, crossed out while they are hidden, sits with the action buttons in the album's top bar. |

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/). On Chrome or Edge, turn on **Developer mode** in the extensions page, or userscripts won't run.
2. Open a script's **Raw** link on GitHub. Tampermonkey offers to install it, and checks this repo for updates afterward.
3. The scripts run on hosts that start with `immich.` (for example `immich.yourdomain.com`). For another address, change the `@include` line at the top of the script, for example `// @include /^http:\/\/localhost:2283\/.*/`.

The choice is never remembered: every page load, and every album you open, starts with archived items hidden. Clicking the eye reloads the page once with archived items shown; leaving the page or reloading again hides them.

## Known limitations

- **Recently added:** assets from partners are not listed while archived items are shown. The server refuses to combine them with archived assets.
- **Recently added:** the Archive/Unarchive action can show the wrong state until you reload, because the script presents archived assets to the app as normal ones.
- **Albums:** the asset count in the album header still counts archived items while they are hidden.

## How they work

The web app talks to `/api/timeline/buckets` and `/api/timeline/bucket`. The scripts wrap `window.fetch` and edit those requests (and, for *Recently added*, the response). The comments at the top of each script explain the details. This depends on Immich's internals, so it can break when Immich changes.

## Checking new Immich releases

[anchors.mjs](anchors.mjs) lists every assumption the scripts make about Immich's source, each with the script it affects (for example "the Recently added page requests `visibility=timeline`" or "the SDK uses the global `fetch`"). Each one is a pattern that must appear (or must not appear) in a given file.

```
node tools/check.mjs setup                   # clone Immich at the version in anchors.mjs (file contents are fetched on demand)
node tools/check.mjs anchors [tag]           # verify the assumptions; exit code 2 if any is broken
node tools/check.mjs diff <oldTag> <newTag>  # which anchored files changed between two releases
```

Two GitHub Actions run this:

- **Check script assumptions** runs on every push or pull request that touches a script, `anchors.mjs` or `tools/`. It catches a new feature that was never given an anchor.
- **Check upstream Immich** runs every Monday. If Immich has a stable release newer than `checkedAgainst` in `anchors.mjs`, it checks the assumptions against it. If one is broken it opens an issue ("Immich <tag> released: userscripts need a fix"), at most one per release, and leaves `checkedAgainst` alone. If every assumption holds, it moves `checkedAgainst` to the new release with a commit on `main`, and never moves it backwards. You can also run it from the Actions tab, with an optional tag and a dry-run switch (which skips both the issue and the commit).

A passing check means the code the scripts depend on is still there, not that they work, and `checkedAgainst` moves on without anyone looking. After a release, open *Recently added* and an album and try the eye buttons. If an issue was opened, fix the scripts or the anchors, then set `checkedAgainst` to the new release by hand.

When you change a script so it relies on something new, add an anchor for it in `anchors.mjs`.
