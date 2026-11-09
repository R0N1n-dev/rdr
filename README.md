# rdr

**A reading room for every document.** rdr is an Android reader and editor for the formats people actually
read: PDFs, EPUB and Kindle books, Markdown, HTML, CSV, RTF and plain text. It runs fully on-device, with no
accounts, no uploads and no tracking.

Built with **Vue 3**, **Vite 8** and **Capacitor 8**. Styled around ink and pastel, with ten colour palettes that
repaint the entire app.

![rdr icon](assets/play-store-icon-512.png)

---

## Highlights

- **Read almost anything** — PDF, EPUB, MOBI, AZW3, CSV, Markdown, TXT, HTML and RTF.
- **Real readers, not a text dump** — PDF pages are drawn with pdf.js and their outline becomes the contents;
  EPUB and MOBI keep their structure, images and table of contents; CSV gets a table with a frozen row column.
- **Real covers** — PDFs render page one, EPUB reads its `cover-image` and MOBI its EXTH cover record. The shelf
  shows the actual artwork, downscaled to a 420 px JPEG, and falls back to generated typographic art when a file
  has none.
- **Edit where it makes sense** — Markdown and plain text open in a focused editor with live word count and save
  straight back to the shelf.
- **Ten colour palettes** — each one recolours the shelf, chrome, buttons and the reading page itself. Contrast is
  computed per palette, so text stays readable in all of them.
- **Reading comfort** — five page tints (including one that follows the palette), three typefaces, adjustable size,
  line height and justification.
- **Built for Android** — native share sheet, file export, themed status bar with correct edge-to-edge insets,
  keyboard resizing, optional haptics and a back-button stack that behaves like a native app.
- **Light on its feet** — the shelf boots from ~52 KB of JavaScript; PDF, EPUB and Markdown engines load only when
  you open a document of that kind. Release builds are shrunk and obfuscated with R8.
- **Offline by design** — fonts are bundled, documents and covers live in IndexedDB, preferences in Capacitor
  Preferences.

---

## Table of contents

1. [Format support](#format-support)
2. [Themes](#themes)
3. [Feature tour](#feature-tour)
4. [Performance](#performance)
5. [Architecture](#architecture)
6. [Project layout](#project-layout)
7. [Getting started](#getting-started)
8. [Android builds](#android-builds)
9. [Data and privacy](#data-and-privacy)
10. [Verification](#verification)
11. [Limitations](#limitations)
12. [Shipping to Play Store](#shipping-to-play-store)

---

## Format support

| Format | Extensions | How it renders | Notes |
| --- | --- | --- | --- |
| PDF | `.pdf` | Canvas pages rendered at device pixel ratio, PDF outline as contents | Read-only; text is not selectable and there is no OCR for scans. |
| EPUB | `.epub` | Reflowed XHTML, embedded images, EPUB 2/3 TOC | DRM-free files only. Images are inlined up to a memory budget. |
| Kindle | `.mobi`, `.azw3` | Reflowed from the PDB/PalmDOC + KF8 container | Unencrypted files only. |
| CSV | `.csv` | Sheet view with a frozen row-number column | Built-in RFC 4180 parser: quotes, escaped quotes and embedded newlines. |
| Markdown | `.md` | Rendered with markdown-it, **editable** | Tables, code, quotes, lists and links; inline HTML stays disabled for safety. |
| Plain text | `.txt` | Paragraphs with heading detection, **editable** | Chapter-ish lines become headings. |
| HTML | `.html`, `.htm` | Sanitised body, images resolved | Scripts, forms, frames and styles are stripped. |
| Rich text | `.rtf` | Paragraphs, headings, escapes | Font tables and layout are dropped. |

Word, Excel, PowerPoint and OpenDocument files are not opened at all: they were too far from a faithful
rendering to call supported. Importing one says so and suggests exporting to PDF. Legacy binary formats
(`.doc`, `.xls`, `.ppt`) and DRM-protected books get the same treatment. Every open document reports "reader
notes" when something was simplified, so nothing is silently lost.

---

## Themes

Ten palettes, each defined by three brand colours. Two are dual-colour (80/20), the rest use a dominant,
structural and accent trio. Palettes choose their own light or dark shell; the app stores only the palette id.

| Palette | Mood | Primary | Secondary | Accent | Mode |
| --- | --- | --- | --- | --- | --- |
| **rdr Ink** | House violet | `#5B3DB2` | `#231D33` | `#8B6AD8` | light |
| **Corporate** | Navy & electric blue | `#1E2761` | `#408EC6` | `#408EC6` | light |
| **Retail Rush** | Charcoal & tangerine | `#2C3E50` | `#E67E22` | `#E67E22` | light |
| **Eco Organic** | Forest & moss | `#2C5F2D` | `#97BC62` | `#97BC62` | dark |
| **Cyber** | Ink black & neon lime | `#1A1A1A` | `#C1DD13` | `#C1DD13` | dark |
| **Editorial** | Cherry red & blush | `#CC313D` | `#F7C5CC` | `#CC313D` | light |
| **Midnight Trio** | Navy, royal, burgundy | `#1E2761` | `#408EC6` | `#7A2048` | dark |
| **Bright Tech** | Slate, mint, coral | `#2D3047` | `#2EC4B6` | `#FF7A59` | dark |
| **Pastel Play** | Lavender, sky, bubblegum | `#B298E7` | `#B8E3E9` | `#F5B8D5` | light |
| **Earthy** | Sage, alabaster, terracotta | `#4A5842` | `#EFEBE4` | `#D98A6C` | light |

Colour is allowed to lead: the page background, cards, chrome and reading paper are all derived from the palette,
not just a button here and there. Readability is protected by construction rather than by hand-tuning every
combination — [`src/lib/palette.ts`](src/lib/palette.ts) mixes the brand colours into a full token set and nudges
any derived text colour toward black or white until it clears WCAG AA (4.6:1 for body text, 3:1 for rules, fills
and icons) against **every** surface it can sit on. The accent keeps its identity because only text-bearing
variants are adjusted.

Adding a palette is one entry in `PALETTES`. Everything else — light or dark shell, shadows, paper tint, link
colours, danger colour, status bar and theme-color meta — follows automatically.

Reader page tints (`Theme`, Daylight, Sepia, Moss, Night) are independent of the palette. `Theme` is the default:
paper tinted with the palette hue and text derived for contrast.

---

## Feature tour

### Shelf

- Import with the floating button (system file picker) or by dragging files onto the window on desktop.
- Search by title, author or format; filter All / Reading / Finished.
- Cover view (real book artwork when the file has it, generated typographic art when it does not) or compact list
  view.
- Sort by recently read, title, author or size.
- "Continue reading" card for the most recent book, with its progress and current location.
- Per-document options: open, save a copy (native share sheet), mark finished or unread, remove from shelf with a
  confirm step.
- New note creates an editable Markdown document instantly.
- Starts empty: what you import is what you see.

### Settings

- Palette picker with a live preview chip per theme.
- Reading defaults: page tint, typeface, size, line spacing, justification, keep-screen-awake.
- Haptic feedback on or off.
- Shelf size and clear-the-shelf (two taps).
- The full format list and what rdr cannot open, stated plainly.

### Reader

- **Two engines:** reflow (EPUB, MOBI/AZW3, MD, TXT, HTML, RTF) and PDF (pdf.js canvas). CSV opens in a table view.
- Tap the page to hide the chrome; a bottom rail shows progress, the current chapter and an estimate of the time
  left at 230 words per minute (pages left for PDFs).
- **Scrub the rail** — drag it to jump anywhere in a book, or focus it and use the arrow keys / Home / End. The
  thumb follows the reading position.
- **Contents** — EPUB nav/NCX where available, otherwise headings detected in the document.
- **Find** — case-insensitive search over the rendered text of reflow documents, with snippets and jump-to-match.
- **Bookmarks** — saved by position (scroll offset for reflow, page for PDF) with a timestamp.
- **Reading comfort** — page tint, typeface (Literata, Instrument Sans, monospace), text size, line spacing,
  justification, with a live sample.
- **Keep the screen awake** — optional screen wake lock that is released when the app goes to the background.
- **Edit** — Markdown and plain text; saves the source back to IndexedDB without touching the original file name.
- **Rename**, **save a copy**, **remove from shelf** from the document sheet.
- Progress and last position persist per book and update as you read.
- Back button: closes the open sheet or prompt, steps back from the reader or settings, and from the shelf opens
  a "Leave rdr?" confirmation — the app never quits on a single press.

### Status bar

The bar is transparent over the app, so its icons are chosen from the colour actually behind it — measured
luminance, not the theme name. A light shelf or daylight paper gets dark icons; a dark palette or night paper gets
light icons. It resyncs on every palette change, page-tint change, screen change and rotation, including the case
where a dark theme is paired with the Daylight paper.

Android 15/16 enforce edge-to-edge for apps on SDK 36, so content must not be allowed to run under the bar. The app
measures the real status-bar height from the status-bar plugin (WebView does not expose that inset to CSS) and
publishes it as `--safe-top`; the shell pads itself by exactly that amount and paints the strip with the current
surface colour — shelf background on the shelf, reading paper in the reader. The variable is only applied when the
WebView really is edge-to-edge, so older Android versions where the window is already inset are not padded twice.
Rotation re-measures the height and refreshes the viewport height used by the shell.

### Native behaviour

| Plugin | Used for |
| --- | --- |
| `@capacitor/status-bar` | Bar icons flip with the surface underneath: dark icons on light shelves/paper, light icons on dark ones |
| `@capacitor/share` / `@capacitor/filesystem` | Exporting a copy of a document to the share sheet |
| `@capacitor/app` | Back-button stack, app-state change (flush progress) |
| `@capacitor/haptics` | Light impact on selects, saves and destructive confirms; respects the haptics setting |
| `@capacitor/keyboard` | Native resize so editors and sheets keep above the keyboard |
| `@capacitor/preferences` | Settings |
| `@capacitor/splash-screen` | Splash hidden only after settings and shelf are ready |
| `@capacitor/browser` | External links open outside the app |

---

## Performance

Measured on a cold load of the production build over HTTP (the device loads the same files from the APK):

| | Before | Now |
| --- | --- | --- |
| Startup JavaScript | 219.5 KB (3 files) | **52.0 KB** (3 files) |
| DOMContentLoaded | 124 ms | 84 ms |
| Load | 457 ms | 131 ms |
| Total first load | 502 KB | 334 KB |

What made the difference:

- **Parsers are loaded on demand.** [`loadDocument`](src/lib/load.ts) imports EPUB, MOBI, RTF, markdown-it and the
  sanitiser only when a document of that kind is opened; covers get their own small chunk. The 604 KB shelf bundle
  became a 144 KB entry chunk (52 KB gzipped). PDF and its worker arrive as separate chunks, and dropping
  Word/Excel/PowerPoint removed mammoth and SheetJS from the app entirely.
- **Reader scroll is O(log n).** [`ReflowReader.vue`](src/components/ReflowReader.vue) indexes heading positions once
  per layout change (font change, image load, resize) instead of measuring every heading on every scroll frame, then
  binary-searches the current chapter. Long books no longer trigger hundreds of layout reads per frame.
- **Scroll updates are frame-bounded.** Progress is emitted from a single `requestAnimationFrame` at a time; saving
  progress stays debounced at 900 ms.
- **Fonts are downloaded only for glyphs in use** through per-subset `unicode-range` declarations, and the reading
  serif is not fetched at all until a document opens.

Remaining startup weight is fonts (Instrument Sans 30 KB, Fraunces 119 KB for its full SOFT/WONK axes, Boxicons
113 KB). These are bundled in the APK, so on-device they are local reads rather than downloads.

## Architecture

```
Vue 3 (script setup)
  ├── state.ts           three-view app state + toast bus (no router: keeps back handling explicit)
  ├── views/             LibraryView · ReaderView · SettingsView
  ├── components/        readers (Reflow, Pdf, Sheets), MarkdownEditor, sheets, covers
  └── lib/
        detect.ts        extension + MIME detection
        load.ts          format → document model dispatch
        epub/mobi/rtf/…  per-format parsers (zip, PalmDOC/KF8, RTF, CSV)
        html.ts          sanitise + heading ids + TOC extraction (DOMPurify)
        db.ts            IndexedDB: `books` metadata, `files` bytes
        library.ts       shelf operations, import, progress, bookmarks
        palette.ts       palette definitions, contrast-safe token generation, apply
        settings.ts      persisted preferences, palette migration
        native.ts        thin, failure-tolerant Capacitor bridge
```

**Document model.** Parsers never touch the UI. They return one of three shapes:

- `reflow` — sanitised HTML, TOC, plain text (used by find, word count and editing), `editable` flag.
- `pdf` — raw bytes for pdf.js.
- `sheets` — one entry per sheet with a header row and string cells (CSV).

This keeps heavy parsers out of the main bundle: PDF and spreadsheet engines are code-split and loaded only when
a document of that kind is opened.

**Storage.** Metadata and file bytes are separate IndexedDB stores so shelf listing never loads a 200 MB PDF.
Edited text files store their source alongside the original bytes. Extracted covers live in the book metadata as a
~10 KB JPEG data URL, so the shelf paints without a second read.

**Contrast engine.** `buildTheme()` converts a palette into ~30 CSS custom properties, resolving surface, ink,
muted, line, accent, accent-ink, danger, shadows and reading-paper colours with automated contrast correction.
`applyPalette()` writes them to `:root` and syncs `color-scheme`, `data-theme`, `data-palette` and the
`theme-color` meta tag.

---

## Project layout

```
assets/           source SVGs for the mark/icon, generated Play Store icon
scripts/          make-icons.mjs (Android mipmaps + splashes)
src/              application source (see Architecture)
tests/            parser tests (bun test)
android/          Capacitor Android project
```

---

## Getting started

Requirements: **Bun 1.3+** (package manager and test runner), and for Android builds **JDK 21** plus the
**Android SDK 36** (`compileSdk 36`, `minSdk 24`).

```bash
bun install
bun run dev          # http://localhost:5173 — import files with the + button or by dropping them on the window
bun run build        # typecheck (vue-tsc) + production bundle
bun test             # parser unit tests
```

| Script | What it does |
| --- | --- |
| `bun run dev` | Vite dev server with HMR |
| `bun run build` | `vue-tsc --noEmit` then `vite build` into `dist/` |
| `bun run preview` | Serves the production build locally |
| `bun test` | Parser, back-stack, status-bar and edge-to-edge inset tests |
| `bun run icons` | Renders every launcher, adaptive-icon and splash bitmap from `assets/*.svg` |
| `bun run android` | Build web assets and `cap sync android` |
| `bun run android:apk` | The above, then `./gradlew assembleDebug` |

rdr ships with no sample documents; every parser is covered by `bun test`, and you can drop your own files onto
the shelf.

---

## Android builds

The Android project is already added (`android/`, application id `app.rdr`). Capacitor copies the built
web app into `android/app/src/main/assets/public`.

```bash
bun run android:apk        # build + sync + debug APK
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Release builds run R8 (`minifyEnabled` + `shrinkResources`) with keep rules for the Capacitor bridge in
[`android/app/proguard-rules.pro`](android/app/proguard-rules.pro): plugin classes, `@PluginMethod` handlers and
`@JavascriptInterface` methods are resolved reflectively and must not be renamed. The release APK drops to 3.5 MB
from 7.2 MB. Re-check `mapping.txt` in `android/app/build/outputs/mapping/release/` whenever you add a native
plugin.

Icons and splash screens are generated, not hand-placed:

- Legacy launcher icons: 48/72/96/144/192 px, plus circular variants.
- Adaptive icon foregrounds: 108/162/216/324/432 px on the ink `#231D33` background.
- Splash bitmaps for every port/land density, ink mark centred on paper `#F4F2F7`.
- `assets/play-store-icon-512.png` for the store listing.

Status bar and splash colours live in `capacitor.config.ts`; change `backgroundColor` there if you want a dark
launch instead of the paper one.

### GitHub release builds

Pushing a `v*` tag (e.g. `git tag v1.0.0 && git push origin v1.0.0`) runs
[`.github/workflows/release.yml`](.github/workflows/release.yml): it tests, builds the web bundle, syncs Capacitor,
then produces a signed release APK and AAB attached to a GitHub Release. `versionName` comes from the tag and
`versionCode` is derived from it (`major*10000 + minor*100 + patch`).

The workflow signs with the same `my-release-key.jks` scheme as local release builds, but the keystore never
enters the repo. Add these repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `RDR_KEYSTORE_BASE64` | `base64 -w0 android/app/my-release-key.jks` |
| `RDR_KEYSTORE_PASSWORD` | store password |
| `RDR_KEY_ALIAS` | key alias |
| `RDR_KEY_PASSWORD` | key password |

If those secrets are missing the tag build fails at the signing step; debug APK builds are unaffected.

---

## Data and privacy

- Every document, bookmark and progress value is stored on the device in IndexedDB. Nothing is uploaded.
- No analytics, crash reporting, accounts or network requests. Fonts ship with the app.
- Links inside documents open in the system browser, never inside the reader.
- "Clear shelf" in Settings deletes metadata and file bytes after a second confirming tap.
- Exporting a copy uses the OS share sheet; rdr itself does not gain access to where you send it.

---

## Verification

Checked on the current tree:

- `bunx vue-tsc --noEmit` — clean.
- `bun test` — 23 tests passing (9 parser cases, 6 back-stack cases, 4 status-bar cases, 4 inset cases).
- `bun run build` — production bundle builds.
- Browser pass over all ten palettes with all five paper tints (50 combinations): programmatic contrast audit of
  every rendered text node found no pair below WCAG AA, including sheets, reader chrome and the palette picker.
- Palette selection persists across reloads; pre-palette settings migrate (old `light` → rdr Ink, old `dark` →
  Bright Tech) and reset the page tint to follow the theme.
- Status bar icon mapping checked for all 10 palettes × 5 page tints (50 surfaces): dark icons on every light surface,
  light icons on every dark one.
- Code-split parsers exercised through `loadDocument` in the browser for Markdown, text, HTML, RTF and CSV; the
  Markdown and sanitiser chunks load only when a document opens.

- Cover extraction exercised in the browser with a real EPUB (OPF `cover-image`) and a real PDF (page one):
  both produced 420 px JPEG covers in the shelf, the EPUB's metadata replaced the filename title and supplied the
  author, and the generated art stayed as the fallback for files without covers.
- Sort (recent/title/author/size), mark finished/unread, chapter label plus reading-time estimate in the reader
  footer, and the haptics toggle all exercised in the browser.
- Progress rail scrubber checked on a 50 k-pixel-tall text: a click at the middle moved the scroll position to
  exactly 0.50 and updated the chapter label; Home returned it to 0.
- Rotation checked by resizing the viewport to 844×390 and back while a PDF was open: the page box and canvas
  followed the new width with no leftover half-width layout.
- `bun run android` + `./gradlew assembleRelease` — R8 release APK assembles (3.5 MB). `mapping.txt` confirms
  every Capacitor plugin class (`StatusBarPlugin`, `HapticsPlugin`, `FilesystemPlugin`, …) and its `@PluginMethod`
  handlers kept their original names; the web bundle and PDF worker are present under `assets/public/`.

Not verified here: running either APK on hardware. No device or emulator was attached, so the Android-specific
behaviour (status-bar inset measurement, share sheet, back gesture, wake lock) is implemented and compiles but has
not been exercised on a physical phone. R8 was verified statically (keep rules plus the mapping file), not by
launching the minified build.

---

## Limitations

- DRM-protected EPUB/MOBI/AZW3 cannot be opened, by design.
- Word, Excel, PowerPoint and OpenDocument files are not supported — export to PDF first.
- CSV is the only spreadsheet format; formulas and multiple sheets are out of scope.
- MOBI covers are read from the EXTH record. Books without one keep the generated cover art.
- Password-protected PDFs are rejected by pdf.js.
- PDFs are read-only: no editing, annotation export, text selection or OCR.
- EPUB fixed-layout pages are treated as reflowable text.
- Very large PDFs are rendered page by page at screen width; the reader does not offer pinch zoom.

---

## Shipping to Play Store

The pieces Play Console expects are either done or listed here so nothing surprises you:

1. **Application id** — `app.rdr` (change in `capacitor.config.ts`, then re-add or rename the Android
   package before your first upload; the id cannot change afterwards).
2. **Icons** — `assets/play-store-icon-512.png` (512×512, generated) plus adaptive icons already in the APK.
3. **Feature graphic (1024×500)** and phone screenshots — capture from a release build; not generated here.
4. **Signing** — create an upload key and configure a release build:
   ```bash
   keytool -genkey -v -keystore rdr-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
   ```
   Keep the keystore and passwords out of version control (`.gitignore` already excludes `*.jks` and
   `keystore.properties`). Wire it into `android/app/build.gradle` as `signingConfigs.release`.
5. **Privacy policy** — rdr collects and transmits nothing; state exactly that in the listing and in the Data
   Safety form (no data collected, no data shared).
6. **Content rating questionnaire** — a document reader with no user-generated online content is straightforward.
7. **Store copy** — lead with the format list and offline editing; call out that nothing leaves the device.
8. **Production build** — `bun run android && cd android && ./gradlew bundleRelease`, then upload the `.aab`.
   The release build is already minified and resource-shrunk; keep `mapping.txt` from
   `android/app/build/outputs/mapping/release/` if you ever need to read a crash stack.

---

*rdr 1.0.0 — built with Vue, Vite and Capacitor. Read wide.*
