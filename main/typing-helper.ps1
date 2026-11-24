# Pixie Windows global typing helper.
# Installs a low-level keyboard hook and emits one "K" pulse per key event.
# It never reads, logs, or transmits the pressed key or any text.

$ErrorActionPreference = 'SilentlyContinue'

$sig = @'
using System;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Threading.Tasks;

public static class PixieTypingHook
{
    public delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    private static readonly LowLevelKeyboardProc hookProc = HookCallback;
    private static readonly BlockingCollection<string> pulses = new BlockingCollection<string>();

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern int GetMessageW(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

    [DllImport("user32.dll")]
    private static extern bool TranslateMessage(ref MSG lpMsg);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessageW(ref MSG lpMsg);

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG
    {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public int pt_x;
        public int pt_y;
    }

    public static IntPtr HookHandle { get; private set; }

    public static bool Install()
    {
        IntPtr module = GetModuleHandle(null);
        HookHandle = SetWindowsHookEx(13, hookProc, module, 0);
        return HookHandle != IntPtr.Zero;
    }

    public static void Uninstall()
    {
        if (HookHandle != IntPtr.Zero)
        {
            UnhookWindowsHookEx(HookHandle);
            HookHandle = IntPtr.Zero;
        }
    }

    // Console output happens on a separate task, never inside the hook callback.
    public static void StartPulseWriter()
    {
        Task.Factory.StartNew(() =>
        {
            foreach (var pulse in pulses.GetConsumingEnumerable())
            {
                Console.Out.WriteLine(pulse);
                Console.Out.Flush();
            }
        }, TaskCreationOptions.LongRunning);
    }

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0)
        {
            int message = wParam.ToInt32();
            // WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP
            if (message == 0x0100 || message == 0x0101 || message == 0x0104 || message == 0x0105)
            {
                pulses.Add("K");
            }
        }
        return CallNextHookEx(HookHandle, nCode, wParam, lParam);
    }

    // A low-level hook requires a real message pump on the installing thread.
    public static void RunMessageLoop()
    {
        MSG msg;
        while (GetMessageW(out msg, IntPtr.Zero, 0, 0) > 0)
        {
            TranslateMessage(ref msg);
            DispatchMessageW(ref msg);
        }
    }
}
'@

try {
    Add-Type -TypeDefinition $sig -ErrorAction Stop
} catch {
    [Console]::Out.WriteLine('TAP_FAILED')
    [Console]::Out.Flush()
    exit 1
}

try {
    [PixieTypingHook]::StartPulseWriter()

    if (-not [PixieTypingHook]::Install()) {
        [Console]::Out.WriteLine('TAP_FAILED')
        [Console]::Out.Flush()
        exit 1
    }

    [Console]::Out.WriteLine('READY')
    [Console]::Out.Flush()

    [PixieTypingHook]::RunMessageLoop()
} catch {
    [Console]::Out.WriteLine('TAP_FAILED')
    [Console]::Out.Flush()
    exit 1
} finally {
    [PixieTypingHook]::Uninstall()
}
