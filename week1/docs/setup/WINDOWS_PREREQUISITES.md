# Windows Tauri prerequisites

Verified on 2026-09-16 for [week-one setup](../../WEEK1_DEMO_PLANNING.md), Section 3.

Scope: install and verify the Windows dependencies. This is not a Tauri app build, window/IPC demonstration, or owner phase acceptance. The repository had no package manifest or Rust crate when checked. Existing planning edits were preserved.

## Verified environment

| Dependency | Version / result | Action |
| --- | --- | --- |
| Node.js | 24.14.0 | Already installed |
| npm | 11.9.0 | Already installed |
| Microsoft Edge WebView2 Runtime | 153.0.4234.32 | Already installed; verified in runtime registry |
| Visual Studio Build Tools 2022 | 17.14.41; installation version 17.14.37710.0 | Installed; installer exit code 0 |
| MSVC x86/x64 tools | 14.44.35207 | Installed |
| Windows SDK | 10.0.26100.0 | Required component registered; Windows.h, x64 kernel32.lib and ucrt.lib verified |
| Rust / Cargo | 1.98.1 / 1.98.1 | Installed through rustup |
| Rust host / default toolchain | x86_64-pc-windows-msvc / stable-x86_64-pc-windows-msvc | Verified active |
| Rust tooling | rustfmt, Clippy, standard library and documentation | Installed with default profile |

Visual Studio reports a complete installation and no required reboot. Rust's Cargo bin directory is present in the user PATH. Existing terminals and the IDE may need to restart to inherit that PATH.

## Installation details

Official sources: [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows), [Rust installation](https://rust-lang.org/tools/install/), and [Microsoft installer parameters](https://learn.microsoft.com/en-us/visualstudio/install/use-command-line-parameters-to-install-visual-studio?view=vs-2022).

Downloaded the Microsoft bootstrapper from `https://aka.ms/vs/17/release/vs_BuildTools.exe` and validated its Microsoft Corporation Authenticode signature. Installed with:

```powershell
.\vs_BuildTools.exe --quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.26100
```

Downloaded Rust's x64 installer from `https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe` and matched its SHA256 to the checksum published at that URL plus `.sha256`. Installed with:

```powershell
.\rustup-init.exe -y --default-host x86_64-pc-windows-msvc --default-toolchain stable --profile default
```

Installers and the temporary smoke project were retained under `%TEMP%\eva-tauri-prereqs`, outside the repository. These installer URLs track releases; future installs may resolve newer versions.

## Checks executed

Passed: `node --version`, `npm.cmd --version`, `rustc --version`, `cargo --version`, `rustup show`, and `rustup component list --installed`. `vswhere` found a complete Build Tools installation containing both the compiler and requested SDK components.

Created a temporary binary crate with `cargo new --bin --vcs none --name eva_prereq_smoke` and ran `cargo run --offline` against its manifest. Compilation, MSVC linking, and execution succeeded with `Hello, world!`. This verifies the native Rust toolchain; it does not verify Tauri dependencies or WebView rendering.

To check from a fresh PowerShell terminal:

```powershell
node --version
npm.cmd --version
rustc --version
cargo --version
rustup show
```

For an existing terminal, refresh only that process's PATH before checking:

```powershell
$env:Path = (Join-Path $env:USERPROFILE '.cargo\bin') + ';' + $env:Path
```

## Next checkpoint

Follow-up on 2026-09-16: the owner authorized scaffolding, and the debug window/IPC checkpoint is now implemented and tested. See the [desktop README](../../apps/desktop/README.md) and [pending review record](../design/acceptance/week1-demo.md). The optimized release build encountered a Windows Application Control blocker documented there. The prerequisite results above remain the original installation record.

Scaffold the planned npm workspace and Tauri 2 / React / TypeScript application under `apps/desktop`, install project-local Tauri packages with a lockfile, then verify a plain native window and one frontend-to-Rust command. Those steps, the browser fallback, and the demo acceptance checks remain pending. No global Tauri CLI, application source, GPU tooling, or installer packaging was added during prerequisite setup.
