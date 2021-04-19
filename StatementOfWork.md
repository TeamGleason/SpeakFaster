# Statement of Work

‘Speak Faster Observer’ is a data collection app for the Speak Faster research effort.

## Scope

This app will be developed for Windows based AAC devices, with phase 1 constrained to observing and
collection the use of Balabolka on a Surface Pro computer with a Tobii PC Eye 5 and Tobii Computer Control.

It will collect computer usage data including intercepting keyboard and mouse events, collecting screen and selfie camera captures.

Optional: Capture of audio speech output streams, display recording light for other people in the room.

## Privacy

The app will include a “recording on” notification in the Windows System Tray and a simple Toggle On/Off button for recording (maybe not system tray, for a larger eye gaze hit target).

The app will recognize context and only record keystroke and mouse events during speaking events, when Balabolka and Tobii Computer Control keyboards are 'topmost'.


The captured data will be stored in local disk storage on the Surface Pro using common data formats such as JPG/PNG (image)
and JSON (data) files, to be uploaded at a later date by a Google Cloud uploading agent.

## Specific Aims (e.g. goals)

The phase 1 app will not include collection of eye gaze or speaking context data.  The goal of Phase 1 is to collect enough
data to reliably measure the WPM output of generating speech using a combination of Tobii Computer Control and Balabolka by
observing the computer screen and Windows Events.

## Design Notes

Data will be time stamp correlated with approximately a 2 frames per second context.  Precision timings are not needed, standard seconds/milliseconds off of system clock is sufficient for data correlation.

Words Per Minute (WPM) will not be calculated in this app.  WPM will be post process determined by analyzing the data collected.

Sample screen capture code: [ConferenceXP ScreenScraper](https://github.com/conferencexp/conferencexp/blob/1fb8be570a7c4b21d9161f3ee7a93a3bd1ea9275/MSR.LST.DShow/ScreenScraper/ScreenScraper.cpp#L204)

Timestamps will be encoded in filenames using non-delimited ISO 8601 format, so yyyymmddThhmmssf.  So filenames would be DataStream-yyyymmddThhmmssf.formatExtension.

Output audio can be separated and captured using a technique like a [Virtual Audio Cable](http://ntonyx.com/vac.htm).

Metadata files (e.g. keystroke captures) should use the Google [protobuf](https://developers.google.com/protocol-buffers/docs/csharptutorial) format rather than xml or json.

[SetWindowHookEx](https://docs.microsoft.com/en-us/windows/win32/winmsg/hooks) is the right API to capture keyboard & mouse data streams

'Recording Light' may signal to others in the room that recording is taking place by showing an image on a [Sparklet All-In-One](https://siliconsquared.com/sparkletallinone/).

Audio capture should be stored in uncompressed PCM16 for best compatibility with Speech To Text engines.  See [NAudio](https://markheath.net/post/how-to-record-and-play-audio-at-same) for guidance.  See also: [Audio Conversion](https://gitter.im/naudio/NAudio?at=56f2aa21e247956f1e305cbf), [C# Array Conversion](https://www.markheath.net/post/how-to-convert-byte-to-short-or-float).  FLAC is also possible: [C# FLAC Encoder](https://hydrogenaud.io/index.php?topic=74242.0), [CUDA Enabled FLAC Encoder](http://cue.tools/wiki/FLACCL), [C# FLAC Encoding](https://sourceforge.net/p/cuetoolsnet/code/ci/default/tree/CUETools.Codecs.FLACCL/).

Data will be copied to [GCloud storage via rsync](https://cloud.google.com/filestore/docs/copying-data).

