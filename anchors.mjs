// Assumptions the userscripts make about Immich's source. `tools/check.mjs anchors <ref>`
// verifies each one against a given Immich tag and fails when one stops being true.
//
//   scripts  which userscripts break if the assumption fails
//   file     path inside the immich-app/immich repo
//   match    pattern that must appear in the file   (or)
//   absent   pattern that must NOT appear in the file
//   means    the assumption, in plain words
//
// When a script starts relying on something new, add an anchor for it here.

export const checkedAgainst = 'v3.3.1';

const RECENTLY_ADDED = 'web/src/routes/(user)/recently-added/[[photos=photos]]/[[assetId=id]]/+page.svelte';
const ALBUM_PAGE = 'web/src/routes/(user)/albums/[albumId=id]/[[photos=photos]]/[[assetId=id]]/+page.svelte';
const SDK = 'packages/sdk/src/fetch-client.ts';
const BUCKET_DTO = 'server/src/dtos/time-bucket.dto.ts';
const ASSET_REPO = 'server/src/repositories/asset.repository.ts';

export const anchors = [
  // --- both scripts: how the web app talks to the server ---------------------
  {
    scripts: ['recently-added', 'albums', 'archive-sort'],
    file: SDK,
    match: /baseUrl:\s*"\/api"/,
    means: 'the web app calls the API under /api',
  },
  {
    scripts: ['recently-added', 'albums', 'archive-sort'],
    file: SDK,
    match: /`\/timeline\/bucket\$\{QS\.query/,
    means: 'the month data comes from GET /timeline/bucket',
  },
  {
    scripts: ['recently-added', 'albums', 'archive-sort'],
    file: SDK,
    match: /`\/timeline\/buckets\$\{QS\.query/,
    means: 'the month list comes from GET /timeline/buckets',
  },
  {
    scripts: ['recently-added', 'albums', 'archive-sort'],
    file: SDK,
    absent: /defaults[^=]*=\s*\{[^}]*\bfetch\s*:/,
    means: 'the SDK uses the global fetch (a custom fetch would bypass the scripts)',
  },
  {
    scripts: ['recently-added', 'albums', 'archive-sort'],
    file: 'server/src/controllers/timeline.controller.ts',
    match: /@Controller\('timeline'\)[\s\S]*@Get\('buckets'\)[\s\S]*@Get\('bucket'\)/,
    means: 'the server serves /timeline/buckets and /timeline/bucket',
  },
  {
    scripts: ['recently-added', 'albums', 'archive-sort'],
    file: 'server/src/app.common.ts',
    match: /setGlobalPrefix\('api'/,
    means: 'the server prefix is /api',
  },
  {
    scripts: ['recently-added', 'albums'],
    file: BUCKET_DTO,
    match: /visibility:\s*AssetVisibilitySchema\.optional\(\)/,
    means: 'the timeline endpoints accept an optional visibility query parameter',
  },
  {
    scripts: ['recently-added', 'albums'],
    file: 'server/src/enum.ts',
    match: /Archive = 'archive',\s*Timeline = 'timeline'/,
    means: "visibility values are the strings 'archive' and 'timeline'",
  },

  // --- archive: sort by date added -------------------------------------------
  {
    scripts: ['archive-sort'],
    file: 'web/src/routes/(user)/archive/[[photos=photos]]/[[assetId=id]]/+page.svelte',
    match: /const options = \{ visibility: AssetVisibility\.Archive \};/,
    means: 'the Archive page asks for visibility=archive and sets no ordering of its own',
  },
  {
    scripts: ['archive-sort'],
    file: 'web/src/routes/(user)/archive/[[photos=photos]]/[[assetId=id]]/+page.svelte',
    match: /<UserPageLayout[^>]*title=\{data\.meta\.title\}/,
    means: 'the Archive page shows its title through UserPageLayout, with no buttons of its own',
  },
  {
    scripts: ['archive-sort'],
    file: BUCKET_DTO,
    match: /orderBy:\s*AssetOrderBySchema\.optional\(\)/,
    means: 'the timeline endpoints accept an optional orderBy query parameter',
  },
  {
    scripts: ['archive-sort'],
    file: 'server/src/enum.ts',
    match: /CreatedAt = 'createdAt'/,
    means: "the orderBy value for date added is the string 'createdAt'",
  },
  {
    scripts: ['archive-sort'],
    file: 'server/src/utils/database.ts',
    match: /order === AssetOrderBy\.CreatedAt \? 'asset\.createdAt' : 'localDateTime'\)\}\s*AT TIME ZONE 'UTC'\)/,
    means: 'with orderBy=createdAt the server builds its months from the upload date, in UTC',
  },
  {
    scripts: ['archive-sort'],
    file: BUCKET_DTO,
    match: /TimeBucketAssetResponseSchema[\s\S]*?\bcreatedAt:[\s\S]*?\bfileCreatedAt:[\s\S]*?\blocalOffsetHours:/,
    means: 'the month data has parallel fileCreatedAt[], localOffsetHours[] and createdAt[] arrays',
  },
  {
    scripts: ['archive-sort'],
    file: 'web/src/lib/managers/timeline-manager/timeline-month.svelte.ts',
    match: /getTimes\(\s*bucketAssets\.fileCreatedAt\[i\],\s*bucketAssets\.localOffsetHours\[i\],?\s*\)/,
    means: 'the web app derives an asset\'s capture date from fileCreatedAt and localOffsetHours (the script overwrites both)',
  },
  {
    scripts: ['archive-sort'],
    file: 'web/src/lib/managers/timeline-manager/timeline-month.svelte.ts',
    match: /month !== dateTime\.month \|\| year !== dateTime\.year[\s\S]{0,80}unprocessedAssets/,
    means: 'the web app drops assets whose date is outside the month requested (why the dates must match the server months)',
  },

  // --- recently added: show archived -----------------------------------------
  {
    scripts: ['recently-added'],
    file: RECENTLY_ADDED,
    match: /visibility:\s*AssetVisibility\.Timeline/,
    means: 'the Recently added page requests visibility=timeline (the parameter the script removes)',
  },
  {
    scripts: ['recently-added'],
    file: ASSET_REPO,
    match: /\$if\(options\.visibility === undefined, withDefaultVisibility\)/,
    means: 'without a visibility parameter the server falls back to the default visibility filter',
  },
  {
    scripts: ['recently-added'],
    file: 'server/src/utils/database.ts',
    match: /withDefaultVisibility[\s\S]{0,200}'in',\s*\[sql\.lit\(AssetVisibility\.Archive\),\s*sql\.lit\(AssetVisibility\.Timeline\)\]/,
    means: 'the default visibility filter includes archived assets',
  },
  {
    scripts: ['recently-added'],
    file: BUCKET_DTO,
    match: /TimeBucketAssetResponseSchema[\s\S]*?\bid:\s*z\.array\(z\.string\(\)\)[\s\S]*?visibility:\s*z\s*\.array\(AssetVisibilitySchema\)/,
    means: 'the month data has parallel id[] and visibility[] arrays (the script relabels visibility[])',
  },
  {
    scripts: ['recently-added'],
    file: 'web/src/lib/managers/timeline-manager/timeline-month.svelte.ts',
    match: /this\.timelineManager\.isExcluded\(timelineAsset\)/,
    means: 'the web app drops incoming assets that fail isExcluded (why the script relabels them)',
  },
  {
    scripts: ['recently-added'],
    file: 'web/src/lib/managers/timeline-manager/timeline-manager.svelte.ts',
    match: /isMismatched\(this\.#options\.visibility,\s*asset\.visibility\)/,
    means: 'isExcluded compares the asset visibility with the page option',
  },
  {
    scripts: ['recently-added'],
    file: 'web/src/lib/components/assets/thumbnail/Thumbnail.svelte',
    match: /data-asset=\{asset\.id\}/,
    means: 'each thumbnail carries data-asset="<id>" (the badge is attached through it)',
  },

  {
    scripts: ['recently-added', 'archive-sort'],
    file: 'web/src/lib/components/layouts/UserPageLayout.svelte',
    match: /export const headerId = 'user-page-header'[\s\S]*justify-between[\s\S]*id=\{headerId\}/,
    means: 'the page title has id "user-page-header" and sits in a justify-between bar (the eye is appended to that bar)',
  },
  {
    scripts: ['recently-added'],
    file: RECENTLY_ADDED,
    match: /<UserPageLayout[^>]*title=\{data\.meta\.title\}/,
    means: 'the Recently added page shows its title through UserPageLayout, with no buttons of its own',
  },

  // --- albums: hide archived -------------------------------------------------
  {
    scripts: ['albums'],
    file: 'web/src/lib/components/shared-components/ControlAppBar.svelte',
    match: /id="control-bar"[\s\S]*<ControlBarOverflow>[\s\S]*\{@render trailing\(\)\}/,
    means: 'the top bar has id "control-bar" and puts the trailing action buttons in ControlBarOverflow (the eye is added there)',
  },
  {
    scripts: ['albums'],
    file: ALBUM_PAGE,
    match: /<ControlAppBar backIcon=\{mdiArrowLeft\}[\s\S]*\{#snippet trailing\(\)\}[\s\S]*<ActionButton action=\{Actions\.Share\} \/>/,
    means: 'the normal album view has a top bar with trailing action buttons and no leading title',
  },
  {
    scripts: ['albums'],
    file: ALBUM_PAGE,
    match: /return \{ albumId, order: album\.order \};/,
    means: 'the album page asks for its assets by albumId without a visibility option',
  },
  {
    scripts: ['albums'],
    file: ASSET_REPO,
    match: /\$if\(!!options\.visibility, \(qb\) => qb\.where\('asset\.visibility', '=', options\.visibility!\)\)/,
    means: 'a visibility parameter filters the results, also together with albumId',
  },
  {
    scripts: ['albums'],
    file: BUCKET_DTO,
    match: /albumId:\s*z\.uuidv4\(\)\.optional\(\)/,
    means: 'the timeline endpoints take albumId as a query parameter',
  },
];
