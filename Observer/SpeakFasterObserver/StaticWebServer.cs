using System;
using System.IO;
using System.Net;
using System.Threading.Tasks;

// A class to serve static web content (mainly to localhost) for serving
// static webpages required for advanced text prediction features.
// To grant the application access to the default HTTP listener port (e.g.,
// 43737), run once as admin:
// ```
// netsh http add urlacl url=http://+:43737/ user=Everyone listen=yes
// ```
namespace SpeakFasterObserver
{
    class StaticWebServer
    {
        private readonly string staticContentDirPath;
        private readonly string indexHtmlPath;
        private HttpListener httpListener;

        public StaticWebServer() { 
           staticContentDirPath = Path.Join(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                Properties.Settings.Default.WebUiStaticFilesDir);
           indexHtmlPath = Path.Join(staticContentDirPath, "index.html");
        }

        public void StartHttpServerIfStaticContentExists()
        {
            if (!File.Exists(indexHtmlPath))
            {
                // Static files directory does not exist. Do nothing.
                return;
            }
            httpListener = new HttpListener();
            string serverUrl = $"http://+:{Properties.Settings.Default.WebUiPort}/";
            httpListener.Prefixes.Add(serverUrl);
            httpListener.Start();

            Task.Factory.StartNew(() =>
            {
                while (true)
                {
                    var context = httpListener.GetContext();
                    Task.Factory.StartNew(() => ProcessRequest(context));
                }
            });
        }

        private void ProcessRequest(HttpListenerContext context)
        {
            if (context.Request.HttpMethod.ToUpper() != "GET")
            {
                context.Response.StatusDescription =
                    $"Method not allowed {context.Request.HttpMethod}";
                context.Response.StatusCode = 405;
                context.Response.Close();
                return;
            }
            string urlPath = context.Request.Url.AbsolutePath;
            // Remove the leading "/".
            urlPath = urlPath[1..];
            if (urlPath == "")
            {
                urlPath = "index.html";
            }
            string[] urlPathParts = urlPath.Split("/");
            string localPath = Path.Join(staticContentDirPath, Path.Join(urlPathParts));
            if (!File.Exists(localPath))
            {
                context.Response.StatusDescription = "File not found";
                context.Response.StatusCode = 404;
                context.Response.Close();
                return;
            }
            FileStream fileStream = File.Open(localPath, FileMode.Open);
            context.Response.StatusDescription = "OK";
            context.Response.StatusCode = 200;
            context.Response.ContentLength64 = fileStream.Length;
            context.Response.ContentType = GetContentTypeFromExtension(
                new FileInfo(localPath).Extension);
            fileStream.CopyTo(context.Response.OutputStream);
            context.Response.Close();
        }

        private static string GetContentTypeFromExtension(string extension)
        {
            return extension switch
            {
                "html" => "text/html; charset=utf-8",
                "css" => "text/html; charset=utf-8",
                "js" => "text/javascript; charset=utf-8",
                "png" => "image/png",
                "jpg" => "image/jpeg",
                _ => "",
            };
        }
    }
}
