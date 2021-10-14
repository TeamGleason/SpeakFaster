using System;
using System.IO;
using System.Globalization;
using System.Management;
using System.Security.Cryptography;
using System.Text;

namespace SpeakFasterObserver
{
    class FileNaming
    {
        private const string IN_PROGRESS_SUFFIX = ".InProgress";
        private const string SESSION_DIR_PREFIX = "session-";
        // TODO(cais): Maybe change to 10.0 minutes.
        private const double SESSION_DIR_DEBOUNCE_TIMESPAN_MINUTES = 1.0;

        private static string _cmfCache;
        public static string ComputerManufacturerFamily
        {
            get
            {
                if (_cmfCache == null)
                    using (ManagementClass mc = new("Win32_ComputerSystem"))
                    {
                        using var moc = mc.GetInstances();
                        foreach (var mo in moc)
                        {
                            _cmfCache = $"{mo["Manufacturer"]}_{mo["SystemFamily"]}";
                        }
                    }

                return _cmfCache;
            }
        }

        private static string _uidCache;
        public static string CreateUserIdHash(string salt)
        {
            if (_uidCache == null)
                using (var _sha256 = new SHA256Managed())
                    _uidCache = Convert.ToBase64String(_sha256.ComputeHash(Encoding.UTF8.GetBytes(salt + Environment.UserName))).Replace('/', '_');

            return _uidCache;
        }

        public static string GetTimestamp()
        {
            return $"{DateTime.Now:yyyyMMddTHHmmssfff}";
        }

        public static string GetTimestampUtc()
        {
            return $"{DateTime.UtcNow:yyyyMMddTHHmmssfffZ}";
        }

        public static string GetMicWavInFilePath(string dataDir)
        {
            string dirName = GetCurrentSessionDirectory(dataDir);
            return Path.Combine(dirName, $"{GetTimestamp()}-MicWaveIn.flac");
        }

        public static string GetScreenshotFilePath(string dataDir, string timestamp = null)
        {
            string actualTimestamp = timestamp ?? GetTimestamp();
            string dirName = GetCurrentSessionDirectory(dataDir);
            return Path.Combine(dirName, $"{actualTimestamp}-Screenshot.jpg");
        }

        public static string GetSpeechScreenshotFilePath(string dataDir, string timestamp = null)
        {
            string actualTimestamp = timestamp ?? GetTimestamp();
            string dirName = GetCurrentSessionDirectory(dataDir);
            return Path.Combine(dirName, $"{actualTimestamp}-SpeechScreenshot.jpg");
        }

        public static string GetKeypressesProtobufFilePath(string dataDir)
        {
            string dirName = GetCurrentSessionDirectory(dataDir);
            return Path.Combine(dirName, $"{GetTimestamp()}-Keypresses.protobuf");
        }

        public static string CloudStoragePath(string[] relativePathParts, string gazeDevice, string salt)
        {
            string relativePath = String.Join("/", relativePathParts);
            return $"{ComputerManufacturerFamily}/{gazeDevice}/{CreateUserIdHash(salt)}/{relativePath}".Replace(' ', '_');
        }

        public static bool IsInProgress(String filePath)
        {
            return filePath.EndsWith(IN_PROGRESS_SUFFIX);
        }

        public static string AddInProgressSuffix(String filePath)
        {
            if (IsInProgress(filePath))
            {
                return filePath;
            }
            return filePath + IN_PROGRESS_SUFFIX;
        }

        public static string RemoveInProgressSuffix(String filePath)
        {
            if (IsInProgress(filePath))
            {
                return filePath.Substring(0, filePath.Length - IN_PROGRESS_SUFFIX.Length);
            }
            return filePath;
        }

        private static string sessionDirectoryName = $"{SESSION_DIR_PREFIX}{GetTimestampUtc()}";

        /**
         * Gets the current session directory. 
         * 
         * Creates the session directory if it doesn't already exist.
         * 
         * Args:
         *   dataDir: Root directory under which the session directory will reside.
         */
        private static string GetCurrentSessionDirectory(string dataDir)
        {
            string sessionDirectory = Path.Combine(dataDir, sessionDirectoryName);
            // Create the directory if and only if it doesn't exist yet.
            Directory.CreateDirectory(sessionDirectory);
            return sessionDirectory;
        }

        public static void RotateSessionDirectory(bool debounce = false)
        {
            if (debounce)
            {
                string timestamp = sessionDirectoryName.Substring(SESSION_DIR_PREFIX.Length);
                DateTime prevDateTime;
                DateTime.TryParseExact(
                    timestamp, "yyyyMMddTHHmmssfffZ", CultureInfo.CurrentCulture, DateTimeStyles.None,
                    out prevDateTime);
                var elapsed = DateTime.UtcNow.Subtract(prevDateTime);
                if (elapsed.CompareTo(TimeSpan.FromMinutes(SESSION_DIR_DEBOUNCE_TIMESPAN_MINUTES)) < 0)
                {
                    return;
                }
            }
            sessionDirectoryName = $"session-{GetTimestampUtc()}";
        }
    }
}
