# Icon spec — second batch (20 devices, both styles)

Both styles must use exactly these ids, names, categories, prefixes and port names so a diagram can
switch between Isometric and Detailed (`x` pairs with `d-x` automatically).

| base id | name | category | prefix | fields | ports (name · media · max · side) |
|---|---|---|---|---|---|
| wireless-controller | Wireless Controller | Wireless | wlc | NET | P1 eth 1 left · P2 eth 1 right · SFP1 sfp 1 bottom · MGMT eth 1 top |
| load-balancer | Load Balancer | Network | lb | NET | P1 eth 1 top · P2 eth 1 bottom · P3 eth 1 left · P4 eth 1 right |
| modem-ont | Modem / ONT | Network | mdm | NET | WAN fiber 1 left · LAN1 eth 1 right · LAN2 eth 1 bottom |
| patch-panel | Patch Panel | Network | pp | NET | P1…P8 eth 1 (4 along top, 4 along bottom) |
| media-converter | Media Converter | Network | mc | NET | FX fiber 1 left · TX eth 1 right |
| vpn-gateway | VPN Gateway | Security | vpn | NET | WAN eth 1 top · LAN eth 1 bottom · MGMT eth 1 right |
| printer | Printer | Endpoints | prn | NET | ETH eth 1 bottom · USB usb 1 right · WLAN wireless 1 top |
| ip-phone | IP Phone | Endpoints | ph | NET | ETH eth 1 bottom · PC eth 1 right |
| mobile | Smartphone | Endpoints | mob | NET | WLAN wireless 1 top · USB usb 1 bottom |
| tablet | Tablet | Endpoints | tab | NET | WLAN wireless 1 top · USB usb 1 bottom |
| ups | UPS | Power | ups | NET | ETH eth 1 top · USB usb 1 right · PWR power 0 bottom |
| database | Database Server | Compute | db | NET | ETH0 eth 1 top · ETH1 eth 1 bottom · MGMT eth 1 right |
| storage-array | Storage Array / SAN | Compute | san | NET | FC1 fiber 1 left · FC2 fiber 1 right · MGMT eth 1 top |
| industrial-pc | Industrial PC | Industrial | ipc | OT | ETH0 eth 1 bottom · ETH1 eth 1 right · USB usb 1 left |
| remote-io | Remote I/O | Industrial | rio | OT | X1 P1 profinet 1 top · X1 P2 profinet 1 bottom · IO1 iolink 1 left · IO2 iolink 1 right |
| vfd | Frequency Inverter (VFD) | Industrial | vfd | OT | X1 P1 profinet 1 top · X1 P2 profinet 1 left · MOTOR power 1 bottom |
| safety-plc | Safety PLC | Industrial | fplc | OT | X1 P1 profinet 1 top · X1 P2 profinet 1 bottom · X2 eth 1 right |
| barcode-scanner | Barcode / Code Reader | Industrial | scn | OT | ETH eth 1 bottom · USB usb 1 right |
| sensor | Sensor (M12) | Industrial | sen | OT | IO iolink 1 top |
| actuator | Actuator / Valve | Industrial | act | OT | IO iolink 1 top |

NET = `NET_FIELDS`, OT = `OT_FIELDS` (from `draw.ts`). Media names: `ethernet`, `fiber`, `sfp`,
`wireless`, `usb`, `power`, `profinet`, `iolink`. Ports go on the artwork's outline where a cable
would attach; spread them so labels don't collide. Use `P(name, x, y, media, maxLinks, side)`.

Isometric style: import the helpers from `./iso` (`faces`, `frect`, `fpoly`, `fline`, `sil`, `at`,
`arrowU`, `arrowUV`, `bricks`, `cylinder`, `slab`, `I_WIFI`, `GEAR`, `W`, `NAVY`) and `isoBox` /
`isoCyl` / `poly` / `line` / `path` / `rect` / `rrect` / `circ` / `ell` / `text` / `P` / `def` from
`./draw`. Blue accent tokens (`A`, `AL`, `ALL`, `AD`, `ADD`), navy outlines, white glyphs in
perspective on the faces. `def('iso', {...})`.

Detailed style: solid blocks — square corners, no outlines, flat fills, no gradients; thin lines only
for grille/port detail; realistic proportions and product colours; no logos. Ids are `d-<base id>`.
`def('detailed', {...})`. (`solidify()` strips radii/strokes/gradients anyway, so don't rely on them.)
