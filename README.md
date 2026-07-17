# topomapper

`topomapper` is a Mac application for turning real-world terrain and seabed
elevation data into layered shapes suitable for CNC-cut wall maps.

The user selects an area on an interactive map, analyses its elevation range,
chooses custom land and subsea layer boundaries, previews the resulting stacked
model, and exports cut-ready geometry. Direct CNC G-code is a later goal after
the geometry workflow is proven.

Project decisions and progress are recorded in
[`DOCUMENTS/Development_Notes.md`](DOCUMENTS/Development_Notes.md).

Detailed requirements and the proposed technical foundation are in
[`DOCUMENTS/Requirements.md`](DOCUMENTS/Requirements.md) and
[`DOCUMENTS/Architecture.md`](DOCUMENTS/Architecture.md).

Development is divided into visible, testable increments in
[`DOCUMENTS/Roadmap.md`](DOCUMENTS/Roadmap.md).

## Local development

The application uses TypeScript, React, MapLibre GL JS, and Vite. Project
dependencies are pinned in `package.json` and `pnpm-lock.yaml`.

Install Node.js 24 LTS, then open this repository in Terminal and run:

For the existing Mac checkout, run `npm run dev`. For a clean checkout, enable
Corepack and run `pnpm install` once before `pnpm run dev`.

Open `http://localhost:3000` and leave Terminal running while using the app.

## Current prototype

Stage 2 adds an editable rectangular model-area selection. It reports the
latitude/longitude bounds, ground width, ground height, and area. A selection
can be saved on the Mac and reopened with the same numerical bounds.
