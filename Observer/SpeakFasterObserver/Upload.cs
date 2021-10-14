using Amazon.Runtime.CredentialManagement;
using Amazon.S3;
using Amazon.S3.Model;
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading.Tasks;

namespace SpeakFasterObserver
{
    internal class Upload
    {
        private const string SCHEMA_VERSION = "SPO-2105";
        // TODO(cais): Restore. DO NOT SUBMIT.
        private const string BUCKET_NAME = "speak-faster-cais-test";  

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
            // TODO(cais): Restore. DO NOT SUBMIT.
            //Debug.Assert(_gazeDevice != null);

            if (_salt == null)
            {
                _salt = await ReadSalt();

                if (_salt == null)
                    return;
            }

            var dataDirectory = new DirectoryInfo(_dataDirectory);
            foreach (string filePath in Directory.EnumerateFiles(_dataDirectory, "*", SearchOption.AllDirectories))
            {
                FileInfo fileInfo = new(filePath);
                if (FileNaming.IsInProgress(fileInfo.FullName))
                {
                    // Skip uploading in-progress file.
                    continue;
                }

                string[] relativePathParts = Path.GetRelativePath(_dataDirectory, filePath).Split(Path.DirectorySeparatorChar);
                var putRequest = new PutObjectRequest
                {
                    BucketName = BUCKET_NAME,
                    Key = $"observer_data/{SCHEMA_VERSION}/{FileNaming.CloudStoragePath(relativePathParts, "foo_gaze_device", _salt)}"
                    // TODO(cais): Restore. DO NOT SUBMIT.
                    //Key = $"observer_data/{SCHEMA_VERSION}/{FileNaming.CloudStoragePath(fileInfo, _gazeDevice, _salt)}"
                };

                PutObjectResponse putResponse;
                using (var inputStream = fileInfo.OpenRead())
                {
                    putRequest.InputStream = inputStream;
                    putResponse = await _client.PutObjectAsync(putRequest);
                }

                if (putResponse.HttpStatusCode == HttpStatusCode.OK)
                {
                    fileInfo.Delete();
                    // TODO(cais): Delete the file's parent directory if there is nothing left in it?
                    Debug.WriteLine("Uploaded " + fileInfo.FullName);  // DEBUG
                }
            }

            _uploading = false;
        }
    }
}
