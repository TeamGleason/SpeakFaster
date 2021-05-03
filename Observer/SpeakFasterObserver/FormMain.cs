using Google.Protobuf;
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace SpeakFasterObserver
{
    public partial class FormMain : Form
    {
        readonly string dataPath;

        static readonly KeyPresses keypresses = new();
        static bool isRecording = false;
        static bool balabolkaRunning = false;
        static bool tobiiComputerControlRunning = false;
        readonly ScreenCapture screenCapture = new();
        Keylogger keylogger;

        public FormMain()
        {
            InitializeComponent();

            dataPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "SpeakFasterObserver");

            // Ensure output director exists
            if (!Directory.Exists(dataPath))
            {
                Directory.CreateDirectory(dataPath);
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
               dataPath,
                $"{DateTime.Now:yyyyMMddThhmmssfff}-{Environment.MachineName}-Keypresses.protobuf");

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
                var timestamp = $"{DateTime.Now:yyyyMMddThhmmssfff}";

                var filePath = Path.Combine(
                    dataPath,
                    $"{timestamp}-{Environment.MachineName}-Screenshot.jpg");

                // TODO: Optimize raw capture data to best time synchronize the captures
                //   e.g. capture raw data to memory first, and compress/serialize/store later

                screenCapture.Capture(filePath, timestamp);

                // TODO: Also capture gaze coordinates

                // TODO: Also capture selfie image
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
                notifyIcon.Text = "Observer - Recording On";
                toggleButtonOnOff.Text = "Recording On";
            }
            else
            {
                notifyIcon.Icon = new Icon("Assets\\RecordingOff.ico");
                notifyIcon.Text = "Observer - Recording Off";
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
                "Observer",
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

        private void FormMain_FormClosing(object sender, FormClosingEventArgs e)
        {
            screenCapture.Dispose();
        }
    }
}
