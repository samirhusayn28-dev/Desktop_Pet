# Pixie Windows foreground-context helper.
# Reads only the foreground window title and process name, then emits JSON.
# It never captures keystrokes, file contents, or screen pixels.

$ErrorActionPreference = 'SilentlyContinue'

$sig = @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class PixieForeground
{
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@

function New-Context {
    param([string]$AppName, [string]$WindowTitle)
    return [ordered]@{
        appName = $AppName
        windowTitle = $WindowTitle
        url = ''
    }
}

try {
    Add-Type -TypeDefinition $sig -ErrorAction Stop

    $handle = [PixieForeground]::GetForegroundWindow()
    $title = ''
    $length = [PixieForeground]::GetWindowTextLength($handle)
    if ($length -gt 0) {
        $builder = New-Object System.Text.StringBuilder ($length + 1)
        [PixieForeground]::GetWindowText($handle, $builder, $builder.Capacity) | Out-Null
        $title = $builder.ToString()
    }

    [uint32]$foregroundPid = 0
    [PixieForeground]::GetWindowThreadProcessId($handle, [ref]$foregroundPid) | Out-Null
    $appName = 'Desktop'
    $process = Get-Process -Id $foregroundPid -ErrorAction SilentlyContinue
    if ($process) { $appName = $process.ProcessName }

    # When Pixie itself has focus, prefer the last known user app, mirroring macOS.
    if ($appName -in @('Pixie', 'Electron', 'desktop-pet')) {
        $knownApps = @('chrome', 'msedge', 'brave', 'firefox', 'Code', 'Cursor', 'devenv', 'WindowsTerminal')
        foreach ($known in $knownApps) {
            $candidate = Get-Process -Name $known -ErrorAction SilentlyContinue |
                Where-Object { $_.MainWindowTitle } |
                Select-Object -First 1
            if ($candidate) {
                $appName = $candidate.ProcessName
                $title = $candidate.MainWindowTitle
                break
            }
        }
    }

    (New-Context -AppName $appName -WindowTitle $title) | ConvertTo-Json -Compress
} catch {
    (New-Context -AppName 'Desktop' -WindowTitle '') | ConvertTo-Json -Compress
}
