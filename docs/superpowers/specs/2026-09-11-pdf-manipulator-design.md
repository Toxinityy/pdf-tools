# PDF Manipulator — Design

Browser web app for everyday PDF jobs. Everything runs on the user's device; files are never uploaded.

## Goals

- Simple and friendly: one obvious primary action per screen, big targets, plain words ("Merge & download", not "Export").
- Private: no server. Works as a static site.
- Fast enough for normal documents (a few files, up to a few hundred pages).

## Stack

| Need | Choice | Why |
|------|--------|-----|
| App | Vite + React + TypeScript | Tool state (file list, page order, undo) is easier with React than raw DOM. |
| Write PDFs | `pdf-lib` | Merge, copy, rotate, delete pages; embed images. |
| Render thumbnails | `pdfjs-dist` | Only mature in-browser renderer. |
| Drag to reorder | `@dnd-kit/sortable` | Works with mouse, touch **and** keyboard. Native HTML5 drag-and-drop fails on touch. |
| Icons | `lucide-react` | Consistent SVG icons, no emoji. |
| Tests | `vitest` | Unit tests for the pure PDF and page-list logic. |

Styling: one plain CSS file with design tokens (light + dark via `prefers-color-scheme`). No CSS framework.

## Visual style

- Clean, flat, lots of whitespace. One accent colour (blue `#2563eb`, lighter in dark mode).
- System font stack, 16px base, 1.5 line height.
- Buttons and thumbnail controls at least 44×44px. Visible focus rings.
- Each source file gets a colour tag **plus** its name, so page origin never relies on colour alone.
- Motion 150–250ms, disabled under `prefers-reduced-motion`.

## Data model

```ts
type SourceFile = { id: string; name: string; bytes: Uint8Array; pageCount: number; color: string };
type PageRef   = { id: string; fileId: string; index: number; rotation: 0 | 90 | 180 | 270 };
// App state: files: SourceFile[], pages: PageRef[] (the output order)
```

One flat `pages` list is the single source of truth for output order. The Files view is a grouped
view of that same list: reordering a file moves all its pages as one block.

## Phases

### Phase 1 — Organize & Merge (build now)

The app opens straight into this workspace; no home screen until there is more than one tool.

1. **Empty state**: large drop zone, "Drop PDF files here" + "Choose files" button. Also accepts drops anywhere on the page.
2. **Files view** (default once files are added): one card per file — first-page thumbnail, name, page count, colour tag. Drag cards to set merge order. Remove button per file.
3. **Pages view** (toggle): grid of every page thumbnail in output order. Drag to reorder across files. Each page has Rotate and Delete buttons (always visible, not hover-only).
4. **Add more files** button in both views; new files append to the end.
5. **Undo** for delete/rotate/reorder/remove: toast with "Undo" after destructive actions, plus Ctrl/Cmd+Z.
6. **Bottom bar**: output file name (default `merged.pdf`), page count summary, primary button **Merge & download**. Button shows a spinner while working and is disabled with no pages.
7. Download via Blob URL. Success toast: "Saved merged.pdf (12 pages)".

Errors, shown per file in a toast/banner with the file name:
- Not a PDF → "notes.docx isn't a PDF, so it was skipped."
- Password-protected → "report.pdf is password-protected. Unlock it first."
- Corrupt → "scan.pdf couldn't be read."

Performance: thumbnails render lazily (when scrolled into view) at small scale; each file is parsed once and cached.

### Phase 2 — Split

- Add a home screen with tool cards (Organize & Merge, Split, and later tools) and a top bar to switch tools.
- Load one PDF. Modes: **Every page** (one file per page), **Ranges** (`1-3, 5, 8-10`, validated inline), **Pick pages** (click thumbnails).
- Multiple outputs download as one `.zip` (`fflate`); a single output downloads as a PDF.

### Phase 3 — Compress (built; moved ahead of Images ↔ PDF at the user's request)

Changed from the original plan: instead of re-rendering whole pages as JPEG (kills selectable text and
often makes text PDFs *bigger*), only embedded images are re-encoded. Text and vector art are untouched.

- **Light**: lossless. Deflates streams stored uncompressed, saves with object streams.
- **Balanced** (default): Light + images re-encoded as JPEG, longest side ≤ 1600 px, quality 0.72.
- **Smallest**: same, ≤ 1000 px, quality 0.5.
- Images that are skipped: under 200×200 px, soft masks (alpha), image masks, CMYK/indexed colour,
  custom `/Decode`, non-8-bit, Flate with predictors, JPEGs whose EXIF rotation would turn them sideways.
  An image is only replaced if the new version is smaller.
- UI: pick level → Compress → result card with before → after and % saved → Download.
  If nothing got smaller, say so and suggest the next level; no download offered.
- Code: `lib/compress.ts` (pdf-lib, unit-tested with a stub encoder), `lib/reencode.ts` (canvas JPEG encoder).
- Measured: 4 photo pages (6 MP JPEGs) 5.1 MB → 710 KB Balanced / 244 KB Smallest, ~4.7 s.
- Known ceiling: re-encoding runs on the main thread; move to a worker if big files make the UI stutter.
- **Target size** level: user types a limit (number + MB/KB, quick picks 1/2/5/10 MB). Units are decimal
  (4 MB = 4,000,000 bytes, so the file also passes forms that use 1,048,576-byte MB); all sizes in the UI
  use the same units. `compressToSize` tries lossless first, then binary-searches a 9-step ladder
  (3200 px/q0.9 … 450 px/q0.25) for the mildest step that fits: ≤ 4 full passes. If nothing fits it
  returns the smallest result and the UI offers it with a clear "couldn't get under" message.
  Already under the limit → says so, no work done. Invalid input (empty, ≤ 0, < 10 KB) → inline error.
  Measured on 5.1 MB of photos: 4 MB → 3.6 MB, 500 KB → 443 KB, 40 KB → not reachable (47 KB).

### Phase 4 — Images ↔ PDF

- **Images → PDF**: drop JPG/PNG (other formats converted through canvas), reorder, page size (Fit image / A4 / Letter), margin (None / Small). Output one PDF.
- **PDF → images**: render pages with pdf.js at chosen quality (Normal 150 DPI / High 300 DPI), PNG or JPG, zip when more than one.

## Code layout (Phase 1)

```
src/
  main.tsx, App.tsx          app shell + state (useReducer with undo history)
  lib/pages.ts               pure page-list operations (add file, move, rotate, delete, reorder files)
  lib/pdf.ts                 load/validate PDF, build merged PDF (pdf-lib, no DOM)
  lib/thumbs.ts              page previews (pdf.js), cached per file/page/rotation
  components/SortableGrid    drag/touch/keyboard reordering for both views
  components/Cards           FileCard, PageCard
  components/Thumb           lazy preview image
  styles.css
```

Phase 2 moved each tool into `src/tools/<Tool>.tsx` (MergeTool, SplitTool). `App.tsx` is now the
shell: hash routes (`#/`, `#/merge`, `#/split`), top nav and home screen. Both tools stay mounted so
switching tabs keeps their files. Shared pieces: `components/DropZone`, `components/Toast`,
`lib/useFileDrop`, `lib/files` (download, safe names, error text), `lib/split` (range parsing, grouping).
New tools: add a `src/tools/<Tool>.tsx` and one entry in `TOOLS` in `App.tsx`.

## Testing

- `lib/pages.test.ts`: move, rotate, delete, reorder-files, undo.
- `lib/pdf.test.ts`: build PDFs in-test with pdf-lib, merge them, assert page count, order and rotation of the output.
- Manual check in the browser: drop files, reorder, rotate, delete, merge, open the result.
