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
        private const string UTC_DATETIME_FORMAT = "yyyyMMddTHHmmssfffZ";
        private const string IN_PROGRESS_SUFFIX = ".InProgress";
        private const string BUFFER_DIR_NAME = "_non_session_buffer";
        private const string SESSION_END_TOKEN_SUFFIX = "-SessionEnd.bin";
        private const string SESSION_DIR_PREFIX = "session-";

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

        public static string GetUtcTimestamp()
        {
            return $"{DateTime.UtcNow:yyyyMMddTHHmmssfffZ}";
        }

        public static string GetNewSessionDirPath(string dataDir)
        {
            return Path.Combine(dataDir, $"{SESSION_DIR_PREFIX}{GetUtcTimestamp()}");
        }

        public static string GetBufferDirPath(string dataDir)
        {
            return Path.Combine(dataDir, BUFFER_DIR_NAME);
        }

        public static string GetMicWavInFilePath(string dataDir)
        {
            return Path.Combine(dataDir, $"{GetUtcTimestamp()}-MicWaveIn.flac");
        }

        public static string GetScreenshotFilePath(string dataDir)
        {
            return Path.Combine(dataDir, $"{GetUtcTimestamp()}-Screenshot.jpg");
        }

        public static string GetSpeechScreenshotFilePath(string dataDir)
        {
            return Path.Combine(dataDir, $"{GetUtcTimestamp()}-SpeechScreenshot.jpg");
        }

        public static string GetKeypressesProtobufFilePath(string dataDir)
        {
            return Path.Combine(dataDir, $"{GetUtcTimestamp()}-Keypresses.protobuf");
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

        public static bool IsNonSessionBufferFile(string filePath)
        {
            string[] pathItems = filePath.Split(Path.DirectorySeparatorChar);
            if (pathItems[^1] == BUFFER_DIR_NAME ||
                (pathItems.Length > 1 && pathItems[^2] == BUFFER_DIR_NAME))
            {
                return true;
            }
            else
            {
                return false;
            } 
        }

        public static bool IsSessionEndToken(string filePath)
        {
            return filePath.EndsWith(SESSION_END_TOKEN_SUFFIX);
        }

        public static string GetSessionEndTokenFilePath(string dataDir)
        {
            return Path.Combine(dataDir, $"{GetUtcTimestamp()}{SESSION_END_TOKEN_SUFFIX}");
        }

        public static DateTime ParseDateTimeFromFileName(string fileName)
        {
            string[] items = fileName.Split(Path.DirectorySeparatorChar);
            string baseName = items[items.Length - 1];
            string timestamp = baseName.Split("-")[0];
            DateTime prevDateTime;
            DateTime.TryParseExact(
                timestamp, UTC_DATETIME_FORMAT, CultureInfo.InvariantCulture, DateTimeStyles.None,
                out prevDateTime);
            return prevDateTime.ToUniversalTime();
        }
    }
}
