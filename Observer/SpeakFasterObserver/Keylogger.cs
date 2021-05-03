using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using static SpeakFasterObserver.Win32.Interop;

namespace SpeakFasterObserver
{
    public class Keylogger: IDisposable
    {
        public delegate void KeyboardDelegate(int vkCode);

        private const int WH_KEYBOARD_LL = 13;
        private const int WM_KEYDOWN = 0x0100;
        private static WindowsHookDelegate _proc = WindowsHookCallback;
        private static IntPtr _hookID = IntPtr.Zero;
        private static KeyboardDelegate _kbDelegate;

        public Keylogger(KeyboardDelegate kbDelegate)
        {
            _kbDelegate = kbDelegate;
            SetupKeyboardHook();
        }

        private static void SetupKeyboardHook()
        {
            using (Process curProcess = Process.GetCurrentProcess())
            using (ProcessModule curModule = curProcess.MainModule)
            {
                _hookID = SetWindowsHookEx(WH_KEYBOARD_LL, _proc,
                    GetModuleHandle(curModule.ModuleName), 0);
            }
        }

        private static IntPtr WindowsHookCallback(
            int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0 && wParam == (IntPtr)WM_KEYDOWN)
            {
                int vkCode = Marshal.ReadInt32(lParam);
                _kbDelegate(vkCode);
            }
            return CallNextHookEx(_hookID, nCode, wParam, lParam);
        }

        public void Dispose()
        {
            if (_hookID != IntPtr.Zero)
            {
                UnhookWindowsHookEx(_hookID);
            }
        }
    }
}
