# immich-userscripts

Tampermonkey userscripts for the Immich web UI. They only change what your browser asks for and shows. Nothing is changed on the server.

| Script | What it does |
| --- | --- |
| [immich-recently-added-archived](scripts/immich-recently-added-archived.user.js) | Adds an eye toggle at the right end of the *Recently added* title bar ("Hiding archived" / "Showing archived"). Archived items get Immich's archive icon in the bottom-right corner of the thumbnail. |
| [immich-archive-sort-added](scripts/immich-archive-sort-added.user.js) | Sorts the *Archive* and *Locked folder* pages by the date items were added to Immich (newest first) instead of the date they were taken. A button in the title bar ("Sorted by date added" / "Sorted by date taken") switches to Immich's own order for that visit. |
| [immich-search-sort-added](scripts/immich-search-sort-added.user.js) | Adds a sort menu to the search results top bar: date added (the default, newest first), Immich's own order, longest or shortest video, largest or smallest file, and name. The search API can't do most of these, so the script loads all result pages and sorts them itself. |
| [immich-asset-more-from-day](scripts/immich-asset-more-from-day.user.js) | Adds a "See more from this day" link under the date in the photo viewer's info panel. It opens a search for everything taken that day. |
| [immich-video-rotate](scripts/immich-video-rotate.user.js) | Adds rotate-left and rotate-right buttons to the video viewer's top bar. They turn the video picture itself by 90 degrees (the player controls stay upright). The turn is only in your browser, not in the file, and is remembered per video. |
| [immich-video-volume-keys](scripts/immich-video-volume-keys.user.js) | Lets you change the volume of the video in the viewer with the up and down arrow keys (5% per press, up also unmutes). A small readout shows the new volume. |
| [immich-album-sort](scripts/immich-album-sort.user.js) | Adds a sort button to an album's top bar. Pick an order (longest or shortest video, largest or smallest file, name, date added) and the album opens as a flat list of search results in that order. Needs *immich-search-sort-added* as well, and leaves archived items out. |
| [immich-album-search](scripts/immich-album-search.user.js) | Adds a magnifier button to an album's top bar that searches only inside that album. A small panel asks for the text, whether to match content or file names (`.mp4` finds an extension), the kind of file (any, photos, videos, audio, other), and whether to look at archived items or not. |
| [immich-search-album-filter](scripts/immich-search-album-filter.user.js) | Adds an *Album* section below *Library* in the search filters (under *Advanced filters*), with a searchable list of your albums. Pick one and every search is limited to it, whatever other filters you use; pick "All albums" to go back. |
| [immich-albums-hide-archived](scripts/immich-albums-hide-archived.user.js) | Hides archived items inside albums by default. An eye button, crossed out while they are hidden, sits with the action buttons in the album's top bar. |
| [immich-album-group-by-person](scripts/immich-album-group-by-person.user.js) | Adds a button to an album's top bar that opens the album grouped by person: a section per person with their face, name, photo count and thumbnails, most photos first. A photo with several people appears in each of their sections; faces you have not named are collected under *Unnamed people*, and photos without a recognised person under *No person*. Archived items follow the eye button of *immich-albums-hide-archived* (included when it says "Showing archived", and also when that script is not installed). |

## Why these exist

Archived assets are hidden from the timeline, and *Recently added* is a fixed view of the latest uploads. The Immich maintainers decided not to add filters to it ([discussion #32416](https://github.com/immich-app/immich/discussions/32416)). The problem shows up with automation: if a workflow archives new uploads as they arrive, they disappear from every view that matters, and the Archive page sorts by date taken, so they end up among thousands of older archived items. Archived is meant to be hidden, not unreachable, so these scripts add the missing controls on the client side.

## Install

### 1. Install Tampermonkey

Get [Tampermonkey](https://www.tampermonkey.net/) for your browser. Then allow it to run userscripts:

- **Chrome or Edge:** open the extensions page (`chrome://extensions` or `edge://extensions`), turn on **Developer mode**, and open Tampermonkey's **Details**. If there is an **Allow User Scripts** switch, turn it on too. Without these, installed scripts silently do nothing.
- **Firefox:** nothing extra to do.

### 2. Install the scripts

Click a link below. Tampermonkey opens an install page; click **Install**. Install only the ones you want.

| Script | Install |
| --- | --- |
| Show archived in *Recently added* | [Install](https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-recently-added-archived.user.js) |
| Sort *Archive* and *Locked folder* by date added | [Install](https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-archive-sort-added.user.js) |
| Sort search results (date added, video length, size, name) | [Install](https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-search-sort-added.user.js) |
| See more from this day (photo viewer) | [Install](https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-asset-more-from-day.user.js) |
| Rotate videos in the viewer | [Install](https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-video-rotate.user.js) |
| Volume keys for videos (up/down arrows) | [Install](https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-video-volume-keys.user.js) |
| Sort an album's contents (needs the search sort script) | [Install](https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-album-sort.user.js) |
| Search within an album | [Install](https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-album-search.user.js) |
| Album filter for search | [Install](https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-search-album-filter.user.js) |
| Hide archived in albums | [Install](https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-albums-hide-archived.user.js) |
| Group an album by person | [Install](https://raw.githubusercontent.com/GerardUmbert/immich-userscripts/main/scripts/immich-album-group-by-person.user.js) |

The links point at the raw `.user.js` files on `main`. Tampermonkey recognises that file type and shows its install page instead of the code. Each script also declares the same address as its update source, so Tampermonkey picks up new versions by itself (it checks about once a day; **Utilities > Check for userscript updates** in the dashboard does it now).

If the link shows plain code instead of an install page, copy the address and use **Dashboard > Utilities > Import from URL** in Tampermonkey. Or, in the dashboard, create a new script and paste the file's contents over the template.

### 3. Point them at your Immich

The scripts run on hosts that start with `immich.` (for example `immich.yourdomain.com`). If yours is different, such as an IP address or `localhost`, open the script in the Tampermonkey dashboard and add your address under **Settings > User includes**, for example `http://localhost:2283/*`. That survives updates. (Editing the `@include` line in the code works too, but an update overwrites it.)

### 4. Check it works

Reload Immich. Tampermonkey's toolbar icon should show a number for the active scripts. *Recently added* should now have the eye toggle in its title bar.

### Behaviour


The choice is never remembered: every page load, and every album you open, starts with archived items hidden. Clicking the eye reloads the page once with archived items shown; leaving the page or reloading again hides them.

## Known limitations

- **Recently added:** assets from partners are not listed while archived items are shown. The server refuses to combine them with archived assets.
- **Recently added:** the Archive/Unarchive action can show the wrong state until you reload, because the script presents archived assets to the app as normal ones.
- **Archive and Locked folder:** the choice is never remembered either; every page load sorts by date added. The date headings show when items were added, not when they were taken. The dates are in UTC, so an item added just after midnight local time can appear under the previous or next day. The photo viewer still shows the real capture date.
- **Search album filter:** the picked album is never remembered; every page load and every visit to the search page starts with all albums.
- **Search:** every result page is loaded up front (up to 40 pages), so big searches take longer to appear, and smart search loses its relevance order while sorted by date added. The choice is never remembered either.
- **Video rotate:** only the picture in your browser is turned, not the file, so other devices, shares and other users still see the original. The turn is remembered per video in the browser's local storage (clearing site data forgets it). 360° panorama videos use a different player and are not rotated.
- **Albums:** the asset count in the album header still counts archived items while they are hidden.
- **Group by person:** it is a panel of its own, so opening a photo from it loads Immich's viewer afresh (archived items are hidden again there, and the viewer's next and previous follow the album's order, not the group). Every photo of the album is loaded up front (up to 40,000), and people you have hidden in Immich are skipped.

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
