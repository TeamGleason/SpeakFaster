using System;
using System.IO;

namespace SpeakFasterObserver
{
    class FileNaming
    {
        private static string IN_PROGRESS_SUFFIX = ".InProgress";

        public static String getTimestamp()
        {
            return $"{DateTime.Now:yyyyMMddTHHmmssfff}";
        }

        public static string getMicWavInFilePath(string dataDir)
        {
            return Path.Combine(dataDir, $"{getTimestamp()}-MicWaveIn.flac");
        }

        public static string getScreenshotFilePath(string dataDir, string timestamp = null)
        {
            String actualTimestamp = timestamp != null ? timestamp : getTimestamp();
            return Path.Combine(dataDir, $"{actualTimestamp}-Screenshot.jpg");
        }

        public static string getSpeechScreenshotFilePath(string dataDir, string timestamp = null)
        {
            String actualTimestamp = timestamp != null ? timestamp : getTimestamp();
            return Path.Combine(dataDir, $"{actualTimestamp}-SpeechScreenshot.jpg");
        }

        public static string getKeypressesProtobufFilePath(String dataDir)
        {
            return Path.Combine(dataDir, $"{getTimestamp()}-Keypresses.protobuf");
        }

        public static bool isInProgress(String filePath)
        {
            return filePath.EndsWith(IN_PROGRESS_SUFFIX);
        }

        public static string addInProgressSuffix(String filePath)
        {
            if (isInProgress(filePath))
            {
                return filePath;
            }
            return filePath + IN_PROGRESS_SUFFIX;
        }

        public static string removeInProgressSuffix(String filePath)
        {
            if (isInProgress(filePath))
            {
                return filePath.Substring(0, filePath.Length - IN_PROGRESS_SUFFIX.Length);
            }
            return filePath;
        }
    }
}
