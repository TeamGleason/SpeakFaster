using System;
using System.IO;
using System.Management;
using System.Security.Cryptography;
using System.Text;

namespace SpeakFasterObserver
{
    class FileNaming
    {
        private const string IN_PROGRESS_SUFFIX = ".InProgress";

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

        public static string GetMicWavInFilePath(string dataDir)
        {
            return Path.Combine(dataDir, $"{GetTimestamp()}-MicWaveIn.flac");
        }

        public static string GetScreenshotFilePath(string dataDir, string timestamp = null)
        {
            string actualTimestamp = timestamp ?? GetTimestamp();
            return Path.Combine(dataDir, $"{actualTimestamp}-Screenshot.jpg");
        }

        public static string GetSpeechScreenshotFilePath(string dataDir, string timestamp = null)
        {
            string actualTimestamp = timestamp ?? GetTimestamp();
            return Path.Combine(dataDir, $"{actualTimestamp}-SpeechScreenshot.jpg");
        }

        public static string GetKeypressesProtobufFilePath(string dataDir)
        {
            return Path.Combine(dataDir, $"{GetTimestamp()}-Keypresses.protobuf");
        }

        public static string CloudStoragePath(FileInfo fileInfo, string gazeDevice, string salt)
        {
            return $"{ComputerManufacturerFamily}/{gazeDevice}/{CreateUserIdHash(salt)}/{fileInfo.Name}".Replace(' ', '_');
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
    }
}
