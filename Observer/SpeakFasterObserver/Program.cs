using System;
using System.Threading;
using System.Windows.Forms;

namespace SpeakFasterObserver
{
    static class Program
    {
        /// <summary>
        ///  The main entry point for the application.. 
        /// </summary>
        [STAThread]
        static void Main()
        {
            bool isNewInstance;
            Mutex mutex = new(true, "SpeakFasterObserver", out isNewInstance);
            if (!isNewInstance)
            {
                return;
            }
            Application.SetHighDpiMode(HighDpiMode.SystemAware);
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            Application.Run(new FormMain());
        }
    }
}
