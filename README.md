# PDF Manipulator

Small set of PDF tools that run entirely in your browser. Nothing gets uploaded anywhere, your files stay on your machine.

## What it does

- **Merge** – drop in a few PDFs, drag them into the order you want, rotate or delete individual pages, then download one combined file. Ctrl/Cmd+Z undoes mistakes.
- **Split** – break a PDF into one file per page, cut it by ranges like `1-3, 5, 8-10`, or click the pages you want to pull out. Multiple outputs come down as a zip.
- **Compress** – shrink a PDF by re-encoding the images inside it. Text and vector graphics aren't touched, so they stay sharp and selectable. Pick Light / Balanced / Smallest, or type a target size (e.g. "under 2 MB" for an upload form).

Coming later: images → PDF and PDF → images.

## Running it

Needs Node 20+.

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # unit tests
npm run build   # static site in dist/
```

The build is plain static files, so `dist/` can go on GitHub Pages, Netlify or any web server.

## Stack

- Vite + React + TypeScript
- [pdf-lib](https://pdf-lib.js.org/) for writing PDFs (merge, split, rotate, compress)
- [pdf.js](https://mozilla.github.io/pdf.js/) for page thumbnails
- [dnd-kit](https://dndkit.com/) for drag and drop (works with mouse, touch and keyboard)
- [fflate](https://github.com/101arrowz/fflate) for zipping split output
- Vitest for tests

## Project layout

```
src/
  App.tsx          shell, home screen, hash routing
  tools/           one component per tool (Merge, Split, Compress)
  components/      drop zone, sortable grid, cards, thumbnails, toasts
  lib/             PDF logic, kept free of React so it's easy to test
```

Adding a tool means a new file in `src/tools/` plus one entry in the `TOOLS` list in `App.tsx`.

The full design notes and roadmap are in [docs/superpowers/specs/2026-09-11-pdf-manipulator-design.md](docs/superpowers/specs/2026-09-11-pdf-manipulator-design.md).

## Known limits

- Password-protected PDFs aren't supported, unlock them first.
- Compression runs on the main thread, so very large files can make the page stutter for a few seconds.
- Some image types are left alone during compression (CMYK, transparency masks, tiny images, etc.) because re-encoding them would break things.
