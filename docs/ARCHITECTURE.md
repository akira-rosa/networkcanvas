# Network Canvas — architecture & design notes

## Goals

Replace general-purpose drawing tools for network / OT schematics with something that understands
networks: fast to draw, aware of VLANs, addresses, ports and link media, offline and local-first, with
an icon library anyone can extend. Dark and light themes; one self-contained HTML file.

## Stack

| Concern | Choice | Why |
|---|---|---|
| UI | React 19 + TypeScript, Vite | Fast, typed, easy to contribute to |
| Offline | `vite-plugin-singlefile` + `scripts/postbuild.mjs` → `dist/NetworkCanvas.html` | Double-click to run; also survives hosts that inject scripts into the page |
| Rendering | Hand-written SVG (`src/render`) shared by canvas and exporters | Full control over ports, routing, zones; what you see is what you export |
| State | zustand + immer; snapshot undo/redo (`past`/`future` arrays of documents) | Simple, structural sharing keeps history cheap |
| Storage | IndexedDB (`idb-keyval`) autosave; `.networkcanvas.json` files via File System Access API with download fallback | Local-first, portable, git-friendly (sorted keys) |
| Devices | Pure data: shapes + ports + property fields | Built-ins and user devices are the same thing; libraries are JSON |

## Data model (`src/model/types.ts`)

- **DeviceDef** — artboard `w×h`, accent colour, `shapes[]` (rect, ellipse, polygon, path, text, isoBox,
  isoCylinder, image; gradients, per-corner radii, reference/trace layers), `ports[]` (name, position,
  media, exit side, max links), `fields[]` (property template), `style` (`iso` | `detailed`), optional
  `counterpart` (the same device in the other style).
- **DiagramDoc** — `pages[]`, `vlans[]` (id, name, subnet, colour, description), `meta` (author, version,
  classification…), `layers[]`, drawing options (`iconStyle`, `linkColorByMedia`, `lineJumps`,
  `namePattern`), and `embeddedDefs[]` so files carry the custom devices they use.
- **Page** — `nodes` (device, zone, text, rect, image, callout, legend, vlanTable, titleBlock) with a
  z-`order`, and `links` (port→port endpoints, media, routing, style, labels, speed/VLANs/cable id,
  waypoints).

### Icon styles

The store keeps two maps: `libDefs` (raw library, what the Library panel shows) and `defs` (the map
the diagram renders with). `styledDefMap(raw, style)` resolves every id to its variant for the
document's style, and adds `"<id>@iso"` / `"<id>@detailed"` keys so a single device can override the
document style. A node's `defId` is therefore either a raw id (follows the document) or an override key.
Switching style re-fits each device box to the new variant's proportions (centre preserved). Built-ins
pair `x` with `d-x`; user devices pair through `counterpart`. Port **names** must match across a pair so
links stay attached — `tests/geometry.test.ts` enforces this for the built-in library.

### Rendering pipeline

`DiagramLayer` is a pure function of (page, defs, vlans, theme, options). The live canvas wraps it
with interaction overlays (selection, handles, ports, guides); `export/exporters.ts` renders the same
component off-screen with `createRoot` + `XMLSerializer` for SVG, rasterises to PNG, prints to PDF,
or embeds the document into a copy of the running page for the interactive HTML viewer.

Links: `linkGeometry()` resolves endpoints (port world position, or a point on the device edge),
routes (straight / waypoints / orthogonal with a draggable bend / curved), shortens for arrows and
computes label anchors. `pathWithJumps()` re-emits straight/orthogonal paths with arcs where they
cross links drawn earlier. Parallel port-less links between the same two devices get a perpendicular
offset.

### Checks (`src/model/checks.ts`)

Pure function `runChecks(doc, defs) → Issue[]`: duplicate IPs (document-wide), IP outside its VLAN's
CIDR, dangling VLAN references, malformed addresses, device inside a VLAN zone without an address in
it, unconnected devices, port over capacity, link media mismatch, duplicate names per page, optional
name regex, VLAN registry sanity. The Document panel lists them; clicking reveals the targets.

### Device editor (`src/editor`)

Its own zustand store with undo/redo over a `DeviceDef`. Shapes are edited in artboard units; ports
snap to the artboard edges; a reference photo can be placed as a locked `guide` layer that never
renders on diagrams. `solidify()` normalises the built-in *detailed* style to solid blocks (square
corners, no outlines, flat fills).

## Decisions worth knowing

- **Snapshot undo** instead of command objects: documents are small (hundreds of nodes) and immer
  shares structure, so copying references per step is cheap and bug-resistant.
- **No canvas element**: SVG keeps text crisp at any zoom, makes export trivial and lets hit-testing use
  the DOM (`data-id`, `data-port`, `data-link-id`).
- **Ports are part of the device definition**, not the instance — editing a device's ports updates every
  instance; links reference ports by id, and ids derive from port names so artwork changes don't break
  diagrams.
- **Single file over PWA**: most users open the file from disk or a share; a service worker needs HTTPS
  hosting. GitHub Pages serves the same file for the online variant.

## Roadmap

See the README. The larger items are rack elevations, collapsible/drill-down groups with boundary
ports, polygon/auto-hull zones, LAG bundling, conditional formatting, NetBox interchange, a third
"logical" (Cisco-style) icon set, cable tracing through passive devices and derived L2/L3 views.

## Open design questions

- Should zones support arbitrary polygons, or are rectangles + groups enough?
- Which vendor families should ship built in, and in which style first?
- Multi-user collaboration (CRDT) versus file-based sharing through git.
