# Changelog

## 0.3.0 — 2026-11-08

First public release.

- Canvas: pan/zoom, grid & snap, smart guides, marquee, align/distribute, z-order, lock/hide, groups, layers, pages, undo/redo, find, hide-panels mode, zoom to selection.
- Networking model: VLAN registry with zones bound to VLANs, per-VLAN device addresses, port-aware links with media/capacity validation, link documentation (speed, VLANs, cable id, notes), colour-by-media, line jumps, parallel-link fan-out, bend points.
- Diagram checks: duplicate IPs, IP outside subnet, dangling VLAN refs, duplicate names, port over capacity, media mismatch, unconnected devices, naming convention. Next-free-IP and VLAN inference.
- Device table with inline editing and CSV import (create/update by name).
- Blocks: auto legend (devices + link types), VLAN table, title block, callouts with leader lines and placeholders, images.
- Two icon styles with per-diagram and per-device switching: isometric (44) and detailed (44) + vendor models. Device editor with shapes, pen, iso primitives, gradients, rotation, align, repeat, reference-photo tracing, SVG import, ports with media/side/capacity, port generator, property templates, library packs.
- Export: PNG, SVG, PDF/print, interactive HTML viewer (with switch to editor), inventory CSV, cable schedule CSV.
- Light/dark themes following the OS; single offline HTML build.
