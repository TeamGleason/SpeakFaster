using System;
using System.Drawing;
using Sleddog.Blink1;

namespace SpeakFasterObserver
{
    // Controls the visual notification state of a USB LED light. This serves the purpose
    // of notifying the user when an active recording session is happening.
    class Blinker
    {
        IBlink1 blink1;
        public Blinker() {
            foreach (var blink in Blink1Connector.Scan())
            {
                blink1 = blink;
            }
        }

        public void startBlinking()
        {

            if (blink1 == null)
            {
                return;
            }
            blink1.Blink(Color.Red, new TimeSpan(0, 0, 5), 10);
        }

        public void stopBlinking()
        {
            if (blink1 == null)
            {
                return;
            }
            blink1.TurnOff();
        }
    }
}
