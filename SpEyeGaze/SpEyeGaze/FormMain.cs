using Google.Protobuf;
using Microsoft.Win32;
using SpEyeGaze.Win32;
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Text;
using System.Windows.Forms;

namespace SpEyeGaze
{
    public partial class FormMain : Form
    {
        // Store captured data in %localappdata%\SpEyeGaze
        readonly string baseFilePath;
        readonly string keypressesPath;
        readonly string screenshotsPath;

        static KeyPresses keypresses = new();
        static bool isRecording = false;
        static bool balabolkaRunning = false;
        static bool balabolkaFocused = false;
        static bool tobiiComputerControlRunning = false;

        ScreenCapture screenCapture = new();
        Keylogger keylogger;

        public FormMain()
        {
            InitializeComponent();

            baseFilePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "SpEyeGaze");
            keypressesPath = Path.Combine(
                baseFilePath,
                "Keypresses");
            screenshotsPath = Path.Combine(
                baseFilePath,
                "Screenshots");

            // Ensure output director exists
            if (!Directory.Exists(baseFilePath))
            {
                Directory.CreateDirectory(baseFilePath);
            }
            if (!Directory.Exists(keypressesPath))
            {
                Directory.CreateDirectory(keypressesPath);
            }
            if (!Directory.Exists(screenshotsPath))
            {
                Directory.CreateDirectory(screenshotsPath);
            }

            // Load previous recording state
            isRecording = Properties.Settings.Default.IsRecordingOn;

            // Ensure Icons and Strings reflect proper recording state on start
            SetRecordingState(isRecording);

            // Setup the Keypress keyboard hook
            keylogger = new Keylogger(KeyboardHookHandler);
        }

        #region Event Handlers
        private void FormMain_Load(object sender, EventArgs e)
        {
            Hide();
        }

        private void FormMain_FormClosing(object sender, FormClosingEventArgs e)
        {
            screenCapture.Dispose();
        }

        private void btnAddStartupIcon_Click(object sender, EventArgs e)
        {
            // TODO Setup autostart
        }

        private void btnMinimize_Click(object sender, EventArgs e)
        {
            HideWindow();
        }

        private void btnExit_Click(object sender, EventArgs e)
        {
            keypressTimer.Enabled = false;
            processCheckerTimer.Enabled = false;
            screenshotTimer.Enabled = false;

            SaveKeypresses();

            keylogger.Dispose();
            keylogger = null;

            this.Close();
        }

        private void toggleButtonOnOff_Click(object sender, EventArgs e)
        {
            SetRecordingState(!isRecording);
        }

        private void notifyIcon_Click(object sender, EventArgs e)
        {
            ShowWindow();
        }

        private void notifyIcon_DoubleClick(object sender, EventArgs e)
        {
            ShowWindow();
        }

        private void screenshotTimer_Tick(object sender, EventArgs e)
        {
            if (
                isRecording                         // Only record when recording enabled
                && balabolkaRunning                 // AND balabolka is running
                && balabolkaFocused                 // AND balabolka has focus
                //&& tobiiComputerControlRunning      //  AND Tobii Computer Control
                )
            {
                var filename = Path.Combine(
                    screenshotsPath,
                    "Screenshot-" + DateTime.Now.ToString("yyyyMMddThhmmssfff") + ".jpg");

                screenCapture.Capture(filename);
            }
        }

        private void balabolkaTimer_Tick(object sender, EventArgs e)
        {
            balabolkaRunning = IsProcessRunning("balabolka");
            labelBalabolkaRunning.Text = (balabolkaRunning ? "Balabolka is running." : "Balabolka is not running.");

            tobiiComputerControlRunning = IsProcessRunning("Tdx.ComputerControl");
            labelTobiiComputerControl.Text = (tobiiComputerControlRunning ? "Tobii Computer Control is running." : "Tobii Computer Control is not running");

            balabolkaFocused = IsBalabolkaFocused();
            labelBalabolkaFocused.Text = (balabolkaFocused ? "Balabolka is focused." : "Balabolka is not focused.");
        }

        private void keypressTimer_Tick(object sender, EventArgs e)
        {
            SaveKeypresses();
        }

        private static void KeyboardHookHandler(int vkCode)
        {
            if (
                isRecording                         // Only record when recording enabled
                && balabolkaRunning                 // AND balabolka is running
                && balabolkaFocused                 // AND balabolka has focus
                //&& tobiiComputerControlRunning      // AND Tobii Computer Control
                )
            {
                keypresses.KeyPresses_.Add(new KeyPress
                {
                    KeyPress_ = ((Keys)vkCode).ToString(),
                    Timestamp = Google.Protobuf.WellKnownTypes.Timestamp.FromDateTime(DateTime.Now.ToUniversalTime())
                });
            }
        }
        #endregion

        private void SetRecordingState(bool newRecordingState)
        {
            isRecording = newRecordingState;

            toggleButtonOnOff.Checked = isRecording;

            if (isRecording)
            {
                notifyIcon.Icon = new Icon("Assets\\RecordingOn.ico");
                notifyIcon.Text = "SpEyeGaze - Recording On";
                toggleButtonOnOff.Text = "Recording On";
            }
            else
            {
                notifyIcon.Icon = new Icon("Assets\\RecordingOff.ico");
                notifyIcon.Text = "SpEyeGaze - Recording Off";
                toggleButtonOnOff.Text = "Recording Off";
            }

            screenshotTimer.Enabled = isRecording;

            if (isRecording != Properties.Settings.Default.IsRecordingOn)
            {
                // Save the new recording state
                Properties.Settings.Default.IsRecordingOn = isRecording;
                Properties.Settings.Default.Save();
            }
        }

        private void ShowWindow()
        {
            this.Show();
            this.WindowState = FormWindowState.Normal;
        }

        private void HideWindow()
        {
            this.Hide();
            notifyIcon.ShowBalloonTip(
                1000,
                "SpEyeGaze",
                (isRecording ? "Recording On" : "Recording Off"),
                ToolTipIcon.Info);
        }

        public bool IsProcessRunning(string processName)
        {
            foreach (Process process in Process.GetProcesses())
            {
                if (process.ProcessName.Contains(processName, StringComparison.InvariantCultureIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }

        private bool IsBalabolkaFocused()
        {
            const int nChars = 256; // MAX_PATH
            IntPtr handle = IntPtr.Zero;
            StringBuilder windowText = new StringBuilder(nChars);

            handle = Interop.GetForegroundWindow();

            if (Interop.GetWindowText(handle, windowText, nChars) > 0)
            {
                Console.WriteLine(windowText.ToString());
                if (windowText.ToString().Contains("Balabolka", StringComparison.InvariantCultureIgnoreCase))
                    return true;
            }

            return false;
        }

        private void SaveKeypresses()
        {
            var oldKeypresses = keypresses;
            keypresses = new ();
            // need to serialize to file
            // {DataStream}-yyyymmddThhmmssf.{Extension}
            var filename = Path.Combine(
               keypressesPath,
                "Keypresses-" + DateTime.Now.ToString("yyyyMMddThhmmssfff") + ".protobuf");
            using (var file = File.Create(filename))
            {
                oldKeypresses.WriteTo(file);
            }
        }
    }
}
