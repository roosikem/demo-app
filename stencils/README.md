# Adding premade stencils

A stencil is plain data. The renderer (`rendering/frame-renderer.ts`) draws it on a canvas together with the
user's photo, so a new stencil needs no new code. This guide describes the format, the rules and the checks.

## Where to add

The face-frame module ships **no premade stencils** (only the colours, palettes and fonts of the customized
circle). Premade stencils come from:

| Case                                                | Where                                                                                                                                                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Premade image stencils (recommended)**            | the stencil zip on the server: images + `stencils.json`, see "Premade stencils from the server" – no code                                                                                            |
| Image stencils in the app's assets                  | image files in `src/assets/face-frame/stencils/` + `stencils.json`, see "Premade stencils from the assets folder"                                                                                    |
| Drawn stencils or image stencils with texts in code | a file in the app, e.g. `src/app/photo/company-stencils.ts`, passed in via `frameOptions.stencils` or `provideFaceFrame({ stencils })` (image stencils with texts: see `stencils/image-stencils.ts`) |

Stencils from the app come first, the server's are added after them. Passing stencils from the app keeps this
folder unchanged, so it can be replaced by a newer version:

```ts
import { Stencil } from 'app/face-frame';

export const COMPANY_STENCILS: Stencil[] = [/* entries */];

frameOptions: FaceFrameOptionsInput = { stencils: COMPANY_STENCILS };
```

## Choosing which stencils are shown

The editor shows the app's `options.stencils` followed by the stencils of `stencils.json`. Which server stencils
exist is decided by the zip (add, remove or reorder entries in `stencils.json`).

Notes:

- The first stencil in the list is selected when the user opens the Premade stencils tab for the first time.
- Without any stencil the tab shows "No premade stencils available." ("Loading premade stencils…" while
  `stencils.json` loads); to hide the tab: `features: {stencilsTab: false}`.
- Categories, chips and the dropdown follow the list automatically (the chips "All" + one per category show as soon
  as one stencil has a category); a category with no stencils disappears.
- Search, category chips and the dropdown can be switched off for short lists:
  `features: {stencilSearch: false, stencilCategories: false, stencilDropdown: false}`.

## Removing a stencil

Remove its entry (and image) from the stencil zip, or from the app's list. Users who saved a design with that
stencil get the first stencil of the list next time (photo position and stickers stay; with no stencils at all, the
customized circle). Do not reuse the removed id for a different design later.

## Coordinates

- Sizes are fractions of the outer radius (`1` = edge of the frame).
- Angles are degrees, `0` = top, clockwise: `90` right, `180` bottom, `270` left.
- Ring texts: `direction: 'cw'` for text at the top and on the sides, `'ccw'` for text at the bottom
  (keeps the letters upright).

## Format

```ts
{
  id: 'team-lead',              // unique, ^[A-Za-z0-9][\w-]{0,63}$, never change it later (saved in user state)
  label: 'Team lead',           // shown under the thumbnail, max 18 chars; may be an i18n key
  category: 'Team & Roles',     // existing category, see below
  tags: ['lead', 'manager'],    // optional extra search words
  config: {
    ring: {                     // null = no ring (e.g. diagonal badge only)
      fill: { type: 'solid', color: NAVY },     // or { type: 'gradient' | 'segments', colors: [...] }
      width: 0.16,                              // 0.05 .. 0.3
      arc: { start: 200, end: 470 },            // optional partial ring; end may be > 360 to cross the top
      innerLine: { color: WHITE, width: 0.02 }, // optional thin line on the inner edge
    },
    texts: [                    // 0..2 texts
      { text: 'Team lead', color: WHITE, center: 0, direction: 'cw', maxSpan: 120, fontWeight: 800 },
    ],
    badge: {                    // optional
      shape: 'bubble', color: NAVY, textColor: WHITE, lines: ['Ask', 'me'], angle: 135, icon: 'star',
      // style: 'floating' | 'joined' | 'flush' (default: joined if same colour as the ring, else floating)
    },
    // badge: { shape: 'diagonal', color: NIGHT, textColor: PAPER, title: 'PRO', titleColors: [AQUA, SPRING], lines: ['Subject', 'expert'] },
    decorations: [              // optional small symbols on the ring
      { symbol: '★', angle: 90, color: WHITE },
    ],
    photoClip: 'inner',         // 'outer' for partial rings and image stencils
    photoBackground: BG,
    // image: 'assets/face-frame/stencils/team-lead.png',  // optional artwork, drawn after the ring
  },
}
```

## Rules

1. **Colours** only from `stencils/colors.ts` (add a named constant there if a new colour is needed). Hex `#rrggbb`.
2. **Readable text:** contrast of a ring text against its ring colour at least **3:1** (for gradients and
   segments: against the first colour). White on dark rings, `INK` or a dark shade (`BROWN`, `FOREST`,
   `DEEP_SEA`, `DEEP_MINT`) on light rings (yellow, orange, mint, light green). The unit test checks this.
3. **Texts:** max 20 characters per ring text, max 2 ring texts, badge lines max 2 × 14 characters,
   diagonal badge title max 6 characters.
4. **Layout:** keep texts and badges apart.
   - Bubble badge at `135` (bottom right): bottom text at about `center: 215`, `maxSpan: 100`.
   - Diagonal badge (right side): top text at about `322`, bottom text at about `232`, `maxSpan` 60-70.
   - Partial ring: put the text inside the arc range and use `photoClip: 'outer'`.
5. **Content:** generic texts only – no names of real people, other companies, brands or products, no
   political, religious or health statements. Official company texts come from the business.
6. **Categories:** use an existing one – Classic, Celebration, Team & Roles, Skills & Learning, Wellbeing,
   Seasons & Events, Minimal, Artwork (image stencils). A new category appears as a chip automatically;
   add one only when at least ~5 stencils belong to it.
7. **Ids are permanent:** users' saved designs refer to them. To retire a stencil remove it from the list
   (saved designs fall back to the default); never reuse an old id for a different design.

## Premade stencils from the assets folder

A premade stencil is one finished image: frame artwork **and text** are in the image. A stencil in another
language is another image. No code change is needed to add one:

1. Put the image into `src/assets/face-frame/stencils/` (file rules: see "Image stencils" below).
   - directly in the folder → category "Artwork"
   - in a subfolder → the subfolder is the category, e.g. `celebration/star-ring.png` → "Celebration"
2. `npm run build` (or `npm start`) runs `scripts/face-frame-stencils.mjs` first. It writes
   `stencils.json` next to the images. A file that breaks a rule (SVG or other format, wrong size, no
   transparency, > 1 MB, unsafe name, > 200 stencils) is an **error: the build stops** and nothing is written,
   so the file cannot be deployed. > 200 KB is only a warning.
   Without the npm hook run it by hand: `node scripts/face-frame-stencils.mjs src/assets/face-frame/stencils`
3. Commit the image **and** `stencils.json`, deploy. The editor loads `stencils.json`
   (`provideFaceFrame({ stencilManifest: 'assets/face-frame/stencils/stencils.json' })`, resolved like the app's
   own links against `<base href>`) and shows the new stencil after the drawn ones. `stencilManifest` must be a
   fixed value in the code, never taken from user input.

Names: file names with letters, digits, `-` and `_` only. `star-ring.png` gets the id `img-star-ring` and the
label "Star ring". Label, category and tags can be edited in `stencils.json`; the script keeps them on the next
run (cut to 40 / 30 characters, max. 10 tags). **The id is stored in users' saved designs: do not rename or
delete a file that is in use** (those users get the default stencil). While `stencils.json` loads, or if it
cannot be loaded, a saved stencil from it stays selected in the state; the preview waits for the list (on a
load error it shows the default stencil and emits `STENCIL_MANIFEST_FAILED` once).

At runtime `stencils.json` is checked again (same origin only, no redirects, plain PNG file names, no `..`,
max. 200 entries), then every entry goes through the normal stencil validation.

## Premade stencils from the server

Instead of the assets folder, the backend can serve the stencils from a zip:
`provideFaceFrame({ stencilManifest: '/api/face-frame/stencils/stencils.json' })` (leading `/`; the API must be
on the same origin as the app). The images are then loaded from the same URL folder, e.g.
`/api/face-frame/stencils/Celebration/star-ring.png`. Use either this or the assets folder, not both.

The zip is stored in the file storage; its file id is configured with `-Dfaceframe.stencils.file-id=<id>` (or
the environment variable `FACEFRAME_STENCILS_FILE_ID`). The server reads it once at start
(`FileStorageServiceLocal.getFileByFieldId`, wrapped by `StencilStorage`).

```
stencils.zip                 zip the contents of the folder, not the folder itself
├── stencils.json            exactly this name, at the top level
├── face-frame-settings.json optional: editor settings (see demo-align/README.md, "Settings from the server")
├── laurel.png
├── Celebration/             at most one subfolder level
│   └── star-ring.png
└── stickers/                optional: image stickers (lower case, exactly this name)
    └── heart.png
```

Only PNG files and `stencils.json` are allowed in the zip (`__MACOSX/`, `.DS_Store`, `Thumbs.db` and `.gitkeep`
are skipped). Limits: 200 stencils, 100 stickers, 1 MB per file, 50 MB unpacked, 60 MB for the zip.

`stencils.json` is the master list and is required. Every PNG is listed exactly once, in the order shown:

```json
{
  "version": 1,
  "stencils": [
    {
      "id": "img-celebration-star-ring",
      "file": "Celebration/star-ring.png",
      "label": "Star ring",
      "category": "Celebration",
      "tags": ["stars"]
    }
  ],
  "stickers": [{ "id": "heart", "file": "stickers/heart.png", "label": "Heart" }]
}
```

- `id`: starts with `img-` (keeps it apart from stencils an app passes in code), then letters, digits, `-`, `_`,
  max. 64 characters, unique. It is stored in users' saved designs: keep it when an image is replaced or renamed.
- `file`: path in the zip, case-sensitive.
- `label` (max. 40 characters) and `category` (max. 30): required. `tags`: optional, max. 10 of 30 characters.
  Lengths count like JavaScript `length` (an emoji usually counts 2). No control characters, text direction
  marks or `<` `>`; emoji sequences and soft hyphens are fine.
- Other fields are not passed on to the browser.
- `stickers/` is reserved for stickers: an older zip that used it as a stencil category is now rejected; rename that
  folder (e.g. `Stickers-stencils/`).
- `stickers` (optional, only with images in `stickers/`): every image in `stickers/` is listed here, and only
  there. `id`: letters, digits, `-`, `_`, max. 64 characters, unique among the stickers (no prefix); it is stored in
  users' saved designs. `label`: max. 40 characters, read by screen readers and shown as tooltip. Sticker images:
  square PNG, 128 to 1024 px (256 px is plenty), with transparency, max. 1 MB. They are offered next to the emojis
  when the app enables `features.stickers`; `stickerEmojis: []` offers images only.

The images follow the rules in "Image stencils" below. **One mistake rejects the whole zip** (missing or invalid
`stencils.json`, an image without an entry, an entry without an image, a duplicate id, a bad image, ...): the
server log shows the reason as SEVERE and the editor shows only the app's own stencils, if any (otherwise "No
premade stencils available.").

A first `stencils.json` can be written with `node scripts/face-frame-stencils.mjs <folder>`: it applies the same
rules, so a folder it accepts is accepted by the server. It takes ids and labels from the names (file name max.
40 characters for the label, folder name max. 30 for the category) and keeps edited label, category and tags.
Images in `stickers/` become the `stickers` list (id and label from the file name, an edited label is kept).

## Image stencils

- Square 1024×1024 px **PNG only (no SVG, WebP, JPEG)**, transparent centre and corners, frame inside a circle of
  radius 504 px, centred.
- Compressed, aim for < 200 KB per file (max. 1 MB for premade stencils).
- Served from the app (`assets/`) or from an https host listed in `options.imageHosts`; other URLs and other
  formats are dropped by the validation.

## Validation at runtime

Every stencil list passes `config/stencil-validation.ts` (`sanitizeStencils`) before it is used. Entries with an
invalid id, missing label or config, duplicate ids or broken values are dropped or repaired silently, image URLs
that are not allowed are removed. If a new stencil does not show up, check it against the rules above.

## Checklist

1. Entry added (unique id, label, category, config) using colour constants.
2. `npm test` – the stencil tests check ids, values and text contrast for the default list.
3. Look at it in the gallery (`#frame-gallery` in the demo, or the Premade stencils tab): text fits, nothing
   overlaps, readable at the small chat preview size.
4. For image stencils: PNG, file size, transparent centre (premade stencils: the script checks this).
5. If the stencil is in the default list, update the count in `face-frame.spec.ts`
   (`has the 9 base stencils plus 50 library stencils`).
