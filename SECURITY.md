# Security

Network Canvas is a single offline HTML file that is often copied onto plant PCs without internet access.
This page explains how to check that a copy is genuine and how to report a problem.

## Verify a copy before installing it

Every release on GitHub is built by the release workflow from a tagged commit, and only after the full
test suite passes on that commit. Each release ships with:

| File | What it is for |
|---|---|
| `NetworkCanvas.html` | The app |
| `NetworkCanvas.html.sha256` | SHA-256 checksum of the app |
| `NetworkCanvas.sbom.cdx.json` | Software bill of materials (CycloneDX) of the components inside the app |
| `THIRD_PARTY_NOTICES.txt` | Licences of those components (also in the app: File › About) |

There is also a signed build-provenance attestation that ties the file to this repository and the workflow
run that built it.

1. **Checksum.** In the folder with both files:
   - Linux/macOS: `sha256sum -c NetworkCanvas.html.sha256`
   - Windows PowerShell: `(Get-FileHash NetworkCanvas.html -Algorithm SHA256).Hash`, then compare with the file's content
2. **Provenance** (needs the GitHub CLI on any machine with internet; the file can then be carried to the plant):
   `gh attestation verify NetworkCanvas.html --repo akira-rosa/networkcanvas`
3. **Rebuild it yourself** (the build is reproducible): check out the tag, run `npm ci && npm run build`, and
   compare the SHA-256 of `dist/NetworkCanvas.html` with the release checksum.

## What the app does and does not do

- It makes **no network requests**: a Content-Security-Policy in the file blocks every connection, script
  source other than its own code, plugins and form submissions.
- Diagrams are stored in the browser (IndexedDB) and in files you save. Copies opened from disk (`file://`)
  share browser storage with other local HTML files, so on shared PCs prefer serving the file from its own
  address (an internal web server or the GitHub Pages copy) and keep diagrams as files.
- Opened diagrams, CSV inventories, SVG icons and library packs are validated and cleaned before use.

## Reporting a vulnerability

Please use GitHub's private reporting (**Security › Report a vulnerability** in this repository) rather than a
public issue. Include the Network Canvas version (File › About) and, if possible, a file that reproduces it.
