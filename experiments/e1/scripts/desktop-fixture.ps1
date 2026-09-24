[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$StatePath,

    [ValidateSet('light', 'dark', 'busy-neutral')]
    [string]$Mode = 'light',

    # The normal fixture is an ordinary underlying window. Use -TopMost only while
    # preparing a controlled backdrop, and disable it before an overlay probe.
    [switch]$TopMost
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Resolve-StatePath {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw 'StatePath is required; provide a file under the caller-owned scratch directory.'
    }

    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $parent = [System.IO.Path]::GetDirectoryName($fullPath)
    if ([string]::IsNullOrWhiteSpace($parent) -or -not (Test-Path -LiteralPath $parent -PathType Container)) {
        throw "StatePath parent does not exist: $parent"
    }
    if (Test-Path -LiteralPath $fullPath -PathType Container) {
        throw "StatePath must be a file, not a directory: $fullPath"
    }
    return $fullPath
}

$resolvedStatePath = Resolve-StatePath -Path $StatePath

$source = @"
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

public sealed class E1SyntheticFixtureForm : Form
{
    private const string FixtureTitle = "E1 Synthetic Desktop Fixture";
    private readonly string statePath;
    private readonly bool requestedTopMost;
    private string mode;
    private int mouseDownCount;
    private int clickCount;
    private int keyDownCount;
    private int lastClientX = -1;
    private int lastClientY = -1;
    private int lastScreenX = -1;
    private int lastScreenY = -1;
    private int lastClickClientX = -1;
    private int lastClickClientY = -1;
    private string lastButton = "none";
    private string lastKey = "none";
    private string lastEventUtc = "never";
    private long stateVersion;
    private readonly object stateLock = new object();

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);

    private static readonly IntPtr PerMonitorAwareV2 = new IntPtr(-4);

    public static void SetPerMonitorDpiAwareness()
    {
        IntPtr previous = SetThreadDpiAwarenessContext(PerMonitorAwareV2);
        if (previous == IntPtr.Zero)
        {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "SetThreadDpiAwarenessContext failed.");
        }
    }

    public E1SyntheticFixtureForm(string requestedStatePath, string initialMode, bool topMost)
    {
        statePath = requestedStatePath;
        requestedTopMost = topMost;
        mode = NormalizeMode(initialMode);

        Text = FixtureTitle;
        Name = "E1SyntheticDesktopFixture";
        AccessibleName = FixtureTitle;
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        ShowInTaskbar = true;
        MaximizeBox = false;
        MinimizeBox = true;
        KeyPreview = true;
        TabStop = true;
        AutoScaleMode = AutoScaleMode.Dpi;
        TopMost = topMost;
        BackColor = Color.FromArgb(238, 233, 222);
        DoubleBuffered = true;
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);

        Load += delegate { SetWorkAreaBounds(); WriteState(); };
        Shown += delegate
        {
            // Activate only this fixture at startup. No global hook or input capture is installed.
            BringToFront();
            Activate();
            Focus();
            WriteState();
        };
        Resize += delegate { WriteState(); Invalidate(); };
        Move += delegate { WriteState(); Invalidate(); };
        FormClosing += delegate { WriteState(); };
    }

    public string WindowTitle { get { return FixtureTitle; } }
    public string CurrentMode { get { return mode; } }
    public int CurrentProcessId { get { return Process.GetCurrentProcess().Id; } }
    public long CurrentWindowHandle { get { return IsHandleCreated ? Handle.ToInt64() : 0L; } }
    public Rectangle CurrentBounds { get { return Bounds; } }
    public bool RequestedTopMost { get { return requestedTopMost; } }

    private void SetWorkAreaBounds()
    {
        Rectangle workArea = Screen.PrimaryScreen.WorkingArea;
        Bounds = workArea;
    }

    private static string NormalizeMode(string value)
    {
        if (String.Equals(value, "dark", StringComparison.OrdinalIgnoreCase)) return "dark";
        if (String.Equals(value, "busy-neutral", StringComparison.OrdinalIgnoreCase)) return "busy-neutral";
        return "light";
    }

    private void SetMode(string nextMode)
    {
        string normalized = NormalizeMode(nextMode);
        if (!String.Equals(mode, normalized, StringComparison.Ordinal))
        {
            mode = normalized;
            lastEventUtc = DateTime.UtcNow.ToString("o");
            WriteState();
            Invalidate();
        }
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        mouseDownCount++;
        Point screenPoint = PointToScreen(e.Location);
        lastClientX = e.X;
        lastClientY = e.Y;
        lastScreenX = screenPoint.X;
        lastScreenY = screenPoint.Y;
        lastButton = e.Button.ToString();
        lastEventUtc = DateTime.UtcNow.ToString("o");
        WriteState();
        Invalidate();
        base.OnMouseDown(e);
    }

    protected override void OnMouseClick(MouseEventArgs e)
    {
        clickCount++;
        lastClickClientX = e.X;
        lastClickClientY = e.Y;
        lastEventUtc = DateTime.UtcNow.ToString("o");
        WriteState();
        Invalidate();
        base.OnMouseClick(e);
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        keyDownCount++;
        lastKey = e.KeyCode.ToString();
        lastEventUtc = DateTime.UtcNow.ToString("o");

        if (e.KeyCode == Keys.Escape)
        {
            WriteState();
            e.Handled = true;
            e.SuppressKeyPress = true;
            Close();
            return;
        }
        if (e.KeyCode == Keys.L || e.KeyCode == Keys.D || e.KeyCode == Keys.B)
        {
            if (e.KeyCode == Keys.L) SetMode("light");
            if (e.KeyCode == Keys.D) SetMode("dark");
            if (e.KeyCode == Keys.B) SetMode("busy-neutral");
            e.Handled = true;
            e.SuppressKeyPress = true;
        }
        else
        {
            WriteState();
        }
        Invalidate();
        base.OnKeyDown(e);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        Graphics g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

        Color background;
        Color ink;
        Color muted;
        Color accent;
        if (mode == "dark")
        {
            background = Color.FromArgb(24, 28, 35);
            ink = Color.FromArgb(238, 241, 244);
            muted = Color.FromArgb(158, 169, 181);
            accent = Color.FromArgb(111, 197, 180);
        }
        else if (mode == "busy-neutral")
        {
            background = Color.FromArgb(118, 119, 116);
            ink = Color.FromArgb(247, 244, 234);
            muted = Color.FromArgb(219, 216, 204);
            accent = Color.FromArgb(235, 194, 112);
        }
        else
        {
            background = Color.FromArgb(238, 233, 222);
            ink = Color.FromArgb(28, 35, 42);
            muted = Color.FromArgb(91, 102, 108);
            accent = Color.FromArgb(32, 126, 113);
        }

        using (SolidBrush backgroundBrush = new SolidBrush(background))
        {
            g.FillRectangle(backgroundBrush, ClientRectangle);
        }

        using (Pen gridPen = new Pen(Color.FromArgb(mode == "dark" ? 42 : 205, mode == "dark" ? 49 : 198, mode == "dark" ? 57 : 188), 1.0f))
        {
            for (int x = 0; x < ClientSize.Width; x += 48) g.DrawLine(gridPen, x, 0, x, ClientSize.Height);
            for (int y = 0; y < ClientSize.Height; y += 48) g.DrawLine(gridPen, 0, y, ClientSize.Width, y);
        }

        int margin = Math.Max(24, Math.Min(ClientSize.Width, ClientSize.Height) / 24);
        int headerHeight = Math.Max(94, ClientSize.Height / 8);
        using (SolidBrush headerBrush = new SolidBrush(Color.FromArgb(mode == "dark" ? 190 : 226, background)))
        {
            g.FillRectangle(headerBrush, margin, margin, ClientSize.Width - (margin * 2), headerHeight);
        }
        using (Pen accentPen = new Pen(accent, 5.0f))
        {
            g.DrawLine(accentPen, margin, margin + headerHeight, ClientSize.Width - margin, margin + headerHeight);
        }

        using (Font titleFont = new Font("Segoe UI", Math.Max(16, ClientSize.Height / 31), FontStyle.Bold, GraphicsUnit.Pixel))
        using (Font labelFont = new Font("Segoe UI", Math.Max(11, ClientSize.Height / 62), FontStyle.Regular, GraphicsUnit.Pixel))
        using (SolidBrush inkBrush = new SolidBrush(ink))
        using (SolidBrush mutedBrush = new SolidBrush(muted))
        {
            g.DrawString("Synthetic desktop test background — not EVA", titleFont, inkBrush, margin + 18, margin + 16);
            g.DrawString("A bounded WinForms surface for transparent-overlay hit testing", labelFont, mutedBrush, margin + 20, margin + 56);
        }

        int top = margin + headerHeight + margin;
        int gap = Math.Max(18, margin / 2);
        int columns = ClientSize.Width >= 1500 ? 4 : 3;
        int rows = 2;
        int cardWidth = Math.Max(160, (ClientSize.Width - (margin * 2) - (gap * (columns - 1))) / columns);
        int cardHeight = Math.Max(120, (ClientSize.Height - top - margin - (gap * (rows - 1)) - 86) / rows);
        for (int row = 0; row < rows; row++)
        {
            for (int col = 0; col < columns; col++)
            {
                int cardX = margin + col * (cardWidth + gap);
                int cardY = top + row * (cardHeight + gap);
                DrawSyntheticCard(g, new Rectangle(cardX, cardY, cardWidth, cardHeight), row, col, ink, muted, accent, background);
            }
        }

        int footerY = ClientSize.Height - margin - 62;
        using (Font footerFont = new Font("Consolas", Math.Max(10, ClientSize.Height / 75), FontStyle.Regular, GraphicsUnit.Pixel))
        using (SolidBrush footerBrush = new SolidBrush(ink))
        using (SolidBrush mutedBrush = new SolidBrush(muted))
        {
            g.DrawString("Keys: L light   D dark   B busy-neutral   Esc close", footerFont, mutedBrush, margin, footerY);
            g.DrawString("Mode: " + mode + "    MouseDown: " + mouseDownCount + "    Click: " + clickCount + "    KeyDown: " + keyDownCount, footerFont, footerBrush, margin, footerY + 24);
        }
    }

    private static void DrawSyntheticCard(Graphics g, Rectangle bounds, int row, int column, Color ink, Color muted, Color accent, Color background)
    {
        Color cardColor = Color.FromArgb(background.R > 180 ? 220 : 205, background.R > 180 ? 249 : 39, background.R > 180 ? 243 : 46, background.R > 180 ? 234 : 55);
        using (SolidBrush cardBrush = new SolidBrush(cardColor)) g.FillRectangle(cardBrush, bounds);
        using (Pen borderPen = new Pen(Color.FromArgb(150, accent), 2.0f)) g.DrawRectangle(borderPen, bounds);
        using (SolidBrush accentBrush = new SolidBrush(Color.FromArgb(190, accent)))
        {
            int circle = Math.Min(bounds.Width, bounds.Height) / 4;
            int cx = bounds.Left + 22 + (column * 13) % Math.Max(1, bounds.Width - circle - 30);
            int cy = bounds.Top + 22 + (row * 17) % Math.Max(1, bounds.Height - circle - 30);
            g.FillEllipse(accentBrush, cx, cy, circle, circle);
        }
        using (Font cardFont = new Font("Segoe UI", Math.Max(12, bounds.Height / 8), FontStyle.Bold, GraphicsUnit.Pixel))
        using (Font smallFont = new Font("Consolas", Math.Max(9, bounds.Height / 14), FontStyle.Regular, GraphicsUnit.Pixel))
        using (SolidBrush inkBrush = new SolidBrush(ink))
        using (SolidBrush mutedBrush = new SolidBrush(muted))
        {
            g.DrawString("SYNTHETIC PANEL " + (row * 4 + column + 1), cardFont, inkBrush, bounds.Left + 22, bounds.Top + bounds.Height / 2);
            g.DrawString("no external content  /  fixture geometry", smallFont, mutedBrush, bounds.Left + 22, bounds.Bottom - 34);
        }
    }

    private static string JsonEscape(string value)
    {
        if (value == null) return "";
        return value.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n");
    }

    private string BuildState()
    {
        Rectangle bounds = Bounds;
        Point clientOrigin = IsHandleCreated ? PointToScreen(Point.Empty) : new Point(bounds.Left, bounds.Top);
        Rectangle client = ClientRectangle;
        stateVersion++;
        return "{" +
            "\"schemaVersion\":1," +
            "\"fixture\":\"synthetic-windows-underlay\"," +
            "\"title\":\"" + JsonEscape(FixtureTitle) + "\"," +
            "\"processId\":" + CurrentProcessId + "," +
            "\"windowHandle\":" + CurrentWindowHandle + "," +
            "\"mode\":\"" + JsonEscape(mode) + "\"," +
            "\"topMost\":" + (TopMost ? "true" : "false") + "," +
            "\"bounds\":{" +
                "\"left\":" + bounds.Left + ",\"top\":" + bounds.Top + ",\"width\":" + bounds.Width + ",\"height\":" + bounds.Height + "}," +
            "\"client\":{" +
                "\"screenLeft\":" + clientOrigin.X + ",\"screenTop\":" + clientOrigin.Y + ",\"width\":" + client.Width + ",\"height\":" + client.Height + "}," +
            "\"mouseDownCount\":" + mouseDownCount + "," +
            "\"clickCount\":" + clickCount + "," +
            "\"keyDownCount\":" + keyDownCount + "," +
            "\"lastClientPoint\":{" +
                "\"x\":" + lastClientX + ",\"y\":" + lastClientY + "}," +
            "\"lastScreenPoint\":{" +
                "\"x\":" + lastScreenX + ",\"y\":" + lastScreenY + "}," +
            "\"lastClickClientPoint\":{" +
                "\"x\":" + lastClickClientX + ",\"y\":" + lastClickClientY + "}," +
            "\"lastButton\":\"" + JsonEscape(lastButton) + "\"," +
            "\"lastKey\":\"" + JsonEscape(lastKey) + "\"," +
            "\"lastEventUtc\":\"" + JsonEscape(lastEventUtc) + "\"," +
            "\"stateVersion\":" + stateVersion +
            "}";
    }

    private void WriteState()
    {
        lock (stateLock)
        {
            try
            {
                string temporaryPath = statePath + ".tmp-" + CurrentProcessId.ToString();
                File.WriteAllText(temporaryPath, BuildState(), new UTF8Encoding(false));
                if (File.Exists(statePath))
                {
                    try
                    {
                        File.Replace(temporaryPath, statePath, null);
                    }
                    catch
                    {
                        File.Copy(temporaryPath, statePath, true);
                        File.Delete(temporaryPath);
                    }
                }
                else
                {
                    File.Move(temporaryPath, statePath);
                }
            }
            catch
            {
                // A state write must not terminate or broaden this synthetic fixture.
            }
        }
    }
}
"@

Add-Type -TypeDefinition $source -Language CSharp -ReferencedAssemblies @('System.Drawing.dll', 'System.Windows.Forms.dll')
[E1SyntheticFixtureForm]::SetPerMonitorDpiAwareness()
[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false)

$form = $null
try {
    $form = New-Object -TypeName E1SyntheticFixtureForm -ArgumentList @($resolvedStatePath, $Mode, [bool]$TopMost.IsPresent)
    $form.Show()
    [System.Windows.Forms.Application]::DoEvents()

    if (-not (Test-Path -LiteralPath $resolvedStatePath -PathType Leaf)) {
        throw "Fixture could not write its required state file: $resolvedStatePath"
    }
    $writtenState = Get-Content -LiteralPath $resolvedStatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ([int]$writtenState.processId -ne $form.CurrentProcessId -or [int64]$writtenState.windowHandle -ne $form.CurrentWindowHandle -or [string]$writtenState.title -cne $form.WindowTitle) {
        throw 'Fixture state file does not describe the current fixture window.'
    }

    $bounds = $form.CurrentBounds
    [ordered]@{
        ready = $true
        title = $form.WindowTitle
        processId = $form.CurrentProcessId
        windowHandle = $form.CurrentWindowHandle
        mode = $form.CurrentMode
        topMost = $form.RequestedTopMost
        bounds = [ordered]@{
            left = $bounds.Left
            top = $bounds.Top
            width = $bounds.Width
            height = $bounds.Height
        }
        statePath = $resolvedStatePath
        controls = 'L=light, D=dark, B=busy-neutral, Escape=close'
    } | ConvertTo-Json -Compress | Write-Output

    [System.Windows.Forms.Application]::Run($form)
}
finally {
    if ($null -ne $form) {
        $form.Dispose()
    }
}
