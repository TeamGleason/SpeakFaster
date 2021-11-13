using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Threading.Tasks;
using Makaretu.Dns;

namespace SpeakFasterObserver
{
    // HTTP server for SpeakFaster. Used for communication with attached
    // devices (e.g., for getting Bluetooth LE detection events from an 
    // Android device.)
    class HttpServer
    {
        private static string SERVICE_PROFILE_NAME = "_spo._tcp";
        private static ushort PORT_NUMBER = 53737;

        public HttpServer() { }

        public void StartServiceDiscoveryAdvertisement()
        {
            var serviceDiscovery = new ServiceDiscovery();
            foreach (var networkInterface in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (networkInterface.OperationalStatus != OperationalStatus.Up) continue;
                if (networkInterface.GetIPProperties().GatewayAddresses.Count == 0) continue;
                foreach (var address in networkInterface.GetIPProperties().UnicastAddresses)
                {
                    var service = new ServiceProfile(
                        Environment.MachineName,
                        SERVICE_PROFILE_NAME,
                        PORT_NUMBER,
                        new List<IPAddress> { address.Address });
                    serviceDiscovery.Advertise(service);
                }
            }
        }

        // Needs netsh http add urlacl url="http://+:53737/" user=everyone
        public void Listen()
        {
            var listener = new HttpListener();
            listener.Prefixes.Add("http://+:53737/");
            listener.Start();

            Task.Factory.StartNew(() =>
            {
                while (true)
                {
                    var context = listener.GetContext();
                    Task.Factory.StartNew(() => ProcessRequest(context));
                }
            });
        }

        private void ProcessRequest(HttpListenerContext context)
        {
            switch (context.Request.HttpMethod.ToUpper())
            {
                case "GET":
                    context.Response.StatusDescription = "SpeakFaster Observer";
                    context.Response.StatusCode = 200;
                    context.Response.Close();
                    break;
                case "POST":
                    // TODO(cais): Handle register bluetooth LE beacon event.
                    var body = new StreamReader(context.Request.InputStream).ReadToEnd();
                    context.Response.StatusCode = 200;
                    context.Response.Close();
                    break;
                default:
                    context.Response.StatusCode = 404;
                    context.Response.Close();
                    break;
            }
        }
    }
}
