using Google.Protobuf;
using SpeakFasterObserver.Win32;
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Windows.Forms;

namespace SpeakFasterObserver
{
    public partial class FormMain : Form
    {
        private readonly ToltTech.GazeInput.IGazeDevice gazeDevice;

        static string dataPath;

        static KeyPresses keypresses = new();
        static bool isRecording = true;
        static bool isRecordingScreenshots = true;
        static bool isRecordingMicWaveIn = true;
        static bool balabolkaRunning = false;
        static bool balabolkaFocused = false;
        static bool tobiiComputerControlRunning = false;
        static SessionManager sessionManager;
        static AudioInput audioInput;
        static ScreenCapture screenCapture;
        private static string lastKeypressString = String.Empty;
        Keylogger keylogger;

        System.Threading.Timer uploadTimer = new(Timer_Tick);
        static System.Threading.Timer keyloggerTimer = new((state) => { SaveKeypresses(); });

        public FormMain()
        {
            InitializeComponent();

            dataPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "SpeakFasterObserver");

            gazeDevice = new ToltTech.GazeInput.TobiiStreamEngine();
            sessionManager = new(dataPath);
            audioInput = new();

            if (!gazeDevice.IsAvailable)
            {
                gazeDevice.Dispose();
                gazeDevice = null;

                screenCapture = new(null);
            }
            else
            {
                gazeDevice.Connect(new TraceSource("Null"));
                screenCapture = new(gazeDevice);
                Upload._gazeDevice = gazeDevice.Information;
            }

            // Ensure output director exists
            if (!Directory.Exists(dataPath))
            {
                Directory.CreateDirectory(dataPath);
            }

            // Load previous recording state
            isRecording = Properties.Settings.Default.IsRecordingOn;
            isRecordingScreenshots = Properties.Settings.Default.IsRecordingScreenshots;
            isRecordingMicWaveIn = Properties.Settings.Default.IsRecordingMicWaveIn;

            // Ensure Icons and Strings reflect proper recording state on start
            SetRecordingState(isRecording, isRecordingScreenshots, isRecordingMicWaveIn);

            // Setup the Keypress keyboard hook
            keylogger = new Keylogger(KeyboardHookHandler);

            Upload._dataDirectory = (dataPath);
            uploadTimer.Change(0, 60 * 1000);
        }

        #region Event Handlers
        private void FormMain_Load(object sender, EventArgs e)
        {
            Hide();

            SetRecordingState(isRecording, isRecordingScreenshots, isRecordingMicWaveIn);
        }

        private void FormMain_FormClosing(object sender, FormClosingEventArgs e)
        {
            gazeDevice?.Dispose();
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
            ExitApplication();
        }

        private void toggleButtonOnOff_Click(object sender, EventArgs e)
        {
            SetRecordingState(!isRecording, isRecordingScreenshots, isRecordingMicWaveIn);
        }

        private void notifyIcon_Click(object sender, EventArgs e)
        {
            if (((System.Windows.Forms.MouseEventArgs)e).Button == MouseButtons.Left)
            {
                SetRecordingState(!isRecording, isRecordingScreenshots, isRecordingMicWaveIn);
            }
        }

        private void notifyIconContextMenuStrip_ItemClicked(object sender, ToolStripItemClickedEventArgs e)
        {
            var clickedItem = e.ClickedItem;

            if (clickedItem.Text == "Exit")
            {
                ExitApplication();
            }
            else if (clickedItem.Text == "Record Screenshots")
            {
                SetRecordingState(isRecording, !isRecordingScreenshots, isRecordingMicWaveIn);
            }
            else if (clickedItem.Text == "Record Audio from Microphone")
            {
                SetRecordingState(isRecording, isRecordingScreenshots, !isRecordingMicWaveIn);
            }
        }

        public static async void Timer_Tick(object? state)
        {
            if (isRecording && isRecordingMicWaveIn)
            {
                audioInput.RotateFlacWriter();
                audioInput.SetNewFlacPath(sessionManager.GetMicWavInFilePath());
            }

            Upload.Timer_Tick(state);
        }

        private void screenshotTimer_Tick(object sender, EventArgs e)
        {
            UpdateSessionManagerState();
            var timestamp = FileNaming.GetTimestamp();
            var filePath = sessionManager.GetScreenshotFilePath();
            CaptureScreenshot(timestamp, filePath);
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

        private static void UpdateSessionManagerState()
        {
            bool isRecordingInBalabolka = isRecording && balabolkaFocused;
            sessionManager.SetFocusFlag(isRecordingInBalabolka, () => { 
                SaveKeypresses();
                if (isRecordingMicWaveIn)
                {
                    audioInput.RotateFlacWriter();
                }
            }, () =>
            {
                if (isRecordingMicWaveIn)
                {
                    audioInput.SetNewFlacPath(sessionManager.GetMicWavInFilePath());
                }
            });
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
                var keypressString = ((Keys)vkCode).ToString();

                lock (keypresses)
                {
                    keypresses.KeyPresses_.Add(new KeyPress
                    {
                        KeyPress_ = keypressString,
                        Timestamp = Google.Protobuf.WellKnownTypes.Timestamp.FromDateTime(DateTime.Now.ToUniversalTime())
                    });
                }

                if (lastKeypressString.Equals("LControlKey") && keypressString.Equals("W"))
                {
                    var timestamp = FileNaming.GetTimestamp();
                    var filePath = sessionManager.GetSpeechScreenshotFilePath();
                    CaptureScreenshot(timestamp, filePath);
                }

                lastKeypressString = keypressString;

                keyloggerTimer.Change(60 * 1000, System.Threading.Timeout.Infinite);
            }
        }
        #endregion

        private static void CaptureScreenshot(string timestamp, string filePath)
        {
            if (
                isRecording                         // Only record when recording enabled
                && isRecordingScreenshots           // AND when we are recording screenshots
                && balabolkaRunning                 // AND balabolka is running
                && balabolkaFocused                 // AND balabolka has focus
                                                    //&& tobiiComputerControlRunning      //  AND Tobii Computer Control
                )
            {
                // TODO: Optimize raw capture data to best time synchronize the captures
                //   e.g. capture raw data to memory first, and compress/serialize/store later

                screenCapture.Capture(filePath, timestamp);

                // TODO: Also capture gaze coordinates

                // TODO: Also capture selfie image
            }
        }

        private void SetRecordingState(
            bool newRecordingState,
            bool newIsRecordingScreenshots,
            bool newIsRecordingMicWaveIn)
        {
            isRecording = newRecordingState;
            isRecordingScreenshots = newIsRecordingScreenshots;
            isRecordingMicWaveIn = newIsRecordingMicWaveIn;

            toggleButtonOnOff.Checked = isRecording;
            this.RecordScreenshotsToolStripMenuItem.Checked = isRecordingScreenshots;
            this.RecordMicWaveInToolStripMenuItem.Checked = isRecordingMicWaveIn;

            if (isRecording)
            {
                notifyIcon.Icon = new Icon("Assets\\RecordingOn.ico");
                notifyIcon.Text = "Observer - Recording On";
                toggleButtonOnOff.Text = "Recording On";
                UpdateSessionManagerState();
            }
            else
            {
                SaveKeypresses();
                sessionManager.EndCurrentSession();
                notifyIcon.Icon = new Icon("Assets\\RecordingOff.ico");
                notifyIcon.Text = "Observer - Recording Off";
                toggleButtonOnOff.Text = "Recording Off";
                Blinker.stopNotification();
            }

            screenshotTimer.Enabled = isRecording;

            if (isRecording != Properties.Settings.Default.IsRecordingOn)
            {
                // Save the new recording state
                Properties.Settings.Default.IsRecordingOn = isRecording;
                Properties.Settings.Default.Save();
            }

            if (isRecordingScreenshots != Properties.Settings.Default.IsRecordingScreenshots)
            {
                // Save the new recording state
                Properties.Settings.Default.IsRecordingScreenshots = isRecordingScreenshots;
                Properties.Settings.Default.Save();
            }

            if (isRecordingMicWaveIn != Properties.Settings.Default.IsRecordingMicWaveIn)
            {
                // Save the new recording state
                Properties.Settings.Default.IsRecordingMicWaveIn = isRecordingMicWaveIn;
                Properties.Settings.Default.Save();
            }

            if (isRecording && isRecordingMicWaveIn)
            {
                audioInput.StartRecordingFromMicrophone(sessionManager.GetMicWavInFilePath());
            }
            else
            {
                audioInput.StopRecordingFromMicrophone();
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

        private static void SaveKeypresses()
        {
            KeyPresses oldKeypresses;

            lock (keypresses)
            {
                oldKeypresses = keypresses;
                keypresses = new();
            }

            if (oldKeypresses.KeyPresses_.Count == 0) return;

            var filename = sessionManager.GetKeypressesProtobufFilePath();
            using (var file = File.Create(filename))
            {
                oldKeypresses.WriteTo(file);
            }
        }

        private void ExitApplication()
        {
            keyloggerTimer.Dispose();
            keyloggerTimer = null;

            processCheckerTimer.Enabled = false;
            screenshotTimer.Enabled = false;

            audioInput.StopRecordingFromMicrophone();
            SaveKeypresses();
            sessionManager.EndCurrentSession();

            keylogger.Dispose();
            keylogger = null;

            Blinker.stopNotification();

            this.Close();
        }
    }
}
