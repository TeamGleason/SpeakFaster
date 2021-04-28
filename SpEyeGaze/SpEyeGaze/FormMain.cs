using Google.Protobuf;
using Microsoft.Win32;
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Windows.Forms;

namespace SpEyeGaze
{
    public partial class FormMain : Form
    {
        enum RecordingState
        {
            RecordingOff = 0,
            RecordingOn = 1,
        }

        // Store captured data in %localappdata%\SpEyeGaze
        string baseFilePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SpEyeGaze");
        readonly string keypressesPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SpEyeGaze",
            "Keypresses");
        readonly string screenshotsPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SpEyeGaze",
            "Screenshots");

        static RecordingState currentRecordingState = RecordingState.RecordingOff;
        static readonly KeyPresses keypresses = new ();

        Keylogger keylogger;

        public FormMain()
        {
            InitializeComponent();

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
            currentRecordingState = (Properties.Settings.Default.IsRecordingOn ? RecordingState.RecordingOn : RecordingState.RecordingOff);

            // Ensure Icons and Strings reflect proper recording state on start
            SetRecordingState(currentRecordingState);

            // Setup the Keypress keyboard hook
            keylogger = new Keylogger(KeyboardHookHandler);
        }

        #region Form Event Handlers
        private void FormMain_Load(object sender, EventArgs e)
        {
            this.Hide();
        }
        #endregion

        #region Button Handlers
        private void btnOff_Click(object sender, EventArgs e)
        {
            SetRecordingState(RecordingState.RecordingOff);
        }

        private void btnOn_Click(object sender, EventArgs e)
        {
            SetRecordingState(RecordingState.RecordingOn);
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
        #endregion

        #region Event Handlers
        private void notifyIcon_MouseDoubleClick(object sender, MouseEventArgs e)
        {
            this.Show();
            this.WindowState = FormWindowState.Normal;
        }

        private void screenshotTimer_Tick(object sender, EventArgs e)
        {
            if (currentRecordingState == RecordingState.RecordingOn)
            {
                var filename = Path.Combine(
                    screenshotsPath,
                    "Screenshot-" + DateTime.Now.ToString("yyyyMMddThhmmss") + ".jpg");
                // TODO Re-enable screenshots
                //CaptureFullScreenshot(filename);
            }
        }

        private static void KeyboardHookHandler(int vkCode)
        {
            if (currentRecordingState == RecordingState.RecordingOn)
            {
                keypresses.KeyPresses_.Add(new KeyPress
                {
                    KeyPress_ = ((Keys)vkCode).ToString(),
                    Timestamp = Google.Protobuf.WellKnownTypes.Timestamp.FromDateTime(DateTime.Now.ToUniversalTime())
                });
            }
        }
        #endregion

        private void SetRecordingState(RecordingState newRecordingState)
        {
            bool isRecording = newRecordingState == RecordingState.RecordingOn;

            notifyIcon.Icon = new Icon("Assets\\Recording" + (isRecording ? "On" : "Off") + ".ico");
            currentRecordingState = newRecordingState;

            notifyIcon.Text = "SpEyeGaze - Recording " + (isRecording ? "On" : "Off");

            btnOn.Enabled = !isRecording;
            btnOff.Enabled = isRecording;
            screenshotTimer.Enabled = isRecording;

            if (isRecording != Properties.Settings.Default.IsRecordingOn)
            {
                // Save the new recording state
                Properties.Settings.Default.IsRecordingOn = isRecording;
                Properties.Settings.Default.Save();
            }
        }

        private void HideWindow()
        {
            this.Hide();
            notifyIcon.ShowBalloonTip(
                1000,
                "SpEyeGaze",
                "Recordding " + (currentRecordingState == RecordingState.RecordingOn ? "On" : "Off"),
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

        //Startup registry key and value
        private static readonly string StartupKey = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run";
        private static readonly string StartupValue = "SpEyeGaze";
        
        private static void SetStartup()
        {
            //Set the application to run at startup
            RegistryKey key = Registry.CurrentUser.OpenSubKey(StartupKey, true);
            key.SetValue(StartupValue, Application.ExecutablePath.ToString());
        }
    }
}
