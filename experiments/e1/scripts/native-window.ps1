param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [int]$ClientWidth = 1440,
  [int]$ClientHeight = 900
)
$ErrorActionPreference = 'Stop'
$process = Get-Process -Id $ProcessId
$expected = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../src-tauri/target/debug/eva-e1.exe'))
if ($process.Path -ne $expected) { throw 'Refusing to resize a process outside this E1 debug build.' }
if ($ClientWidth -lt 720 -or $ClientWidth -gt 3840 -or $ClientHeight -lt 600 -or $ClientHeight -gt 2160) {
  throw 'Client dimensions exceed the bounded E1 test envelope.'
}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class E1Window {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect r);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out Rect r);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hgt, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
}
'@
[E1Window]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null
$handle = $process.MainWindowHandle
if ($handle -eq [IntPtr]::Zero) { throw 'E1 has no visible native window.' }
[E1Window]::ShowWindow($handle, 9) | Out-Null
$outer = New-Object E1Window+Rect
$client = New-Object E1Window+Rect
[E1Window]::GetWindowRect($handle, [ref]$outer) | Out-Null
[E1Window]::GetClientRect($handle, [ref]$client) | Out-Null
$width = $ClientWidth + ($outer.Right - $outer.Left) - $client.Right
$height = $ClientHeight + ($outer.Bottom - $outer.Top) - $client.Bottom
if (-not [E1Window]::SetWindowPos($handle, [IntPtr]::Zero, 0, 0, $width, $height, 0x0040)) {
  throw 'Native resize failed.'
}
[E1Window]::SetForegroundWindow($handle) | Out-Null
[E1Window]::GetClientRect($handle, [ref]$client) | Out-Null
@{ processId = $ProcessId; clientPhysicalWidth = $client.Right; clientPhysicalHeight = $client.Bottom; dpi = [E1Window]::GetDpiForWindow($handle) } | ConvertTo-Json -Compress
