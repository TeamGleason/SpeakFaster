using SpEyeGaze.Win32;
using System;
using System.ComponentModel;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Windows.Forms;

namespace SpEyeGaze
{
    class ScreenCapture : IDisposable
    {
        private static ImageCodecInfo jpgEncoder = GetEncoder(ImageFormat.Jpeg);
        private static Brush gazeCursorBrush = new SolidBrush(Color.FromArgb(128, 255, 0, 0));
        private ToltTech.GazeInput.IGazeDevice gazeDevice;

        public ScreenCapture()
        {
            gazeDevice = new ToltTech.GazeInput.TobiiStreamEngine();

            if (!gazeDevice.IsAvailable)
            {
                gazeDevice.Dispose();
                gazeDevice = null;
                return;
            }

            gazeDevice.Connect(new System.Diagnostics.TraceSource("Null"));
        }

        public Bitmap CaptureRegion(Rectangle region)
        {
            var desktophWnd = Interop.GetDesktopWindow();
            var desktopDc = Interop.GetWindowDC(desktophWnd);
            var memoryDc = Interop.CreateCompatibleDC(desktopDc);
            var bitmap = Interop.CreateCompatibleBitmap(desktopDc, region.Width, region.Height);
            var oldBitmap = Interop.SelectObject(memoryDc, bitmap);

            if (!Interop.BitBlt(memoryDc, 0, 0, region.Width, region.Height, desktopDc, region.Left, region.Top, Interop.RasterOperation.SRCCOPY | Interop.RasterOperation.CAPTUREBLT))
            {
                throw new Win32Exception();
            }

            try
            {
                return Image.FromHbitmap(bitmap);
            }
            finally
            {
                Interop.SelectObject(memoryDc, oldBitmap);
                Interop.DeleteObject(bitmap);
                Interop.DeleteDC(memoryDc);
                Interop.ReleaseDC(desktophWnd, desktopDc);
            }
        }

        public Bitmap CaptureDesktop(bool workingAreaOnly)
        {
            var desktop = Rectangle.Empty;

            foreach(var screen in Screen.AllScreens)
            {
                desktop = Rectangle.Union(desktop, workingAreaOnly ? screen.WorkingArea : screen.Bounds);
            }

            return CaptureRegion(desktop);
        }

        private static ImageCodecInfo GetEncoder(ImageFormat format)
        {
            ImageCodecInfo[] codecs = ImageCodecInfo.GetImageEncoders();

            foreach (ImageCodecInfo codec in codecs)
            {
                if (codec.FormatID == format.Guid)
                {
                    return codec;
                }
            }

            return null;
        }

        private void OverlayTimestamp(Bitmap bitmap)
        {
            using (var graphics = Graphics.FromImage(bitmap))
            {

                var font = new Font("Times New Roman", 12, FontStyle.Regular);
                var stringFormat = new StringFormat
                {
                    Alignment = StringAlignment.Center,
                    LineAlignment = StringAlignment.Center
                };

                graphics.SmoothingMode = SmoothingMode.AntiAlias;
                graphics.FillRectangle(Brushes.Black, new Rectangle(0, 0, 400, 80));
                graphics.DrawString(DateTime.Now.ToString("yyyyMMddThhmmssfff"), font, Brushes.White, new Point(200, 40), stringFormat);
            }
        }

        private void OverlayGazeCursor(Bitmap bitmap)
        {
            if (gazeDevice != null && gazeDevice.LastGazePoint != null)
            {
                var gazePoint = gazeDevice.LastGazePoint;
                if (gazePoint != null && gazeDevice.LastGazePoint.HasValue)
                {
                    using (var graphics = Graphics.FromImage(bitmap))
                    {
                        graphics.SmoothingMode = SmoothingMode.AntiAlias;
                        graphics.FillEllipse(gazeCursorBrush, (int)(gazePoint.Value.X), (int)gazePoint.Value.Y, 50, 50);
                    }
                }
            }
        }

        public void Capture(string path)
        {
            using (var bitmap = CaptureDesktop(false))
            {
                OverlayTimestamp(bitmap);
                OverlayGazeCursor(bitmap);

                var parameters = new EncoderParameters();
                parameters.Param[0] = new EncoderParameter(Encoder.Quality, 25L);

                bitmap.Save(path, jpgEncoder, parameters);
            }
        }

        public void Dispose()
        {
            gazeDevice?.Dispose();
        }
    }
}
