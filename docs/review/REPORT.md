# Industrial-readiness review — Network Canvas 0.3

10 November 2026. Plan: [Network Canvas — industrial readiness review plan](https://claude.ai/artifact/UkQVn1HVa9s78EdT4j3hWR). Personas, jobs and reference projects: [SCENARIOS.md](SCENARIOS.md).

**Verdict: not yet usable as the official as-built documentation of a plant.** Once the eight fix pull requests (#56–#63) are merged it is safe for a team's own working diagrams: nothing is lost silently, damaged files no longer lock users out, and imports cannot smuggle script in. Three gaps still separate it from an industrial tool:

1. **Model.** No IEC 62443 zones and conduits, no cross-page links, no redundancy, incomplete asset identity.
2. **Deliverables.** No drawing sheets with title block and revision table, and no IP plan or bill of materials.
3. **Change management.** No revisions and no compare.

Those three gaps are milestones M2 and M3 below, about 80 working days of the remaining ~145.

## How it was reviewed

Four reviewers worked in parallel on the built single-file app, each with Playwright scripts. Every finding needed a reproduction, a measurement or a code reference; anything else was marked as opinion.

| Track | Findings | S1 | S2 | S3 | S4 |
|---|---|---|---|---|---|
| Data integrity + security | 18 | 4 | 9 | 4 | 1 |
| Performance + code, tests, architecture | 15 | 2 | 4 | 8 | 1 |
| Domain model + deliverables + benchmark | 20 | 1 | 12 | 7 | 0 |
| Job walkthroughs + usability, accessibility, language | 23 | 3 | 7 | 13 | 0 |
| **All tracks** | **76** | **10** | **32** | **32** | **2** |

Several tracks found the same problems independently: the malformed-file lock-out three times, and the CSV import corruption four times. After de-duplication the 76 findings became **52 GitHub issues**: 5 × S1, 22 × S2, 24 × S3, 1 × S4. They are labelled by severity, effort and area and grouped into five milestones. All five S1 issues and six more are fixed in open pull requests.

Severity: **S1** loses data, produces wrong documentation, or opens a security hole · **S2** a core industrial job cannot be done, or the tool cannot handle a real site · **S3** done with friction or a workaround · **S4** polish. Effort: **S** under a day · **M** 2–5 days · **L** more than a week.

## Verdict by attribute

| Attribute | At the start of the review | After the fix PRs | What still stands in the way |
|---|---|---|---|
| Data safety | Fails: silent overwrites, silent save failures, best-effort storage | Good | Library packs can override definitions used elsewhere ([#11](https://github.com/akira-rosa/networkcanvas/issues/11)); shared `file://` origin ([#13](https://github.com/akira-rosa/networkcanvas/issues/13)) |
| Reliability | Fails: one bad file locks every diagram away | Good | Error-message quality ([#52](https://github.com/akira-rosa/networkcanvas/issues/52)) |
| Security for plant networks | Fails: script via SVG icons, no CSP, CSV formulas | Good, apart from the release | Unverifiable releases: no checksum, SBOM or provenance ([#12](https://github.com/akira-rosa/networkcanvas/issues/12)) |
| Interoperability | Fails: CSV import corrupts data | Partial | No draw.io/Visio ([#23](https://github.com/akira-rosa/networkcanvas/issues/23)), engineering-tool import ([#25](https://github.com/akira-rosa/networkcanvas/issues/25)) or NetBox ([#34](https://github.com/akira-rosa/networkcanvas/issues/34)) |
| Domain correctness | Fails | Fails | Zones/conduits ([#14](https://github.com/akira-rosa/networkcanvas/issues/14)), cross-page links ([#15](https://github.com/akira-rosa/networkcanvas/issues/15)), redundancy ([#16](https://github.com/akira-rosa/networkcanvas/issues/16)), asset identity ([#17](https://github.com/akira-rosa/networkcanvas/issues/17)), cabling ([#19](https://github.com/akira-rosa/networkcanvas/issues/19)) |
| Deliverables | Fails | Fails | Drawing sheets ([#20](https://github.com/akira-rosa/networkcanvas/issues/20)), handover tables ([#22](https://github.com/akira-rosa/networkcanvas/issues/22)), tablet viewer ([#24](https://github.com/akira-rosa/networkcanvas/issues/24)) |
| Change management | Fails | Fails | Revisions and compare ([#21](https://github.com/akira-rosa/networkcanvas/issues/21)), change device type ([#26](https://github.com/akira-rosa/networkcanvas/issues/26)) |
| Scale | Meets the target shape (1,000 devices, ~50 per page); slow at 300–500 per page | Better (link drawing 4× faster) | Whole-page re-render ([#38](https://github.com/akira-rosa/networkcanvas/issues/38)), no culling ([#39](https://github.com/akira-rosa/networkcanvas/issues/39)), start screen ([#40](https://github.com/akira-rosa/networkcanvas/issues/40)) |
| Usability | Partial | Partial | Keyboard ([#29](https://github.com/akira-rosa/networkcanvas/issues/29)), translations ([#30](https://github.com/akira-rosa/networkcanvas/issues/30)), bulk editing ([#46](https://github.com/akira-rosa/networkcanvas/issues/46)) |
| Maintainability | Partial: 38 % coverage, untested release | Partial (tests for every fix) | Coverage ([#28](https://github.com/akira-rosa/networkcanvas/issues/28)), store and canvas structure ([#42](https://github.com/akira-rosa/networkcanvas/issues/42), [#43](https://github.com/akira-rosa/networkcanvas/issues/43)), file-format doc ([#44](https://github.com/akira-rosa/networkcanvas/issues/44)) |

## Fixed during the review

Each pull request is self-contained and verified with unit tests, the e2e smoke test and a scripted reproduction of the original finding. Merge order: **#56 before #58 and #59**, which are built on it; the others are independent.

| PR | Fixes | What changes |
|---|---|---|
| [#56](https://github.com/akira-rosa/networkcanvas/pull/56) | #4 (S1) | Every diagram is validated and repaired before it is opened or stored; newer format versions are refused; URLs and prototype keys are stripped; damaged entries can't take down the start screen |
| [#57](https://github.com/akira-rosa/networkcanvas/pull/57) | #5 (S1) | CSV import: one separator, RFC 4180, Windows-1252, exact EN/PT/ES header aliases, a type-mapping table, merge across pages, every skipped value reported |
| [#58](https://github.com/akira-rosa/networkcanvas/pull/58) | #6, #7 (S1) | Revision-checked saves (two tabs, re-opened files), visible save failures with retry, persistent storage, *No file copy* status, Download all |
| [#59](https://github.com/akira-rosa/networkcanvas/pull/59) | #8 (S1), #9 | SVG icons are sanitised before import; strict Content-Security-Policy (hashed script, no network) |
| [#60](https://github.com/akira-rosa/networkcanvas/pull/60) | #10, #41, part of #20 | CSV formula cells neutralised; PDF always printed light; PNG clamped to browser limits |
| [#61](https://github.com/akira-rosa/networkcanvas/pull/61) | #54, part of #53 and #24 | Ctrl+Shift+D/A fixed; library clicks always add; drill-down works in the viewer |
| [#62](https://github.com/akira-rosa/networkcanvas/pull/62) | #27 | Port-usage index: link drawing 100 → 25 ms per move on a 500-device page; checks on 1,000 devices 1,150 → 8 ms |
| [#63](https://github.com/akira-rosa/networkcanvas/pull/63) | #33, part of #31 | Checks no longer claim "every device is connected" when nothing is linked; invalid octets and network/broadcast addresses are errors |

## What to do next

The remaining 41 issues come to roughly 145 working days, counted as S = 1, M = 3.5 and L = 8 days. That is a planning figure, not an estimate. In order of value:

1. **M1 Data safety and security — 3 issues, ~8 days.** Release verification ([#12](https://github.com/akira-rosa/networkcanvas/issues/12)) and library-override consent ([#11](https://github.com/akira-rosa/networkcanvas/issues/11)) come before any client gets the tool. The `file://` origin ([#13](https://github.com/akira-rosa/networkcanvas/issues/13)) is mainly documentation.
2. **M3 deliverables core — ~25 days.** Drawing sheets ([#20](https://github.com/akira-rosa/networkcanvas/issues/20)), revisions and compare ([#21](https://github.com/akira-rosa/networkcanvas/issues/21)), handover tables ([#22](https://github.com/akira-rosa/networkcanvas/issues/22)). This turns drawings into documents an integrator can hand over.
3. **M2 model core — ~20 days.** Cross-page links ([#15](https://github.com/akira-rosa/networkcanvas/issues/15)), zones and conduits ([#14](https://github.com/akira-rosa/networkcanvas/issues/14)), asset identity ([#17](https://github.com/akira-rosa/networkcanvas/issues/17)). This makes the auditor's questions answerable.
4. **M2/M3 remainder** as projects need them: redundancy, cabling, fieldbus, tablet viewer, draw.io, engineering-tool import, NetBox.
5. **M4/M5** in parallel, small items first: contrast, labels, address row, error messages, then keyboard, translations and the performance refactors.

### Impact × effort (open issues)

| | Small effort (S) | Larger effort (M/L) |
|---|---|---|
| **High impact (S2)** | [#12](https://github.com/akira-rosa/networkcanvas/issues/12) verifiable releases | [#11](https://github.com/akira-rosa/networkcanvas/issues/11) [#13](https://github.com/akira-rosa/networkcanvas/issues/13) [#14](https://github.com/akira-rosa/networkcanvas/issues/14) [#15](https://github.com/akira-rosa/networkcanvas/issues/15) [#16](https://github.com/akira-rosa/networkcanvas/issues/16) [#17](https://github.com/akira-rosa/networkcanvas/issues/17) [#18](https://github.com/akira-rosa/networkcanvas/issues/18) [#19](https://github.com/akira-rosa/networkcanvas/issues/19) [#20](https://github.com/akira-rosa/networkcanvas/issues/20) [#21](https://github.com/akira-rosa/networkcanvas/issues/21) [#22](https://github.com/akira-rosa/networkcanvas/issues/22) [#23](https://github.com/akira-rosa/networkcanvas/issues/23) [#24](https://github.com/akira-rosa/networkcanvas/issues/24) [#25](https://github.com/akira-rosa/networkcanvas/issues/25) [#26](https://github.com/akira-rosa/networkcanvas/issues/26) [#28](https://github.com/akira-rosa/networkcanvas/issues/28) [#29](https://github.com/akira-rosa/networkcanvas/issues/29) [#30](https://github.com/akira-rosa/networkcanvas/issues/30) |
| **Lower impact (S3/S4)** | [#31](https://github.com/akira-rosa/networkcanvas/issues/31) [#37](https://github.com/akira-rosa/networkcanvas/issues/37) [#40](https://github.com/akira-rosa/networkcanvas/issues/40) [#44](https://github.com/akira-rosa/networkcanvas/issues/44) [#47](https://github.com/akira-rosa/networkcanvas/issues/47) [#48](https://github.com/akira-rosa/networkcanvas/issues/48) [#49](https://github.com/akira-rosa/networkcanvas/issues/49) [#51](https://github.com/akira-rosa/networkcanvas/issues/51) [#52](https://github.com/akira-rosa/networkcanvas/issues/52) [#53](https://github.com/akira-rosa/networkcanvas/issues/53) [#55](https://github.com/akira-rosa/networkcanvas/issues/55) | [#32](https://github.com/akira-rosa/networkcanvas/issues/32) [#34](https://github.com/akira-rosa/networkcanvas/issues/34) [#35](https://github.com/akira-rosa/networkcanvas/issues/35) [#36](https://github.com/akira-rosa/networkcanvas/issues/36) [#38](https://github.com/akira-rosa/networkcanvas/issues/38) [#39](https://github.com/akira-rosa/networkcanvas/issues/39) [#42](https://github.com/akira-rosa/networkcanvas/issues/42) [#43](https://github.com/akira-rosa/networkcanvas/issues/43) [#45](https://github.com/akira-rosa/networkcanvas/issues/45) [#46](https://github.com/akira-rosa/networkcanvas/issues/46) [#50](https://github.com/akira-rosa/networkcanvas/issues/50) |

## Key measurements

**Jobs, in the built app** (scripted; human time is a keystroke-level estimate):

| Job | Outcome before the fixes |
|---|---|
| 1. Draw a 40-device cell from nothing | Done: ~390 actions, ~19 min before arranging ([#46](https://github.com/akira-rosa/networkcanvas/issues/46)) |
| 2. Import a 40-row inventory | IPs silently replaced and columns shifted ([#5](https://github.com/akira-rosa/networkcanvas/issues/5), fixed); links, zones and VLANs still manual ([#36](https://github.com/akira-rosa/networkcanvas/issues/36)) |
| 3. Deliver an A3 sheet set | Not possible: no sheet size, frame or revision table ([#20](https://github.com/akira-rosa/networkcanvas/issues/20)) |
| 4. Revise and show what changed | Revising takes 71 actions with no replace-device ([#26](https://github.com/akira-rosa/networkcanvas/issues/26)); showing changes is impossible ([#21](https://github.com/akira-rosa/networkcanvas/issues/21)) |
| 5. Audit segmentation | Not answerable: no conduits, no cross-page links, no owner field ([#14](https://github.com/akira-rosa/networkcanvas/issues/14), [#15](https://github.com/akira-rosa/networkcanvas/issues/15), [#17](https://github.com/akira-rosa/networkcanvas/issues/17)) |
| 6. Troubleshoot on a tablet | IP found in 10 s; no cable ID, pinch zoom or page tabs ([#24](https://github.com/akira-rosa/networkcanvas/issues/24)) |

**Performance** (headless Chromium with software rendering, so paint figures are pessimistic). At the target shape (1,000 devices, ~50 per page) every budget is met: open in under 0.3 s, page switch ~30 ms, 60 fps, edits under 30 ms. On single pages of 300–500 devices:

- zoom runs at 20–30 fps;
- undo takes 100–146 ms;
- the start screen with 20 large diagrams takes 4 s.

[#37](https://github.com/akira-rosa/networkcanvas/issues/37)–[#40](https://github.com/akira-rosa/networkcanvas/issues/40) hold the budgets and the fixes.

**Quality.**

- Unit tests went from 12 to 42 across the review and fix PRs; e2e from 20 to 24 checks.
- Coverage was 38 % at the start, mostly icon data ([#28](https://github.com/akira-rosa/networkcanvas/issues/28)).
- The build is reproducible: two clean builds hash identically.

## Reference projects and scripts

`npm run fixtures` regenerates the reference projects:

- a 41-device cell;
- a 416-device, 12-page plant;
- a 2,000-device site (`npm run fixtures -- site`).

`tests/fixtures.test.ts` keeps them clean, and `tests/e2e/lib.mjs` opens them in the built app. The reviewers' one-off scripts lived in the review workspace. The reproductions that matter are now unit and e2e tests in the fix PRs.

## Full backlog

| Issue | Sev. | Effort | Title | Review findings | Status |
|---|---|---|---|---|---|
| [#12](https://github.com/akira-rosa/networkcanvas/issues/12) | S2 | S | Releases cannot be verified and ship untested: no checks, checksum, SBOM, provenance or licence notices | SEC-6, CODE-5, SEC-8, SEC-9 | open |
| [#11](https://github.com/akira-rosa/networkcanvas/issues/11) | S2 | M | Importing a library pack or opening a file silently replaces device definitions used by other diagrams, built-ins included | DATA-7 | open |
| [#13](https://github.com/akira-rosa/networkcanvas/issues/13) | S2 | M | Diagrams opened from disk share the file:// storage origin with every other local HTML file | SEC-4 | open |
| [#7](https://github.com/akira-rosa/networkcanvas/issues/7) | S1 | S | Failed autosaves are invisible, storage is best-effort, and nothing says whether a diagram was ever saved to a file | CODE-2, DATA-5, DATA-4, DATA-8 | fixed in [#58](https://github.com/akira-rosa/networkcanvas/pull/58) |
| [#8](https://github.com/akira-rosa/networkcanvas/issues/8) | S1 | S | Importing an SVG icon "as shapes" runs script embedded in the SVG | SEC-1 | fixed in [#59](https://github.com/akira-rosa/networkcanvas/pull/59) |
| [#4](https://github.com/akira-rosa/networkcanvas/issues/4) | S1 | M | A malformed file crashes the app and then the start screen on every launch, locking users out of all diagrams | CODE-1, DATA-3, UX-1, DATA-9, SEC-2, SEC-7 | fixed in [#56](https://github.com/akira-rosa/networkcanvas/pull/56) |
| [#5](https://github.com/akira-rosa/networkcanvas/issues/5) | S1 | M | CSV import silently corrupts data: wrong column mapping, mixed delimiters, wrong device types, duplicates across pages | BENCH-2, JOB-1, JOB-2, DATA-6, CODE-3 | fixed in [#57](https://github.com/akira-rosa/networkcanvas/pull/57) |
| [#6](https://github.com/akira-rosa/networkcanvas/issues/6) | S1 | M | Saves silently overwrite newer work: two tabs on one diagram, and re-opening a file whose diagram is already in the browser | DATA-1, DATA-2 | fixed in [#58](https://github.com/akira-rosa/networkcanvas/pull/58) |
| [#9](https://github.com/akira-rosa/networkcanvas/issues/9) | S2 | S | The built file has no Content-Security-Policy | SEC-3 | fixed in [#59](https://github.com/akira-rosa/networkcanvas/pull/59) |
| [#10](https://github.com/akira-rosa/networkcanvas/issues/10) | S2 | S | CSV exports do not neutralise formula cells (=, +, -, @) | SEC-5 | fixed in [#60](https://github.com/akira-rosa/networkcanvas/pull/60) |
| [#15](https://github.com/akira-rosa/networkcanvas/issues/15) | S2 | M | Links cannot cross pages, so a multi-page plant cannot be connected (and the workaround corrupts checks and inventory) | DOM-2, JOB-7 | open |
| [#16](https://github.com/akira-rosa/networkcanvas/issues/16) | S2 | M | Redundancy (MRP, DLR, RSTP, PRP/HSR, LAG) is not modelled; a broken ring or an accidental loop is invisible | DOM-3, JOB-12 | open |
| [#17](https://github.com/akira-rosa/networkcanvas/issues/17) | S2 | M | Asset identity is incomplete: PLCs have no serial/MAC/location field, no owner or criticality, PROFINET names unchecked | DOM-4, JOB-7 | open |
| [#18](https://github.com/akira-rosa/networkcanvas/issues/18) | S2 | M | Fieldbus segments behind gateways (PROFIBUS, Modbus RTU, RS-485) cannot be drawn | DOM-6 | open |
| [#19](https://github.com/akira-rosa/networkcanvas/issues/19) | S2 | M | Cabling reality is missing: no patch-panel pass-through, no cable type/length/labels per end, duplicate cable IDs pass | DOM-7, BENCH-3 | open |
| [#14](https://github.com/akira-rosa/networkcanvas/issues/14) | S2 | L | Zones cannot express IEC 62443 zones and conduits, security levels or Purdue levels | DOM-1, JOB-7 | open |
| [#31](https://github.com/akira-rosa/networkcanvas/issues/31) | S3 | S | VLANs have no gateway: "next free address" hands out .1 first, and network/broadcast addresses pass the checks | DOM-5, JOB-10 | open |
| [#32](https://github.com/akira-rosa/networkcanvas/issues/32) | S3 | M | Link VLAN membership is free text and never validated | DOM-8 | open |
| [#33](https://github.com/akira-rosa/networkcanvas/issues/33) | S3 | S | Checks give false assurance: 40 unlinked devices show "every device is connected", 192.168.50.300 passes | JOB-11 | fixed in [#63](https://github.com/akira-rosa/networkcanvas/pull/63) |
| [#20](https://github.com/akira-rosa/networkcanvas/issues/20) | S2 | M | Print/PDF is not a drawing sheet: no paper size, frame or sheet numbering; wide pages become unreadable; dark theme prints dark sheets | DEL-1, JOB-6, DEL-3 | open |
| [#22](https://github.com/akira-rosa/networkcanvas/issues/22) | S2 | M | Handover tables are missing or weak: no IP plan, no bill of materials, no Excel; inventory crams properties into one cell | DEL-4, BENCH-5 | open |
| [#24](https://github.com/akira-rosa/networkcanvas/issues/24) | S2 | M | Interactive viewer on a tablet: pinch-zoom does nothing, most page tabs are unreachable, cable IDs and page links are missing | DEL-6, JOB-8, DEL-7 | open |
| [#26](https://github.com/akira-rosa/networkcanvas/issues/26) | S2 | M | A device’s type cannot be changed and a device cannot be replaced while keeping its links | JOB-3 | open |
| [#21](https://github.com/akira-rosa/networkcanvas/issues/21) | S2 | L | No revisions, history or compare: the title-block date is the last edit, and the client cannot be shown what changed | DEL-2, JOB-5 | open |
| [#23](https://github.com/akira-rosa/networkcanvas/issues/23) | S2 | L | No exchange with draw.io or Visio | DEL-5 | open |
| [#25](https://github.com/akira-rosa/networkcanvas/issues/25) | S2 | L | No import of the engineering project (TIA Portal AutomationML, Rockwell exports): every PLC, drive and IP is retyped | BENCH-1 | open |
| [#35](https://github.com/akira-rosa/networkcanvas/issues/35) | S3 | M | No way to compare the drawing with a discovered topology (LLDP / NMS export) | BENCH-4 | open |
| [#36](https://github.com/akira-rosa/networkcanvas/issues/36) | S3 | M | CSV import ignores VLAN and cabinet columns, places everything in one grid and cannot import links | JOB-4 | open |
| [#34](https://github.com/akira-rosa/networkcanvas/issues/34) | S3 | L | No NetBox-style structure (site/location/rack, cable status) or NetBox interchange | BENCH-3 | open |
| [#28](https://github.com/akira-rosa/networkcanvas/issues/28) | S2 | L | Persistence, store actions, checks, CSV and exports have no tests (38 % coverage, mostly icon data) | CODE-4 | open |
| [#37](https://github.com/akira-rosa/networkcanvas/issues/37) | S3 | S | Undo/redo and edits with nothing selected take 100–146 ms on a 500-device page | PERF-2 | open |
| [#40](https://github.com/akira-rosa/networkcanvas/issues/40) | S3 | S | The start screen renders every saved diagram in full: 4 s and a 1.8 s freeze with 20 large diagrams | PERF-5 | open |
| [#44](https://github.com/akira-rosa/networkcanvas/issues/44) | S3 | S | The file format is undocumented: no schema, version policy or format changelog | CODE-8, DATA-9 | open |
| [#38](https://github.com/akira-rosa/networkcanvas/issues/38) | S3 | M | Every change re-renders the whole page (no per-node memoisation) | PERF-3 | open |
| [#39](https://github.com/akira-rosa/networkcanvas/issues/39) | S3 | M | Pan and zoom repaint all ~25,000 SVG elements of a dense page (no culling or level of detail) | PERF-4 | open |
| [#42](https://github.com/akira-rosa/networkcanvas/issues/42) | S3 | M | One store mixes document, history, UI and viewport; components subscribe to all of it; gesture history has holes | CODE-6 | open |
| [#43](https://github.com/akira-rosa/networkcanvas/issues/43) | S3 | M | Canvas.tsx holds the whole gesture state machine; double-click and keyboard handling are duplicated across 8 listeners | CODE-7 | open |
| [#55](https://github.com/akira-rosa/networkcanvas/issues/55) | S4 | S | The perf helper measures rAF cadence, not render cost; no performance budget is tested | CODE-9 | open |
| [#27](https://github.com/akira-rosa/networkcanvas/issues/27) | S2 | S | Port-usage lookups are O(devices × ports × links): big selections, link drawing and checks stall on 300–500-device pages | PERF-1 | fixed in [#62](https://github.com/akira-rosa/networkcanvas/pull/62) |
| [#41](https://github.com/akira-rosa/networkcanvas/issues/41) | S3 | S | PNG export at 3×/4× fails on large pages with a meaningless error | PERF-6 | fixed in [#60](https://github.com/akira-rosa/networkcanvas/pull/60) |
| [#29](https://github.com/akira-rosa/networkcanvas/issues/29) | S2 | M | The editor cannot be used from the keyboard: library items and toggles are not focusable, no keyboard way to add or link | UX-2 | open |
| [#30](https://github.com/akira-rosa/networkcanvas/issues/30) | S2 | L | No translation layer: ~500 hard-coded English strings, English title blocks and plurals, comma-only CSV | UX-8 | open |
| [#47](https://github.com/akira-rosa/networkcanvas/issues/47) | S3 | S | Screen readers get unnamed buttons and unlabeled fields (axe: 44 unnamed buttons, up to 462 unlabeled inputs) | UX-3 | open |
| [#48](https://github.com/akira-rosa/networkcanvas/issues/48) | S3 | S | Hint text, primary buttons, zone pills and fibre/PROFINET/IO-Link ports fall below WCAG contrast | UX-4 | open |
| [#49](https://github.com/akira-rosa/networkcanvas/issues/49) | S3 | S | VLAN identity is carried by colour alone, and new VLANs reuse colours | UX-5 | open |
| [#51](https://github.com/akira-rosa/networkcanvas/issues/51) | S3 | S | The inspector’s address row clips IPv4 addresses | UX-7 | open |
| [#52](https://github.com/akira-rosa/networkcanvas/issues/52) | S3 | S | Error messages are technical or missing (raw JS errors, no inline validation for subnets and VLAN IDs) | UX-9 | open |
| [#53](https://github.com/akira-rosa/networkcanvas/issues/53) | S3 | S | The first hour gets little help, and two quick clicks on a library card add nothing | UX-10 | open |
| [#45](https://github.com/akira-rosa/networkcanvas/issues/45) | S3 | M | Overlapping links cannot be told apart or clicked; the ring-closing link hides the ring | JOB-12 | open |
| [#46](https://github.com/akira-rosa/networkcanvas/issues/46) | S3 | M | No bulk operations: a 40-device cell costs ~390 actions before arranging | JOB-13 | open |
| [#50](https://github.com/akira-rosa/networkcanvas/issues/50) | S3 | M | The editor has no small-screen layout and touch does not pan, zoom or drag | UX-6 | open |
| [#54](https://github.com/akira-rosa/networkcanvas/issues/54) | S3 | S | Ctrl+Shift+D duplicates the selection and Ctrl+Shift+A selects all, instead of the documented actions | JOB-9 | fixed in [#61](https://github.com/akira-rosa/networkcanvas/pull/61) |

## Finding → issue index

BENCH-1 → #25 · BENCH-2 → #5 · BENCH-3 → #19 · BENCH-3 → #34 · BENCH-4 → #35 · BENCH-5 → #22 · CODE-1 → #4 · CODE-2 → #7 · CODE-3 → #5 · CODE-4 → #28 · CODE-5 → #12 · CODE-6 → #42 · CODE-7 → #43 · CODE-8 → #44 · CODE-9 → #55 · DATA-1 → #6 · DATA-2 → #6 · DATA-3 → #4 · DATA-4 → #7 · DATA-5 → #7 · DATA-6 → #5 · DATA-7 → #11 · DATA-8 → #7 · DATA-9 → #4 · DATA-9 → #44 · DEL-1 → #20 · DEL-2 → #21 · DEL-3 → #20 · DEL-4 → #22 · DEL-5 → #23 · DEL-6 → #24 · DEL-7 → #24 · DOM-1 → #14 · DOM-2 → #15 · DOM-3 → #16 · DOM-4 → #17 · DOM-5 → #31 · DOM-6 → #18 · DOM-7 → #19 · DOM-8 → #32 · JOB-1 → #5 · JOB-2 → #5 · JOB-3 → #26 · JOB-4 → #36 · JOB-5 → #21 · JOB-6 → #20 · JOB-7 → #14 · JOB-7 → #15 · JOB-7 → #17 · JOB-8 → #24 · JOB-9 → #54 · JOB-10 → #31 · JOB-11 → #33 · JOB-12 → #16 · JOB-12 → #45 · JOB-13 → #46 · PERF-1 → #27 · PERF-2 → #37 · PERF-3 → #38 · PERF-4 → #39 · PERF-5 → #40 · PERF-6 → #41 · SEC-1 → #8 · SEC-2 → #4 · SEC-3 → #9 · SEC-4 → #13 · SEC-5 → #10 · SEC-6 → #12 · SEC-7 → #4 · SEC-8 → #12 · SEC-9 → #12 · UX-1 → #4 · UX-2 → #29 · UX-3 → #47 · UX-4 → #48 · UX-5 → #49 · UX-6 → #50 · UX-7 → #51 · UX-8 → #30 · UX-9 → #52 · UX-10 → #53
