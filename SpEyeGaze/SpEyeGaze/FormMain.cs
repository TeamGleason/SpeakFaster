using Google.Protobuf;
using Microsoft.Win32;
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Windows.Forms;

namespace SpEyeGaze
{
    public partial class FormMain : Form
    {
        // Store captured data in %localappdata%\SpEyeGaze
        readonly string baseFilePath;
        readonly string keypressesPath;
        readonly string screenshotsPath;

        static readonly KeyPresses keypresses = new ();
        static bool isRecording = false;
        static bool balabolkaRunning = false;
        static bool tobiiComputerControlRunning = false;

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
            this.Hide();
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
            // need to serialize to file
            // {DataStream}-yyyymmddThhmmssf.{Extension}
            var filename = Path.Combine(
               keypressesPath,
                "Keypresses-" + DateTime.Now.ToString("yyyyMMddThhmmss") + "f.bin");
            using (var file = File.Create(filename))
            {
                keypresses.WriteTo(file);
            }

            screenshotTimer.Enabled = false;
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
            if (isRecording)
            {
                var filename = Path.Combine(
                    screenshotsPath,
                    "Screenshot-" + DateTime.Now.ToString("yyyyMMddThhmmss") + ".jpg");
                // TODO Re-enable screenshots
                //CaptureFullScreenshot(filename);
            }
        }

        private void balabolkaTimer_Tick(object sender, EventArgs e)
        {
            balabolkaRunning = IsProcessRunning("balabolka");
            labelBalabolkaRunning.Text = (balabolkaRunning ? "Balabolka is running." : "Balabolka is not running.");

            tobiiComputerControlRunning = IsProcessRunning("Tdx.ComputerControl");
            labelTobiiComputerControl.Text = (tobiiComputerControlRunning ? "Tobii Computer Control is running." : "Tobii Computer Control is not running");
        }

        private static void KeyboardHookHandler(int vkCode)
        {
            if (
                isRecording                         // Only record when recording enabled
                && balabolkaRunning                 //  AND balabolka is running
                //&& tobiiComputerControlRunning      //  AND Tobii Computer Control
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
                toggleButtonOnOff.Text = "Turn Recording Off";
            }
            else
            {
                notifyIcon.Icon = new Icon("Assets\\RecordingOff.ico");
                notifyIcon.Text = "SpEyeGaze - Recording Off";
                toggleButtonOnOff.Text = "Turn On Recording On";
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

        private static void CaptureFullScreenshot(string fullpath)
        {
            // TODO Be cautious of performance implications. Native option may be necessary
            // Note: This seems to only capture the primary display. For most systems
            //       this should be sufficient.
            var screenBounds = Screen.GetBounds(Point.Empty);
            var bitmap = new Bitmap(screenBounds.Width, screenBounds.Height);
            using (var graphics = Graphics.FromImage(bitmap))
            {
                graphics.CopyFromScreen(Point.Empty, Point.Empty, screenBounds.Size);
            }

            bitmap.Save(fullpath, ImageFormat.Jpeg);
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
    }
}
