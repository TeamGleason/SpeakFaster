using System;
using System.Diagnostics;
using System.IO;
using System.Collections.Generic;
using System.Threading.Tasks;

using Google.Protobuf;

namespace SpeakFasterObserver
{
    /** A class that manageds the start and end of data sessions. */
    class SessionManager
    {
        // The window before the beginning of a session to keep data for.
        private const int SESSION_LEAD_TIME_SECONDS = 5 * 60;
        private const int SESSION_FADE_TIME_SECONDS = 5 * 60;

        private static readonly object SESSION_LOCK = new object();

        private readonly TimeSpan sessionLeadTime = TimeSpan.FromSeconds(SESSION_LEAD_TIME_SECONDS);
        private readonly TimeSpan sessionFadeTime = TimeSpan.FromSeconds(SESSION_FADE_TIME_SECONDS);
        private readonly string dataRoot;
        private readonly string bufferDirName;
        private string sessionDirName = null;
        private DateTime sessionStart;
        private DateTime lastFocus;
        
        public SessionManager(string dataRoot) {
            this.dataRoot = dataRoot;
            bufferDirName = FileNaming.GetBufferDirPath(dataRoot);
        }

        /**
         * Updates the boolean flag for whether the an app of interested is in focus.
         * 
         * The caller should call this method on a periodic basis. 
         * 
         * This method automatically updates the session state based on the focus flag:
         * - If inFocus flips from false to true when there is no ongoing
         *   session, a new session will be started.
         * - If inFocus stays at false for longer than SESSION_FADE_TIME_SECONDS,
         *   and there is an ongoing session, the current session will be ended.
         *
         * Args:
         *   inFocus: Whether the app is currently in the "in focus" state, i.e., in a 
         *     state where the user is in a text editor / TTS app, ready to enter keystrokes
         *     for communication.
         *   sessionEndAction: Actions performed at the end of a session.
         *   sessionStartAction: Actions performed at the beginning of a new session.
         */
        public void SetFocusFlag(bool inFocus, Action sessionEndAction, Action sessionStartAction)
        {
            if (sessionDirName == null)
            {
                // No session is ongoing.
                if (inFocus)
                {
                    sessionEndAction.Invoke();
                    CreateNewSession();
                    sessionStartAction.Invoke();
                    lastFocus = DateTime.UtcNow;
                }
                // This is necessary because when the machine resumes from suspension (sleep),
                // the state of the LED often becomes obsolete and require updating.
                Blinker.stopNotification();
            }
            else
            {
                // A session is ongoing.
                if (inFocus)
                {
                    lastFocus = DateTime.UtcNow;
                }
                else
                {
                    if (DateTime.UtcNow.Subtract(lastFocus).CompareTo(sessionFadeTime) > 0)
                    {
                        sessionEndAction.Invoke();
                        EndCurrentSession();
                    }
                }
                // This is necessary because when the machine resumes from suspension (sleep),
                // the state of the LED often becomes obsolete and require updating.
                Blinker.startNotification();
            }
        }

        public string GetMicWavInFilePath()
        {
            return FileNaming.GetMicWavInFilePath(GetTargetDirName());
        }

        public string GetScreenshotFilePath()
        {
            return FileNaming.GetScreenshotFilePath(GetTargetDirName());
        }

        public string GetSpeechScreenshotFilePath()
        {
            return FileNaming.GetSpeechScreenshotFilePath(GetTargetDirName());
        }

        public string GetKeypressesProtobufFilePath()
        {
            return FileNaming.GetKeypressesProtobufFilePath(GetTargetDirName());
        }

        private string GetTargetDirName()
        {
            lock (SESSION_LOCK)
            {
                if (sessionDirName == null)
                {
                    // Creates the buffer directory if and only if it doesn't exist.
                    Directory.CreateDirectory(bufferDirName);
                    return bufferDirName;
                }
                else
                {
                    return sessionDirName;
                }
            }
        }

        private void CreateNewSession()
        {
            EndCurrentSession();
            lock (SESSION_LOCK)
            {
                sessionDirName = FileNaming.GetNewSessionDirPath(dataRoot);
                Directory.CreateDirectory(sessionDirName);
                sessionStart = DateTime.UtcNow;
                FlushBufferDir();
                Debug.WriteLine($"Created new session directory: {sessionDirName}");
            }
            Blinker.startNotification();
        }

        public void EndCurrentSession()
        {
            lock (SESSION_LOCK)
            {
                if (sessionDirName == null)
                {
                    // There is no ongoing session.
                    return;
                }
                // Put a session end token in the old session directory to indicate its end.
                Debug.WriteLine($"Ending session in {sessionDirName}");
                string sessionEndToken = FileNaming.GetSessionEndTokenFilePath(sessionDirName);
                if (!File.Exists(sessionEndToken))
                {
                    WriteSessionEndTokenFile(sessionEndToken);
                }
                sessionDirName = null;
            }
            Blinker.stopNotification();
        }

        private void WriteSessionEndTokenFile(string sessionEndTokenPath)
        {
            SessionMetadata metadata = new();
            metadata.Timezone = TimeZoneInfo.Local.ToString();
            metadata.SessionEndTimestamp =
                Google.Protobuf.WellKnownTypes.Timestamp.FromDateTime(DateTime.Now.ToUniversalTime());
            metadata.ComputerManufacturerFamily = FileNaming.ComputerManufacturerFamily;
            if (Upload._gazeDevice != null)
            {
                metadata.GazeDevice = Upload._gazeDevice;
            }
            metadata.Platform = Environment.OSVersion.Platform.ToString();
            metadata.OsVersion = Environment.OSVersion.Version.ToString();
            using (var fs = File.Create(sessionEndTokenPath))
            {
                metadata.WriteTo(fs);
            }
        }

        
        /**
         * Moves the data files in the buffer directory within the lead-time window to the current session directory.
         * Deletes all other files in the buffer directory.
         */
        private void FlushBufferDir()
        {
            // Creates the buffer directory if and only if it doesn't exist.
            Directory.CreateDirectory(bufferDirName);
            List<string> filePathsToRemove = new();
            foreach (var filePath in Directory.GetFiles(bufferDirName))
            {
                if (FileNaming.IsInProgress(filePath))
                {
                    continue;
                }
                DateTime fileDateTime = FileNaming.ParseDateTimeFromFileName(filePath);
                if (sessionDirName != null && sessionStart.Subtract(fileDateTime).CompareTo(sessionLeadTime) < 0)
                {
                    // Within the lead-time window: Copy the file to the current session directory.
                    string destPath = Path.Combine(sessionDirName, Path.GetFileName(filePath));
                    File.Move(filePath, destPath);
                    Debug.WriteLine($"Moved buffered file in lead window from {filePath} to {sessionDirName}");
                }
                else
                {
                    // Outside the lead-time window: Remove the file.
                    filePathsToRemove.Add(filePath);                    
                }
            }
            Task.Run(() =>
            {
                foreach (string filePath in filePathsToRemove)
                {
                    if (File.Exists(filePath))
                    {
                        File.Delete(filePath);
                        Debug.WriteLine($"Deleted buffered file outside lead window {filePath}");
                    }
                }
            });
        }
    }
}
