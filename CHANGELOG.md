# Changelog

## Unreleased

- Renamed the project to **Network Canvas**: the build is `NetworkCanvas.html`, diagrams save as `.networkcanvas.json` (files saved under the old `.netcanvas.json` name still open), library packs use the `networkcanvas-library` format (old packs still import).
- File menu: keyboard shortcuts entry and an about/version entry linking to GitHub.
- Repository: pull request and issue templates, code of conduct.

## 0.3.0 — 2026-11-08

First public release. Includes the fixes from a 383-check black-box QA pass:

- Double-click renames/edits again on the canvas and enters point editing in the device editor; link endpoint and resize handles are no longer covered by port hit-areas.
- Keyboard shortcuts are inactive while a dialog is open; Escape reverts text fields and inline edits instead of committing them; Escape closes context menus, which now stay inside the window.
- Orthogonal bend handle works when both ends leave on the same side; a single click on a polygon segment keeps point-editing mode; label scrubbing is one undo step.
- Deleting a custom device asks first and keeps its placed instances working; zone VLAN select no longer offers the device-only status option.
- Link arrowheads and port labels are drawn above device icons; inserted legend/VLAN table/title block land in free space; Shift+click only deselects on release (Shift+drag moves); library clicks cascade instead of stacking; deleting a page activates its neighbour; the diagram layer is memoised (smoother pan/zoom).

- Canvas: pan/zoom, grid & snap, smart guides, marquee, align/distribute, z-order, lock/hide, groups, layers, pages, undo/redo, find, hide-panels mode, zoom to selection.
- Networking model: VLAN registry with zones bound to VLANs, per-VLAN device addresses, port-aware links with media/capacity validation, link documentation (speed, VLANs, cable id, notes), colour-by-media, line jumps, parallel-link fan-out, bend points.
- Diagram checks: duplicate IPs, IP outside subnet, dangling VLAN refs, duplicate names, port over capacity, media mismatch, unconnected devices, naming convention. Next-free-IP and VLAN inference.
- Device table with inline editing and CSV import (create/update by name).
- Blocks: auto legend (devices + link types), VLAN table, title block, callouts with leader lines and placeholders, images.
- Two icon styles with per-diagram and per-device switching: isometric (44) and detailed (44) + vendor models. Device editor with shapes, pen, iso primitives, gradients, rotation, align, repeat, reference-photo tracing, SVG import, ports with media/side/capacity, port generator, property templates, library packs.
- Export: PNG, SVG, PDF/print, interactive HTML viewer (with switch to editor), inventory CSV, cable schedule CSV.
- Light/dark themes following the OS; single offline HTML build.
