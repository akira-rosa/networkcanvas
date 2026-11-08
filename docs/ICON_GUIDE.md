# Built-in icon guide

Devices are pure data (`DeviceDef`: artboard `w`×`h`, `shapes[]`, `ports[]`). Author them with the
helpers in `src/library/draw.ts` (`rect`, `rrect` per-corner radii, `ell`, `circ`, `poly`, `line`,
`path`, `text`, `grad`, `repeat`, `P` ports, `def(style, {...})`). Shape fill can be a CSS colour,
an accent token (`accent`, `accent-light`, `accent-lighter`, `accent-dark`, `accent-darker`) or a
`gradient: grad(angle, from, to)`.

Review icons with:  `node scripts/sheet.mjs <iso|detailed|all|id1,id2> /path/out.png`
(each card: large render with port dots, then 1.25× diagram size on dark and light canvas).

## Two styles
- **iso** — isometric, blue (#1a8fd8 accent) with lighter top faces and darker right faces, white
  glyphs. Matches the Smart4.0 schematic. Use accent tokens so instances can be recoloured.
- **detailed** — flat, front-view (orthographic) product illustrations with realistic proportions
  and real product colours, built from **solid blocks: square corners, no outlines, flat fills**
  (no gradients). Small details (LEDs, ports, vents, screws, feet) are blocks too; thin lines are only
  used for detail such as grilles. No logos or brand wordmarks.
  `solidify()` in `draw.ts` enforces this on every built-in detailed device: it removes corner radii,
  outline strokes, outline-only shapes and thin "rim" blocks, and flattens gradients.

## Canonical ports (shared by both styles so variants stay interchangeable)
| device | ports |
|---|---|
| switch | P1–P8 ethernet · SFP1, SFP2 sfp |
| switch-l3 | P0.1–P0.8 ethernet · SFP1, SFP2 sfp |
| router, router-industrial | WAN, P1–P5 ethernet |
| router-wireless | WAN, P1–P5 ethernet · WLAN wireless (∞) |
| firewall | WAN, LAN, DMZ, MGMT |
| access-point | ETH · WLAN wireless (∞) |
| cloud | N, S, E, W any (∞) |
| server | ETH0, ETH1, ETH2, iLO |
| pc | ETH, ETH2, USB |
| laptop | ETH · WLAN wireless (1) · USB |
| hmi, plc-compact | X1 P1, X1 P2 profinet · P3, P4 profinet |
| plc-modular | X1 P1, X1 P2 profinet · X2, X3 ethernet |
| motor-driver | X1, X2, P1, P2 profinet |
| iolink | X1, X2 ethernet · IO1–IO4 iolink |
| vision | ETH · I/O iolink |
| iot-sensor | WLAN wireless (1) · ETH |
| iot-gateway | WLAN wireless (∞) · ETH0, ETH1, ETH2 |
| robot-arm | ETH · TOOL iolink |
| gripper | I/O iolink |
| ip-camera | PoE ethernet |
| nas | ETH0–ETH3 |
| generic | P1–P4 any |

Ports sit on the outline of the artwork where a cable would plausibly attach, spread out so their
labels don't collide; set `side` to the direction the cable leaves.
