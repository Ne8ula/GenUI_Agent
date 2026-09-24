# E1 bundled font assets

Owned by `experiments/e1/public/fonts/**` (UI worker scope). Static self-hosted
`.woff2` files, one weight subset per family, latin only. No network font
loading and no runtime provider call is required to render E1.

## Provenance

Font family CSS/binary source: the `@fontsource` distribution of each
upstream font, matching the exact version already reviewed and used by
`week1/apps/desktop` (`package.json` pinned `^5`, resolved `5.3.0`).

| Family | Package | Resolved version | Weights included | Subset |
| --- | --- | --- | --- | --- |
| Space Grotesk | `@fontsource/space-grotesk` | 5.3.0 | 400, 500, 600, 700 | latin |
| IBM Plex Sans | `@fontsource/ibm-plex-sans` | 5.3.0 | 400, 500, 600 | latin |
| IBM Plex Mono | `@fontsource/ibm-plex-mono` | 5.3.0 | 400, 500 | latin |

Tarball integrity (verified against the local npm cache's stored
`sha512` before extracting, matching the registry-recorded integrity):

- `@fontsource/space-grotesk@5.3.0`: `sha512-ksnGizDPXIDuvqcTYTSrmZ+evx9sDlS8rp7+42BQ7wU+spt3twEoXfbJz672C+5CLg6VeUQwRy5RXshWb67LcQ==`
- `@fontsource/ibm-plex-sans@5.3.0`: `sha512-CbE4CbbEEZJX860XyUiRpsksXIQR8Rp2XDva2VO53NJox9tVNtusrysd2x5YkUEY3ErQ66W1IiiQL8/wihhw5w==`
- `@fontsource/ibm-plex-mono@5.3.0`: `sha512-eTgnZjZEGk1QtD3ZstF+Vclo2HLAni8YMy34/DxllwZvyz1lR/1RF/xTiAquOBO7MvqBx8D2Ig2WCPMVfdZu7Q==`

Extraction method: the three package tarballs were already present in this
machine's local npm cache (`npm config get cache`) from the earlier,
separately authorized week1 setup that declared these same `@fontsource`
dependencies. This UI task did not perform a new network fetch or package
install; the tarball bytes were read directly out of the existing local
cache (`cacache`) by exact registry URL, and each tarball's SHA-512 was
recomputed and confirmed to match the cache's recorded integrity before
any file was copied. Only the `latin` weight files actually used by this
experiment were copied out of each tarball's `files/` directory into this
folder; no `package.json`/`node_modules` was modified anywhere in the repo.

License: SIL Open Font License 1.1 for all three families. Each
subfolder's `OFL.txt` is copied byte-for-byte from the already-reviewed
copy bundled at `week1/apps/desktop/public/licenses/*-OFL.txt`. Per the
E1 UI ownership boundary, no other week1 file was read for editing and
none was modified.

## Files

```
space-grotesk/OFL.txt
space-grotesk/space-grotesk-latin-{400,500,600,700}-normal.woff2
ibm-plex-sans/OFL.txt
ibm-plex-sans/ibm-plex-sans-latin-{400,500,600}-normal.woff2
ibm-plex-mono/OFL.txt
ibm-plex-mono/ibm-plex-mono-latin-{400,500}-normal.woff2
```

## Known limitation

Only the `latin` subset and a bounded weight set were bundled (headings/
display and primary metric use Space Grotesk 400-700; reading/control text
uses IBM Plex Sans 400/500/600; quantities and timestamps use IBM Plex Mono
400/500). Italic, extended Latin, Cyrillic, and Vietnamese subsets were not
needed for the English-only W-NYC-01 fixture and were not copied. If the
integrated `experiments/e1` workspace later adds `@fontsource/*` as an
actual npm dependency (a package-config decision owned by Sol/main, not by
this UI task), these bundled static files remain a safe fallback and can
be reconciled or removed as a separate, explicitly scoped change.
