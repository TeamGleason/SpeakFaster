using Amazon.Runtime.CredentialManagement;
using Amazon.S3;
using Amazon.S3.Model;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;

namespace SpeakFasterObserver
{
    internal class Upload
    {
        private const string SCHEMA_VERSION = "SPO-2111";
        private const string BUCKET_NAME = "speak-faster";

        private static readonly AmazonS3Client _client;

        internal static string _dataDirectory;
        internal static string _gazeDevice;
        internal static string _salt;

        static Upload()
        {
            var sf = new SharedCredentialsFile();
            if (!sf.TryGetProfile("spo", out CredentialProfile spo))
            {
                return;
            }

            Debug.Assert(spo.Region != null);
            _client = new AmazonS3Client(spo.GetAWSCredentials(sf), spo.Region);
        }

        private static async Task<string> ReadSalt()
        {
            if (_client != null)
            {
                try
                {
                    var getRequest = new GetObjectRequest
                    {
                        BucketName = BUCKET_NAME,
                        Key = $"salt"
                    };

                    GetObjectResponse getResponse = await _client.GetObjectAsync(getRequest);
                    if (getResponse.HttpStatusCode == HttpStatusCode.OK)
                    {
                        using StreamReader reader = new(getResponse.ResponseStream);
                        return reader.ReadToEnd();
                    }
                }
                catch
                {
                }
            }

            return null;
        }

        static bool _uploading = false;
        public static async void Timer_Tick(object? state)
        {
            // If we're still uploading, don't double-start
            if (_uploading) return;
            _uploading = true;

            Debug.Assert(_client != null);
            Debug.Assert(_dataDirectory != null);
            if (_gazeDevice == null)
            {
                // _gazeDevice can sometimes be null when the machine wakes up from sleep.
                return;
            }

            if (_salt == null)
            {
                _salt = await ReadSalt();

                if (_salt == null)
                    return;
            }

            foreach (string filePath in Directory.EnumerateFiles(_dataDirectory, "*", SearchOption.AllDirectories))
            {
                FileInfo fileInfo = new(filePath);
                if (FileNaming.IsInProgress(fileInfo.FullName))
                {
                    // Skip uploading in-progress file.
                    continue;
                }
                if (FileNaming.IsNonSessionBufferFile(fileInfo.FullName))
                {
                    // Skip non-session buffer files.
                    continue;
                }

                string[] relativePathParts = Path.GetRelativePath(_dataDirectory, filePath).Split(Path.DirectorySeparatorChar);
                var putRequest = new PutObjectRequest
                {
                    BucketName = BUCKET_NAME,
                    Key = $"observer_data/{SCHEMA_VERSION}/{FileNaming.CloudStoragePath(relativePathParts, _gazeDevice, _salt)}"
                };

                PutObjectResponse putResponse;
                try
                {
                    using (var inputStream = fileInfo.OpenRead())
                    {
                        putRequest.InputStream = inputStream;
                        putResponse = await _client.PutObjectAsync(putRequest);
                    }

                    if (putResponse.HttpStatusCode == HttpStatusCode.OK)
                    {
                        fileInfo.Delete();
                        // If the file that was just uploaded successfully is a session-end token, remove the session directory.
                        if (FileNaming.IsSessionEndToken(filePath))
                        {
                            string sessionDir = Path.GetDirectoryName(filePath);
                            if (IsDirectoryEmpty(sessionDir))
                            {
                                Directory.Delete(sessionDir);
                            }
                            Debug.WriteLine($"Deleted directory of ended session: {sessionDir}");
                        }
                    }
                }
                catch (HttpRequestException e)
                {
                    Debug.WriteLine($"AWS S3 PUT request experienced HttpRequestException: {e.Message}");
                }
            }

            _uploading = false;
        }

        private static bool IsDirectoryEmpty(string dirPath)
        {
            IEnumerable<string> items = Directory.EnumerateFileSystemEntries(dirPath);
            using (var enumerator = items.GetEnumerator())
            {
                return !enumerator.MoveNext();
            }
        }
    }
}
