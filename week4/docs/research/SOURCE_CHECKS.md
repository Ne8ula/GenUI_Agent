# Week 4 targeted source checks

Accessed 2026-10-03 by a read-only Cloud research worker (built-in `general-purpose` agent on the session's Claude model; the project's Terra route was unavailable in Cloud). The main session has not re-fetched these pages. This is a targeted check of the assumptions in [planning.md](../../planning.md) §6.2, §6.4, §11 and [DESIGN_PROMPT.md](../../DESIGN_PROMPT.md) §9. It is not a literature review.

Reading levels used below:
- **Full page:** the worker read the whole official page.
- **Excerpt:** a fetch tool read the whole page but returned quoted excerpts.
- **Snippet only:** seen only in search results. Not verified.

Documentary facts are kept separate from artistic interpretation.

## A. Windows APIs (Microsoft Learn, official documentation, full pages)

| Claim | Verdict | Notes |
| --- | --- | --- |
| `IDesktopWallpaper::SetWallpaper`/`GetWallpaper` work per monitor ID; NULL means all monitors | Supported | `GetWallpaper` returns S_FALSE and an empty string when monitors differ or a slideshow runs. The string is also empty for a solid colour. [SetWallpaper](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-idesktopwallpaper-setwallpaper), [GetWallpaper](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-idesktopwallpaper-getwallpaper) |
| Position mode and background colour can be snapshotted **per monitor** (planning §6.4 wording) | **Contradicted** | `Get/SetPosition` and `Get/SetBackgroundColor` take no monitor ID; they are global. `DWPOS_SPAN` spans one image across all monitors. The snapshot is therefore a per-monitor path plus global position/colour, and the broker must never change the global values. |
| Slideshow can be detected | Supported | `GetStatus` returns `DSS_ENABLED`/`DSS_SLIDESHOW`/`DSS_DISABLED_BY_REMOTE_SESSION`; `GetSlideshow` returns the items. |
| Spotlight or policy lock can be detected through `IDesktopWallpaper` | Not established | Not mentioned on any page read. Treat unknown as not restorable. |
| `Enable` | Supported, with a side effect | `SetWallpaper` re-enables a disabled background, so the journal records enabled state. |
| `GetMonitorDevicePathAt`/`Count` | Supported | The count includes detached monitors that have an image; `GetMonitorRECT` distinguishes them. |
| `WINDOWPLACEMENT` and `Get/SetWindowPlacement` | Supported | `length` must be initialized. Positions are in **workspace** coordinates for top-level non-tool windows. Workspace coordinates passed to `SetWindowPos` make windows "creep". Off-screen placement is pulled back into view. [WINDOWPLACEMENT](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-windowplacement) |
| Window identity via `GetWindowThreadProcessId`, `GetProcessTimes` | Supported | Creation time is a FILETIME. `PROCESS_QUERY_LIMITED_INFORMATION` access is needed. |
| HWNDs are recycled | Supported | [`IsWindow` remarks](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-iswindow): "window handles are recycled". This justifies identity by handle + PID + process start time. |
| A medium-integrity process cannot move an elevated window with `SetWindowPos` | Not established | The archived 2007 integrity-mechanism page covers dropped messages and handle validation, not `SetWindowPos`. Excluding elevated windows remains the conservative rule; measure in the spike. |
| `DWMWA_CLOAKED`, `GetDpiForWindow`, `MonitorFromWindow`, Per-Monitor v2 | Supported | `GetDpiForWindow` reflects the *target's* awareness (96 if unaware), so it is not a reliable monitor DPI for foreign windows. Use the monitor's DPI. |
| Session lock detection (`WTSRegisterSessionNotification`, `WM_WTSSESSION_CHANGE`) | Supported | `WTS_SESSION_LOCK` (0x7) and `WTS_SESSION_UNLOCK` (0x8). |
| UAC secure-desktop detection | Not established | |

## B. MediaPipe Face Landmarker for Web (Google AI Edge, official documentation, full pages)

Pages read: [web guide](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js) (updated 2026-08-17) and [overview](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) (updated 2026-10-01).

- **Supported:** `detect()`/`detectForVideo()` run synchronously and block the UI thread; the guide recommends web workers. Planning §6.2 is accurate.
- **Supported:** option names are `numFaces`, `outputFaceBlendshapes`, `outputFacialTransformationMatrixes` and the three confidence thresholds. The model outputs 478 landmarks and 52 blendshapes. Smoothing applies only when `numFaces` is 1.
- **Not established:** iris landmark indices, metric accuracy, the normalisation range and z units, transformation-matrix units, and any latency figures. The Week 4 tracking core therefore takes generic eye-centre points and an assumed interpupillary distance (IPD), and is labelled approximate.

## C. 1980s Paris details (artistic interpretation remains separate)

| Item | Verdict | Source level |
| --- | --- | --- |
| Franc coins circulated before the euro; silver 5/10/50 F coins could be demonetised by Décret 80-148 (1980) | Partially supported | Légifrance excerpts ([65-16](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000310581), [80-148](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000519482)). There is no institutional list of the denominations in 1980s circulation. |
| Euro cash introduced 1 Jan 2002 | Supported | [ECB](https://www.ecb.europa.eu/euro/intro/html/index.en.html), excerpt |
| Loi Évin (91-32, 10 Jan 1991) restricted smoking in collective-use places; café/bar ban effective 1 Jan 2008 (Décret 2006-1386) | Supported | Légifrance excerpts ([91-32](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000000344577), [2006-1386](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000000818309)) |
| Smoking on a 1980s café terrace was legal | Partially supported, by inference | The scope of Décret 77-1042 for cafés was seen as a snippet only |
| Renault 5 produced 1972–1984/85 | Supported (manufacturer heritage claim) | [Renault Originals](https://theoriginals.renault.com/en/r5-tl), [Renault Group](https://www.renaultgroup.com/en/magazine/our-group-news/renault-5-supercar-of-the-seventies-and-eighties/). The end years differ by one between the two pages. |
| Peugeot 205 launched 1983 | Snippet only, not verified | |
| Rattan bistro chairs from Paris makers (Drucker since 1885, Gatti since 1920) | Manufacturer claims only | [Drucker](https://www.maisonlouisdrucker.com/en), [Gatti](https://maison-gatti.com/en). Use on 1980s terraces specifically is not established. |
| Sony Walkman launched 1979 | Snippet only, not verified | The official pages returned 403 |
| 1980s Paris lamp styles; everyday 1980s wardrobe | Not established | |

**Artistic consequences (interpretation, not evidence):** generic, unbranded silhouettes stay safest: a badge-free hatchback, coins without readable designs, unbranded rattan. Euros, smartphones and similar anachronisms stay excluded, as DESIGN_PROMPT §6 already requires. Wardrobe, lamps and signage still need institutional sourcing before native authoring, so the planning §11 authenticity blocker is **only partly cleared**.

## Consequences applied in Week 4 code

- The mocked broker's wallpaper snapshot models the per-monitor path separately from the global position, colour and enabled state. The broker never alters the global values, and an unsuitable or unknown configuration selects degraded mode. See the broker crate's README for the exact handling.
- Window identity uses handle + PID + process start time, and a recycled handle is never acted on.
- Head-pose input stays generic and approximate.

`planning.md` was not edited. The §6.4 "per-monitor" wording conflicts with the API documentation, and this file records the correction for the owner.
