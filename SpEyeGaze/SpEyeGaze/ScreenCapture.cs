using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using SpEyeGaze.Win32;

namespace SpEyeGaze
{
    class ScreenCapture
    {
        private static ImageCodecInfo jpgEncoder = GetEncoder(ImageFormat.Jpeg);
        private static ImageCodecInfo pngEncoder = GetEncoder(ImageFormat.Png);

        public static Bitmap CaptureRegion(Rectangle region)
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

        public static Bitmap CaptureDesktop(bool workingAreaOnly)
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

        public static void Capture(string path)
        {
            var bitmap = CaptureDesktop(false);

            // Overlay timestamp
            var graphics = Graphics.FromImage(bitmap);

            var font = new Font("Times New Roman", 12, FontStyle.Regular);
            var stringFormat = new StringFormat
            {
                Alignment = StringAlignment.Center,
                LineAlignment = StringAlignment.Center
            };

            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            graphics.FillRectangle(Brushes.Black, new Rectangle(0, 0, 400, 80));
            graphics.DrawString(DateTime.Now.ToString("yyyyMMddThhmmssfff"), font, Brushes.White, new Point(200, 40), stringFormat);

            // Overlay EyeGaze cursor

            var parameters = new EncoderParameters();
            parameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 25L);

            bitmap.Save(path, jpgEncoder, parameters);
        }
    }
}
