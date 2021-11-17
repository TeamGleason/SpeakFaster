using SpeakFasterObserver.Win32;
using System;
using System.ComponentModel;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Windows.Forms;
using ToltTech.GazeInput;
using TurboJpegWrapper;

namespace SpeakFasterObserver
{
    class ScreenCapture
    {
//        private static readonly ImageCodecInfo jpgEncoder = GetEncoder(ImageFormat.Jpeg);
        private static readonly TJCompressor compressor = new();

        private static readonly Brush gazeCursorBrush = new SolidBrush(Color.FromArgb(128, 255, 0, 0));
        private readonly IGazeDevice _gazeDevice;

        public ScreenCapture(IGazeDevice gazeDevice)
        {
            _gazeDevice = gazeDevice;
        }

        public Bitmap CaptureRegion(Rectangle region)
        {
            var hDeskWnd = Interop.GetDesktopWindow();
            var hWndDC = Interop.GetWindowDC(hDeskWnd);
            var hMemDC = Interop.CreateCompatibleDC(hWndDC);
            var hMemBmp = Interop.CreateCompatibleBitmap(hWndDC, region.Width, region.Height);
            var hOldBmp = Interop.SelectObject(hMemDC, hMemBmp);

            if (!Interop.BitBlt(hMemDC, 0, 0, region.Width, region.Height, hWndDC, region.Left, region.Top, Interop.RasterOperation.SRCCOPY | Interop.RasterOperation.CAPTUREBLT))
            {
                throw new Win32Exception();
            }

            /*
            long size = ((width * 32 + 31) / 32) * 4 * height;
            var bmi = new BITMAPINFO();
            bmi.biSize = (uint)Marshal.SizeOf(bmi);
            bmi.biWidth = region.Width;
            bmi.biHeight = region.Height;
            bmi.biPlanes = 1;
            bmi.biBitCount = 32;
            bmi.biCompression = BitmapCompressionMode.BI_RGB;
            bmi.biSizeImage = (uint)size;
            */

            Interop.SelectObject(hMemDC, hOldBmp);

            try
            {
                return Image.FromHbitmap(hMemBmp);
            }
            finally
            {
                // Interop.GetDIBits(hMemDC, hMemBmp, 0, wndHeight, pData, ref bmi, BitmapCompressionMode.BI_RGB);
                Interop.DeleteObject(hMemBmp);
                Interop.DeleteDC(hMemDC);
                Interop.ReleaseDC(hDeskWnd, hWndDC);
            }
        }

        public Bitmap CaptureDesktop(bool workingAreaOnly)
        {
            var desktop = Rectangle.Empty;

            foreach(var screen in Screen.AllScreens)
            {
                desktop = Rectangle.Union(desktop, workingAreaOnly ? screen.WorkingArea : screen.Bounds);
            }

            // libjpeg-turbo is incompatible with the CaptureRegion graphic that is generated
            // Throws System.AccessViolationException

            //return CaptureRegion(desktop);

            // This path is a bit slower than CaptureRegion, but it's a little faster to use this plus libjpeg than
            // To use the CaptureRegion plus the internal jpeg encoder

            var bitmap = new Bitmap(desktop.Width, desktop.Height, PixelFormat.Format32bppArgb);
            try
            {
                using (var graphics = Graphics.FromImage(bitmap))
                {
                    graphics.CopyFromScreen(0, 0, 0, 0, bitmap.Size, CopyPixelOperation.SourceCopy);
                }
            }
            catch (Win32Exception e)
            {
                // Screen capture occasionally fails shortly before and after system suspend and resume.
                // In this case bitmap will be black (all zero values).
            }

            return bitmap;
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

        private void OverlayTimestamp(Bitmap bitmap, string timestamp)
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
                graphics.DrawString(timestamp, font, Brushes.White, new Point(200, 40), stringFormat);
            }
        }

        private void OverlayGazeCursor(Bitmap bitmap)
        {
            if (_gazeDevice != null && _gazeDevice.LastGazePoint != null)
            {
                var gazePoint = _gazeDevice.LastGazePoint;
                if (gazePoint != null && _gazeDevice.LastGazePoint.HasValue)
                {
                    using (var graphics = Graphics.FromImage(bitmap))
                    {
                        graphics.SmoothingMode = SmoothingMode.AntiAlias;
                        graphics.FillEllipse(gazeCursorBrush, (int)(gazePoint.Value.X), (int)gazePoint.Value.Y, 50, 50);
                    }
                }
            }
        }

        public void Capture(string path, string timestamp)
        {
            using (var bitmap = CaptureDesktop(false))
            {
                OverlayTimestamp(bitmap, timestamp);
                OverlayGazeCursor(bitmap);

                var srcData = bitmap.LockBits(new Rectangle(0, 0, bitmap.Width, bitmap.Height), ImageLockMode.ReadOnly, bitmap.PixelFormat);

                TJPixelFormats tjPixelFormat;
                switch (bitmap.PixelFormat)
                {
                    case PixelFormat.Format8bppIndexed:
                        tjPixelFormat = TJPixelFormats.TJPF_GRAY;
                        break;
                    case PixelFormat.Format24bppRgb:
                        tjPixelFormat = TJPixelFormats.TJPF_RGB;
                        break;
                    case PixelFormat.Format32bppArgb:
                        tjPixelFormat = TJPixelFormats.TJPF_BGRA;  // Fixed from the sample code that had this wrong
                        break;
                    case PixelFormat.Format32bppRgb:
                        tjPixelFormat = TJPixelFormats.TJPF_BGRX; //?
                        break;
                    default:
                        throw new ArgumentOutOfRangeException();
                }

                var bytes = compressor.Compress(srcData.Scan0, 0, bitmap.Width, bitmap.Height, tjPixelFormat, TJSubsamplingOptions.TJSAMP_422, 25, TJFlags.NONE);
                bitmap.UnlockBits(srcData);

                File.WriteAllBytes(path, bytes);

                // The 'built in' jpeg encoder -- considerably slower than libjpeg-turbo (above)
                // var parameters = new EncoderParameters();
                // parameters.Param[0] = new EncoderParameter(Encoder.Quality, 25L);
                // bitmap.Save(path, jpgEncoder, parameters);
            }
        }
    }
}
