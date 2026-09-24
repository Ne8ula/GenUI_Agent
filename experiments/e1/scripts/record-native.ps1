param(
    [Parameter(Mandatory = $true)][int]$FixtureProcessId,
    [Parameter(Mandatory = $true)][string]$StatePath,
    [Parameter(Mandatory = $true)][int]$E1ProcessId,
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [ValidateRange(1, 60)][int]$DurationSeconds = 30,
    [ValidateRange(5, 20)][int]$FramesPerSecond = 12
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$out = [IO.Path]::GetFullPath($OutputDirectory)
if ([IO.Directory]::Exists($out)) { throw 'Use a new scratch directory; prior recordings are preserved.' }
[IO.Directory]::CreateDirectory($out) | Out-Null

# The probe loads the reviewed native guard, validates both processes, and
# activates only the synthetic underlay through a normal preparatory click.
. (Join-Path $PSScriptRoot 'desktop-probe.ps1') -FixtureProcessId $FixtureProcessId -StatePath $StatePath -E1ProcessId $E1ProcessId -Action Capture -PrepareFixture | Out-Null
$fixtureState = [IO.File]::ReadAllText($StatePath) | ConvertFrom-Json
$fixtureHandle = [IntPtr]([int64]$fixtureState.windowHandle)
$area = [E1DesktopProbeNative]::GetClientScreenRect($fixtureHandle)
$frames = New-Object 'System.Collections.Generic.List[object]'
$clock = [Diagnostics.Stopwatch]::StartNew()
$complete = $false
$failure = $null

try {
    while ($clock.Elapsed.TotalSeconds -lt $DurationSeconds) {
        [E1DesktopProbeNative]::ValidateCaptureSurface($fixtureHandle)
        $at = $clock.Elapsed.TotalMilliseconds
        $name = 'frame-{0:D5}.png' -f $frames.Count
        $bitmap = New-Object System.Drawing.Bitmap -ArgumentList @([int]$area[2], [int]$area[3], [System.Drawing.Imaging.PixelFormat]::Format32bppPArgb)
        $graphics = $null
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            $graphics.CopyFromScreen($area[0], $area[1], 0, 0, $bitmap.Size, [System.Drawing.CopyPixelOperation]::SourceCopy)
            [E1DesktopProbeNative]::ValidateCaptureSurface($fixtureHandle)
            $bitmap.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
        }
        finally {
            if ($graphics) { $graphics.Dispose() }
            $bitmap.Dispose()
        }
        $frames.Add(@{ file = $name; elapsedMs = $at })
        if ($frames.Count -eq 1) {
            @{ event = 'recording-start'; width = $area[2]; height = $area[3]; durationSeconds = $DurationSeconds } | ConvertTo-Json -Compress
        }
        $wait = [int]([Math]::Max(0, $frames.Count * 1000.0 / $FramesPerSecond - $clock.Elapsed.TotalMilliseconds))
        if ($wait -gt 0) { [Threading.Thread]::Sleep($wait) }
    }
    $complete = $true
}
catch { $failure = $_.Exception.Message }
finally { $clock.Stop() }

$manifest = @{ kind = 'native-desktop-composite'; completed = $complete; failure = $failure;
    nominalCaptureFps = $FramesPerSecond; actualDurationMs = $clock.Elapsed.TotalMilliseconds;
    width = $area[2]; height = $area[3]; frames = @($frames.ToArray());
    note = 'Real screen pixels over a separate synthetic WinForms application; no audio. Every frame was guarded before and after capture. Capture cadence is not renderer performance.' }
[IO.File]::WriteAllText((Join-Path $out 'recording.json'), ($manifest | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))
if (-not $complete) { throw "Recording stopped; no frame was saved after this failure: $failure" }
if ($frames.Count -lt 2) { throw 'Not enough frames to encode.' }

# Actual capture timestamps preserve elapsed timing even if capture is slower
# than the requested cadence. This is never used as a frame-rate benchmark.
$concat = New-Object Text.StringBuilder
for ($i = 0; $i -lt $frames.Count; $i++) {
    [void]$concat.AppendLine("file '$($frames[$i].file)'")
    $duration = if ($i + 1 -lt $frames.Count) { ($frames[$i + 1].elapsedMs - $frames[$i].elapsedMs) / 1000.0 } else { 1.0 / $FramesPerSecond }
    [void]$concat.AppendLine('duration ' + $duration.ToString('F6', [Globalization.CultureInfo]::InvariantCulture))
}
[void]$concat.AppendLine("file '$($frames[$frames.Count - 1].file)'")
$concatPath = Join-Path $out 'frames.txt'
[IO.File]::WriteAllText($concatPath, $concat.ToString(), (New-Object Text.UTF8Encoding($false)))
$video = Join-Path $out 'native-demo.mp4'
$ffmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source
& $ffmpeg -hide_banner -loglevel error -f concat -safe 1 -i $concatPath -fps_mode vfr -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart $video
if ($LASTEXITCODE -ne 0) { throw 'Video encoding failed; guarded source frames are preserved.' }
@{ event = 'recording-complete'; frames = $frames.Count; video = $video; elapsedMs = $clock.Elapsed.TotalMilliseconds } | ConvertTo-Json -Compress
