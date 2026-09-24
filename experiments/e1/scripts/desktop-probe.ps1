[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [int]$FixtureProcessId,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$StatePath,

    [ValidateSet('Click', 'Drag', 'Capture')]
    [string]$Action = 'Click',

    [int]$E1ProcessId,
    [ValidateSet('light', 'dark', 'busy-neutral')]
    [string]$FixtureMode,

    [Nullable[int]]$X,
    [Nullable[int]]$Y,
    [Nullable[int]]$StartX,
    [Nullable[int]]$StartY,
    [Nullable[int]]$EndX,
    [Nullable[int]]$EndY,

    # This is intentionally opt-in. The path must be caller-supplied scratch.
    [string]$ScreenshotPath,
    [string]$TracePath,

    # These operations affect only the already validated fixture/E1 windows.
    [switch]$BringFixtureToFront,
    [switch]$PrepareFixture,
    [switch]$DisableFixtureTopMost,
    [int]$RaiseE1ProcessId,
    [switch]$EscapeFixture
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$fixtureTitle = 'E1 Synthetic Desktop Fixture'
$e1ExecutableSuffix = '\experiments\e1\src-tauri\target\debug\eva-e1.exe'

function Resolve-ExistingStatePath {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw 'StatePath is required; provide the fixture state file under the caller-owned scratch directory.'
    }
    $fullPath = [System.IO.Path]::GetFullPath($Path)
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
        throw "StatePath does not exist: $fullPath"
    }
    return $fullPath
}

function Resolve-ScratchOutputPath {
    param(
        [string]$Path,
        [string]$Label,
        [switch]$RequirePng
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "$Label must be a caller-supplied file under the scratch directory."
    }
    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $parent = [System.IO.Path]::GetDirectoryName($fullPath)
    if ([string]::IsNullOrWhiteSpace($parent) -or -not (Test-Path -LiteralPath $parent -PathType Container)) {
        throw "$Label parent does not exist: $parent"
    }
    if (Test-Path -LiteralPath $fullPath -PathType Container) {
        throw "$Label must be a file, not a directory: $fullPath"
    }
    if ($RequirePng -and -not [string]::Equals([System.IO.Path]::GetExtension($fullPath), '.png', [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "$Label must use a .png extension: $fullPath"
    }
    return $fullPath
}

$resolvedStatePath = Resolve-ExistingStatePath -Path $StatePath
$resolvedScreenshotPath = $null
$resolvedTracePath = $null
if (-not [string]::IsNullOrWhiteSpace($ScreenshotPath)) {
    $resolvedScreenshotPath = Resolve-ScratchOutputPath -Path $ScreenshotPath -Label 'ScreenshotPath' -RequirePng
}
if (-not [string]::IsNullOrWhiteSpace($TracePath)) {
    $resolvedTracePath = Resolve-ScratchOutputPath -Path $TracePath -Label 'TracePath'
}

if ($FixtureProcessId -le 0) {
    throw 'FixtureProcessId must be a positive process id.'
}
if ($RaiseE1ProcessId -lt 0) {
    throw 'RaiseE1ProcessId must be zero or a positive process id.'
}
if ($RaiseE1ProcessId -eq $FixtureProcessId) {
    throw 'RaiseE1ProcessId must identify the E1 debug process, not the fixture.'
}

if ($EscapeFixture) {
    if ($null -ne $X -or $null -ne $Y -or $null -ne $StartX -or $null -ne $StartY -or $null -ne $EndX -or $null -ne $EndY) {
        throw 'EscapeFixture is a standalone targeted operation; do not combine it with mouse coordinates.'
    }
}
elseif ($Action -eq 'Click') {
    if ($null -eq $X -or $null -eq $Y) {
        throw 'Click requires -X and -Y screen coordinates.'
    }
    if ($null -ne $StartX -or $null -ne $StartY -or $null -ne $EndX -or $null -ne $EndY) {
        throw 'Click accepts only -X and -Y.'
    }
}
elseif ($Action -eq 'Capture') {
    if ($null -ne $X -or $null -ne $Y -or $null -ne $StartX -or $null -ne $StartY -or $null -ne $EndX -or $null -ne $EndY) {
        throw 'Capture accepts no mouse coordinates.'
    }
}
else {
    if ($null -eq $StartX -or $null -eq $StartY -or $null -eq $EndX -or $null -eq $EndY) {
        throw 'Drag requires -StartX, -StartY, -EndX, and -EndY screen coordinates.'
    }
    if ($null -ne $X -or $null -ne $Y) {
        throw 'Drag accepts only the start and end coordinate pairs.'
    }
}

$source = @"
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

public static class E1DesktopProbeNative
{
    public static int AllowedE1ProcessId;
    private const int GWL_EXSTYLE = -20;
    private const long WS_EX_TOPMOST = 0x00000008L;
    private const int GA_ROOT = 2;
    private const int GW_OWNER = 4;
    private const int SW_RESTORE = 9;
    private const int SW_SHOW = 5;
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOACTIVATE = 0x0010;
    private const uint SWP_SHOWWINDOW = 0x0040;
    private const uint WM_KEYDOWN = 0x0100;
    private const uint WM_KEYUP = 0x0101;
    private const uint VK_ESCAPE = 0x1B;
    private const uint MOUSEEVENTF_MOVE = 0x0001;
    private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    private const uint MOUSEEVENTF_LEFTUP = 0x0004;
    private const uint MOUSEEVENTF_ABSOLUTE = 0x8000;
    private const uint MOUSEEVENTF_VIRTUALDESK = 0x4000;
    private const int SM_XVIRTUALSCREEN = 76;
    private const int SM_YVIRTUALSCREEN = 77;
    private const int SM_CXVIRTUALSCREEN = 78;
    private const int SM_CYVIRTUALSCREEN = 79;
    private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    private static readonly IntPtr PerMonitorAwareV2 = new IntPtr(-4);
    private static readonly IntPtr HwndTop = IntPtr.Zero;
    private static readonly IntPtr HwndTopMost = new IntPtr(-1);
    private static readonly IntPtr HwndNoTopMost = new IntPtr(-2);

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativePoint
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MouseInput
    {
        public int Dx;
        public int Dy;
        public uint MouseData;
        public uint Flags;
        public uint Time;
        public UIntPtr ExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Input
    {
        public uint Type;
        public MouseInput Mouse;
    }

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out int value, int size);

    [DllImport("user32.dll")]
    private static extern IntPtr WindowFromPoint(NativePoint point);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr GetWindow(IntPtr hWnd, uint command);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr hWnd, StringBuilder name, int count);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetClientRect(IntPtr hWnd, out NativeRect rect);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetWindowRect(IntPtr hWnd, out NativeRect rect);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool ClientToScreen(IntPtr hWnd, ref NativePoint point);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool ScreenToClient(IntPtr hWnd, ref NativePoint point);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool ShowWindow(IntPtr hWnd, int command);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool PostMessage(IntPtr hWnd, uint message, UIntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint inputCount, Input[] inputs, int inputSize);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern int GetSystemMetrics(int index);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr", SetLastError = true)]
    private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int index);

    [DllImport("user32.dll", EntryPoint = "GetWindowLong", SetLastError = true)]
    private static extern IntPtr GetWindowLong32(IntPtr hWnd, int index);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inheritHandle, int processId);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder filename, ref int size);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    public static void SetPerMonitorDpiAwareness()
    {
        IntPtr previous = SetThreadDpiAwarenessContext(PerMonitorAwareV2);
        if (previous == IntPtr.Zero)
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "SetThreadDpiAwarenessContext failed.");
        }
    }

    public static string GetWindowTitle(IntPtr hWnd)
    {
        if (!IsWindow(hWnd)) return String.Empty;
        int length = GetWindowTextLength(hWnd);
        StringBuilder builder = new StringBuilder(Math.Max(256, length + 1));
        GetWindowText(hWnd, builder, builder.Capacity);
        return builder.ToString();
    }

    public static int GetWindowProcessId(IntPtr hWnd)
    {
        uint processId;
        if (GetWindowThreadProcessId(hWnd, out processId) == 0) return 0;
        return unchecked((int)processId);
    }

    public static bool IsVisibleTopLevelWindow(IntPtr hWnd)
    {
        return IsWindow(hWnd) && IsWindowVisible(hWnd) && GetAncestor(hWnd, GA_ROOT) == hWnd && GetWindow(hWnd, GW_OWNER) == IntPtr.Zero;
    }

    public static bool IsTopMost(IntPtr hWnd)
    {
        IntPtr style = IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, GWL_EXSTYLE) : GetWindowLong32(hWnd, GWL_EXSTYLE);
        long styleValue = style.ToInt64();
        return (styleValue & WS_EX_TOPMOST) != 0;
    }

    public static int[] GetClientScreenRect(IntPtr hWnd)
    {
        NativeRect client;
        if (!GetClientRect(hWnd, out client)) throw LastError("GetClientRect");
        if (client.Right <= client.Left || client.Bottom <= client.Top) throw new InvalidOperationException("The fixture client area is empty.");
        NativePoint topLeft = new NativePoint { X = client.Left, Y = client.Top };
        NativePoint bottomRight = new NativePoint { X = client.Right - 1, Y = client.Bottom - 1 };
        if (!ClientToScreen(hWnd, ref topLeft) || !ClientToScreen(hWnd, ref bottomRight)) throw LastError("ClientToScreen");
        return new[] { topLeft.X, topLeft.Y, bottomRight.X - topLeft.X + 1, bottomRight.Y - topLeft.Y + 1 };
    }

    public static int[] GetWindowRectValues(IntPtr hWnd)
    {
        NativeRect rect;
        if (!GetWindowRect(hWnd, out rect)) throw LastError("GetWindowRect");
        return new[] { rect.Left, rect.Top, rect.Right, rect.Bottom };
    }

    public static int[] GetPrimaryWorkingArea()
    {
        Rectangle rect = Screen.PrimaryScreen.WorkingArea;
        return new[] { rect.Left, rect.Top, rect.Width, rect.Height };
    }

    public static bool IsPointInClientArea(IntPtr hWnd, int screenX, int screenY)
    {
        NativeRect client;
        if (!GetClientRect(hWnd, out client)) return false;
        NativePoint point = new NativePoint { X = screenX, Y = screenY };
        if (!ScreenToClient(hWnd, ref point)) return false;
        return point.X >= client.Left && point.Y >= client.Top && point.X < client.Right && point.Y < client.Bottom;
    }

    public static void DisableTopMost(IntPtr hWnd)
    {
        if (!SetWindowPos(hWnd, HwndNoTopMost, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW | SWP_NOACTIVATE)) throw LastError("SetWindowPos(HWND_NOTOPMOST)");
    }

    public static void BringWindowToFront(IntPtr hWnd)
    {
        ShowWindow(hWnd, SW_RESTORE);
        if (!SetWindowPos(hWnd, HwndTop, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW | SWP_NOACTIVATE)) throw LastError("SetWindowPos(HWND_TOP)");
        // Raise the owned backdrop without trying to bypass Windows' foreground lock.
    }

    public static void PrepareFixtureForInput(int expectedProcessId, IntPtr hWnd, string expectedTitle)
    {
        ValidateTarget(expectedProcessId, hWnd, expectedTitle);
        ShowWindow(hWnd, SW_RESTORE);
        if (!SetWindowPos(hWnd, HwndTopMost, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW | SWP_NOACTIVATE)) throw LastError("Prepare synthetic fixture");
        try
        {
            int[] area = GetClientScreenRect(hWnd);
            // Activate through a real click on the now-visible owned backdrop,
            // not an AttachThreadInput or foreground-lock workaround.
            SendClick(expectedProcessId, hWnd, expectedTitle, area[0] + 8, area[1] + 8);
            for (int attempt = 0; attempt < 20 && GetForegroundWindow() != hWnd; attempt++)
                System.Threading.Thread.Sleep(10);
        }
        finally
        {
            DisableTopMost(hWnd);
        }
        if (GetForegroundWindow() != hWnd) throw new InvalidOperationException("Please activate the synthetic fixture manually; no capture was made.");
    }

    public static void RaiseWindowTopMost(IntPtr hWnd)
    {
        ShowWindow(hWnd, SW_SHOW);
        if (!SetWindowPos(hWnd, HwndTopMost, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW)) throw LastError("SetWindowPos(HWND_TOPMOST)");
        if (!SetForegroundWindow(hWnd)) throw LastError("SetForegroundWindow");
    }

    public static void PostEscape(int expectedProcessId, IntPtr hWnd, string expectedTitle)
    {
        ValidateTarget(expectedProcessId, hWnd, expectedTitle);
        IntPtr keyDownLParam = new IntPtr(0x00010001);
        IntPtr keyUpLParam = new IntPtr(unchecked((int)0xC0010001));
        if (!PostMessage(hWnd, WM_KEYDOWN, new UIntPtr(VK_ESCAPE), keyDownLParam)) throw LastError("PostMessage(WM_KEYDOWN, Escape)");
        if (!PostMessage(hWnd, WM_KEYUP, new UIntPtr(VK_ESCAPE), keyUpLParam)) throw LastError("PostMessage(WM_KEYUP, Escape)");
    }

    public static void PostMode(int expectedProcessId, IntPtr hWnd, string expectedTitle, string mode)
    {
        ValidateTarget(expectedProcessId, hWnd, expectedTitle);
        uint key = mode == "light" ? 0x4Cu : mode == "dark" ? 0x44u : 0x42u;
        if (!PostMessage(hWnd, WM_KEYDOWN, new UIntPtr(key), new IntPtr(1))) throw LastError("PostMessage(mode)");
        if (!PostMessage(hWnd, WM_KEYUP, new UIntPtr(key), new IntPtr(unchecked((int)0xC0000001)))) throw LastError("PostMessage(mode release)");
    }

    public static void SendClick(int expectedProcessId, IntPtr hWnd, string expectedTitle, int x, int y)
    {
        ValidateTarget(expectedProcessId, hWnd, expectedTitle);
        ValidatePoint(hWnd, x, y);
        Input[] inputs = new[]
        {
            MakeMouseInput(x, y, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK),
            MakeMouseInput(x, y, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK | MOUSEEVENTF_LEFTDOWN),
            MakeMouseInput(x, y, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK | MOUSEEVENTF_LEFTUP)
        };
        SendInputOrThrow(inputs);
    }

    public static void SendDrag(int expectedProcessId, IntPtr hWnd, string expectedTitle, int startX, int startY, int endX, int endY)
    {
        ValidateTarget(expectedProcessId, hWnd, expectedTitle);
        ValidatePoint(hWnd, startX, startY);
        ValidatePoint(hWnd, endX, endY);

        const int movementSteps = 12;
        int currentX = startX, currentY = startY;
        SendInputOrThrow(new[] {
            MakeMouseInput(startX, startY, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK),
            MakeMouseInput(startX, startY, MOUSEEVENTF_LEFTDOWN)
        });
        try
        {
            for (int index = 1; index <= movementSteps; index++)
            {
                // A bounded gesture cadence lets the WebView establish pointer capture.
                System.Threading.Thread.Sleep(16);
                int x = startX + (int)Math.Round((endX - startX) * index / (double)movementSteps);
                int y = startY + (int)Math.Round((endY - startY) * index / (double)movementSteps);
                ValidateTarget(expectedProcessId, hWnd, expectedTitle);
                ValidatePoint(hWnd, x, y);
                currentX = x; currentY = y;
                SendInputOrThrow(new[] { MakeMouseInput(x, y, MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK) });
            }
        }
        finally
        {
            SendInputOrThrow(new[] { MakeMouseInput(currentX, currentY, MOUSEEVENTF_LEFTUP) });
        }
    }

    public static string GetProcessImagePath(int processId)
    {
        IntPtr process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, processId);
        if (process == IntPtr.Zero) return String.Empty;
        try
        {
            StringBuilder path = new StringBuilder(32768);
            int length = path.Capacity;
            if (!QueryFullProcessImageName(process, 0, path, ref length)) return String.Empty;
            return path.ToString();
        }
        finally
        {
            CloseHandle(process);
        }
    }

    public static IntPtr[] GetVisibleWindowsForProcess(int processId)
    {
        List<IntPtr> windows = new List<IntPtr>();
        EnumWindowsProc callback = delegate(IntPtr hWnd, IntPtr lParam)
        {
            if (GetWindowProcessId(hWnd) == processId && IsVisibleTopLevelWindow(hWnd))
            {
                windows.Add(hWnd);
            }
            return true;
        };
        EnumWindows(callback, IntPtr.Zero);
        return windows.ToArray();
    }

    public static IntPtr[] RaiseVisibleWindowsForProcess(int processId)
    {
        IntPtr[] windows = GetVisibleWindowsForProcess(processId);
        if (windows.Length == 0) return windows;
        for (int index = 0; index < windows.Length; index++)
        {
            IntPtr hWnd = windows[index];
            ShowWindow(hWnd, SW_SHOW);
            if (!SetWindowPos(hWnd, HwndTopMost, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW)) throw LastError("SetWindowPos(HWND_TOPMOST)");
        }
        if (!SetForegroundWindow(windows[0])) throw LastError("SetForegroundWindow");
        return windows;
    }

    private static void ValidateTarget(int expectedProcessId, IntPtr hWnd, string expectedTitle)
    {
        if (!IsVisibleTopLevelWindow(hWnd)) throw new InvalidOperationException("Fixture window is not a visible top-level window.");
        if (GetWindowProcessId(hWnd) != expectedProcessId) throw new InvalidOperationException("Fixture window no longer belongs to the supplied process id.");
        if (!String.Equals(GetWindowTitle(hWnd), expectedTitle, StringComparison.Ordinal)) throw new InvalidOperationException("Fixture window title no longer matches exactly.");
    }

    private static void ValidatePoint(IntPtr hWnd, int x, int y)
    {
        if (!IsPointInClientArea(hWnd, x, y)) throw new ArgumentOutOfRangeException("screenPoint", "The supplied screen coordinate is outside the fixture client area.");
        IntPtr hit = WindowFromPoint(new NativePoint { X = x, Y = y });
        int owner = GetWindowProcessId(GetAncestor(hit, GA_ROOT));
        if (owner <= 0 || (owner != GetWindowProcessId(hWnd) && owner != AllowedE1ProcessId))
            throw new InvalidOperationException("An unrelated window covers this test point; no input was sent.");
    }

    private static bool IsCloaked(IntPtr window)
    {
        int cloaked;
        return DwmGetWindowAttribute(window, 14, out cloaked, 4) == 0 && cloaked != 0;
    }

    public static void ValidateCaptureSurface(IntPtr fixture)
    {
        int[] area = GetClientScreenRect(fixture);
        IntPtr above = GetWindow(fixture, 3); // GW_HWNDPREV: inspect z-order metadata, never window contents.
        int remaining = 512;
        while (above != IntPtr.Zero && remaining-- > 0)
        {
            if (IsWindowVisible(above) && !IsCloaked(above) && GetWindowProcessId(above) != AllowedE1ProcessId && GetWindowProcessId(above) != GetWindowProcessId(fixture))
            {
                int[] r = GetWindowRectValues(above);
                if (r[0] < area[0] + area[2] && r[2] > area[0] && r[1] < area[1] + area[3] && r[3] > area[1])
                {
                    StringBuilder className = new StringBuilder(256);
                    GetClassName(above, className, className.Capacity);
                    throw new InvalidOperationException("Capture refused: overlapping window class=" + className + ", bounds=" + String.Join(",", r) + ". No contents or title inspected.");
                }
            }
            above = GetWindow(above, 3);
        }
        if (remaining <= 0) throw new InvalidOperationException("Unexpected window enumeration depth; capture refused.");
    }

    private static Input MakeMouseInput(int x, int y, uint flags)
    {
        int virtualLeft = GetSystemMetrics(SM_XVIRTUALSCREEN);
        int virtualTop = GetSystemMetrics(SM_YVIRTUALSCREEN);
        int virtualWidth = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        int virtualHeight = GetSystemMetrics(SM_CYVIRTUALSCREEN);
        if (virtualWidth <= 1 || virtualHeight <= 1) throw new InvalidOperationException("The virtual desktop bounds are invalid.");
        long normalizedX = ((long)x - virtualLeft) * 65535L / (virtualWidth - 1);
        long normalizedY = ((long)y - virtualTop) * 65535L / (virtualHeight - 1);
        normalizedX = Math.Max(0L, Math.Min(65535L, normalizedX));
        normalizedY = Math.Max(0L, Math.Min(65535L, normalizedY));
        return new Input
        {
            Type = 0,
            Mouse = new MouseInput
            {
                Dx = (int)normalizedX,
                Dy = (int)normalizedY,
                MouseData = 0,
                Flags = flags,
                Time = 0,
                ExtraInfo = UIntPtr.Zero
            }
        };
    }

    private static void SendInputOrThrow(Input[] inputs)
    {
        uint sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(Input)));
        if (sent != inputs.Length) throw LastError("SendInput");
    }

    private static Exception LastError(string operation)
    {
        return new Win32Exception(Marshal.GetLastWin32Error(), operation + " failed.");
    }
}
"@

Add-Type -TypeDefinition $source -Language CSharp -ReferencedAssemblies @('System.Drawing.dll', 'System.Windows.Forms.dll')
[E1DesktopProbeNative]::SetPerMonitorDpiAwareness()

function Write-BoundedTrace {
    param(
        [string]$Path,
        [hashtable]$Payload
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return
    }
    $json = $Payload | ConvertTo-Json -Compress -Depth 6
    [System.IO.File]::WriteAllText($Path, $json, (New-Object -TypeName System.Text.UTF8Encoding -ArgumentList @($false)))
}

try {
    $stateJson = Get-Content -LiteralPath $resolvedStatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($null -eq $stateJson -or [int]$stateJson.schemaVersion -ne 1) {
        throw 'StatePath does not contain the expected synthetic fixture state schema.'
    }
    if ([string]$stateJson.title -cne $fixtureTitle) {
        throw 'StatePath title does not exactly identify E1 Synthetic Desktop Fixture.'
    }
    if ([int]$stateJson.processId -ne $FixtureProcessId) {
        throw 'StatePath process id does not match -FixtureProcessId.'
    }

    $fixtureProcess = Get-Process -Id $FixtureProcessId -ErrorAction Stop
    $fixtureProcess.Refresh()
    if ([string]$fixtureProcess.MainWindowTitle -cne $fixtureTitle) {
        throw "Fixture MainWindowTitle is not the exact required title: '$($fixtureProcess.MainWindowTitle)'"
    }

    $fixtureHandle = [IntPtr]([int64]$stateJson.windowHandle)
    if ($fixtureHandle -eq [IntPtr]::Zero) {
        throw 'StatePath has no usable fixture window handle.'
    }
    if (-not [E1DesktopProbeNative]::IsVisibleTopLevelWindow($fixtureHandle)) {
        throw 'Fixture window is not a visible top-level window.'
    }
    if ([E1DesktopProbeNative]::GetWindowProcessId($fixtureHandle) -ne $FixtureProcessId) {
        throw 'Fixture window handle does not belong to -FixtureProcessId.'
    }
    if ([E1DesktopProbeNative]::GetWindowTitle($fixtureHandle) -cne $fixtureTitle) {
        throw 'Fixture HWND title does not exactly match E1 Synthetic Desktop Fixture.'
    }

    $wasTopMost = [E1DesktopProbeNative]::IsTopMost($fixtureHandle)
    $topMostAtStart = $wasTopMost
    if ($wasTopMost -and -not $DisableFixtureTopMost -and -not $EscapeFixture) {
        throw 'Fixture is TopMost. Restart it without -TopMost or pass -DisableFixtureTopMost before an overlay probe.'
    }
    if ($DisableFixtureTopMost) {
        [E1DesktopProbeNative]::DisableTopMost($fixtureHandle)
        $wasTopMost = $false
    }

    if ($PrepareFixture) {
        [E1DesktopProbeNative]::PrepareFixtureForInput($FixtureProcessId, $fixtureHandle, $fixtureTitle)
    }
    if ($BringFixtureToFront) {
        [E1DesktopProbeNative]::BringWindowToFront($fixtureHandle)
    }

    $raisedE1Handles = @()
    if ($RaiseE1ProcessId -gt 0) {
        $e1Path = [E1DesktopProbeNative]::GetProcessImagePath($RaiseE1ProcessId)
        if ([string]::IsNullOrWhiteSpace($e1Path)) {
            throw "Could not read the E1 process image path for process id $RaiseE1ProcessId."
        }
        $normalizedE1Path = $e1Path.Replace('/', '\')
        if (-not $normalizedE1Path.EndsWith($e1ExecutableSuffix, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to raise process $RaiseE1ProcessId because its executable path is not the E1 debug binary: $e1Path"
        }
        $raisedE1Handles = [E1DesktopProbeNative]::RaiseVisibleWindowsForProcess($RaiseE1ProcessId)
        if ($raisedE1Handles.Count -eq 0) {
            throw "No visible top-level E1 debug windows were found for process id $RaiseE1ProcessId."
        }
    }

    if ($E1ProcessId -gt 0) {
        $targetPath = [E1DesktopProbeNative]::GetProcessImagePath($E1ProcessId)
        if (-not $targetPath.Replace('/', '\').EndsWith($e1ExecutableSuffix, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw 'E1ProcessId is not this experiment debug executable.'
        }
        [E1DesktopProbeNative]::AllowedE1ProcessId = $E1ProcessId
    }
    if (-not [string]::IsNullOrWhiteSpace($FixtureMode)) {
        [E1DesktopProbeNative]::PostMode($FixtureProcessId, $fixtureHandle, $fixtureTitle, $FixtureMode)
        $modeReady = $false
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            $currentState = Get-Content -LiteralPath $resolvedStatePath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($currentState.mode -eq $FixtureMode) { $modeReady = $true; break }
            [System.Threading.Thread]::Sleep(25)
        }
        if (-not $modeReady) { throw 'Synthetic background did not acknowledge the requested mode.' }
    }

    $operation = 'none'
    $operationResult = 'validated'
    $sentPoint = $null
    if ($EscapeFixture) {
        [E1DesktopProbeNative]::PostEscape($FixtureProcessId, $fixtureHandle, $fixtureTitle)
        $operation = 'escape-fixture'
    }
    elseif ($Action -eq 'Click') {
        $operation = 'click'
        $sentPoint = [ordered]@{ x = [int]$X; y = [int]$Y }
        # Native code repeats the title, ownership, visibility, and client-area checks
        # immediately before SendInput. No DOM/CDP path is used.
        [E1DesktopProbeNative]::SendClick($FixtureProcessId, $fixtureHandle, $fixtureTitle, [int]$X, [int]$Y)
    }
    elseif ($Action -eq 'Drag') {
        $operation = 'drag'
        $sentPoint = [ordered]@{
            start = [ordered]@{ x = [int]$StartX; y = [int]$StartY }
            end = [ordered]@{ x = [int]$EndX; y = [int]$EndY }
        }
        [E1DesktopProbeNative]::SendDrag($FixtureProcessId, $fixtureHandle, $fixtureTitle, [int]$StartX, [int]$StartY, [int]$EndX, [int]$EndY)
    }
    else { $operation = 'capture-only' }
    $operationResult = if ($Action -eq 'Capture') { 'validated' } else { 'sent' }

    $captureInfo = $null
    if ($null -ne $resolvedScreenshotPath) {
        $windowRect = [E1DesktopProbeNative]::GetWindowRectValues($fixtureHandle)
        $workArea = [E1DesktopProbeNative]::GetPrimaryWorkingArea()
        $windowWidth = $windowRect[2] - $windowRect[0]
        $windowHeight = $windowRect[3] - $windowRect[1]
        if ($windowRect[0] -ne $workArea[0] -or $windowRect[1] -ne $workArea[1] -or $windowWidth -ne $workArea[2] -or $windowHeight -ne $workArea[3]) {
            throw 'Refusing screenshot: fixture window is not exactly the primary work-area rectangle.'
        }

        [E1DesktopProbeNative]::ValidateCaptureSurface($fixtureHandle)
        $bitmap = New-Object -TypeName System.Drawing.Bitmap -ArgumentList @([int]$workArea[2], [int]$workArea[3], [System.Drawing.Imaging.PixelFormat]::Format32bppPArgb)
        $graphics = $null
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            $graphics.CopyFromScreen($workArea[0], $workArea[1], 0, 0, $bitmap.Size, [System.Drawing.CopyPixelOperation]::SourceCopy)
            [E1DesktopProbeNative]::ValidateCaptureSurface($fixtureHandle)
            $bitmap.Save($resolvedScreenshotPath, [System.Drawing.Imaging.ImageFormat]::Png)
        }
        finally {
            if ($null -ne $graphics) { $graphics.Dispose() }
            if ($null -ne $bitmap) { $bitmap.Dispose() }
        }
        $captureInfo = [ordered]@{
            path = $resolvedScreenshotPath
            left = $workArea[0]
            top = $workArea[1]
            width = $workArea[2]
            height = $workArea[3]
            format = 'png'
            explicitOptIn = $true
        }
    }

    $trace = @{
        schemaVersion = 1
        timestampUtc = [DateTime]::UtcNow.ToString('o')
        operation = $operation
        result = $operationResult
        fixtureProcessId = $FixtureProcessId
        fixtureTitle = $fixtureTitle
        statePath = $resolvedStatePath
        topMostBeforeProbe = $topMostAtStart
        disabledFixtureTopMost = [bool]$DisableFixtureTopMost
        raisedE1ProcessId = $RaiseE1ProcessId
        point = $sentPoint
        screenshot = $captureInfo
    }
    Write-BoundedTrace -Path $resolvedTracePath -Payload $trace

    [ordered]@{
        ok = $true
        operation = $operation
        fixtureProcessId = $FixtureProcessId
        fixtureTitle = $fixtureTitle
        fixtureWindowHandle = $fixtureHandle.ToInt64()
        preparationClick = [bool]$PrepareFixture
        inputMethod = if ($EscapeFixture) { 'targeted WM_KEYDOWN/WM_KEYUP Escape' } elseif ($Action -eq 'Capture') { if ($PrepareFixture) { 'Win32 SendInput (fixture preparation only)' } else { 'none' } } else { 'Win32 SendInput' }
        point = $sentPoint
        screenshot = $captureInfo
        tracePath = $resolvedTracePath
    } | ConvertTo-Json -Compress -Depth 8 | Write-Output
}
catch {
    throw
}
