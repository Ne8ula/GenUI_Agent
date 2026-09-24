# Quarantined frame-playback experiment

Do not launch the previous native GPU build. The owner reported system-wide black screens/freezes during its Sunny→Rainy transition. The cause has not been proven. Both the source entry point and desktop-dev launcher are blocked; hardware-initializing tests are excluded from normal test runs.

`weave-derived/` contains the rejected foreground-extracted PNG sequences for historical evidence only. They are not particles, are not loaded by the new procedural renderer, and are no longer in Vite's public directory or Tauri's resource bundle. Original Weave inputs remain unchanged under `weave/`.

A new native renderer needs a separately reviewed lifecycle, bounded messaging, proper device-loss/shutdown handling, and explicit owner authorization before hardware testing. Browser software-rendered checks do not establish native recovery.
