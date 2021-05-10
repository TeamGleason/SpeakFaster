import keypresses_pb2
import sys
import os
import datetime

# Assuming that eye gaze activation faster than 100ms is faster than realistically possible.
# This is useful for detecting automatic insertion of characters as opposed to manually typed
# characters. A prime example is when predictions are used. A rapid series of backspace keys
# followed by rapid typing of characters
minhumantime = datetime.timedelta(milliseconds=100)

# Phase 1:
# 
# Raw: Characters, Space Delimited, Other Ctrl/Alt Modifiers (Ctl-, Alt-)
# Char Analysis: Speak, Stop, Pause, Enter, Backspace, Count of Characters Spoken
# Timing Analysis: Backword, Use Prediction, WPM
# Context Analysis: STX, ETX, CAN
# 
# ETX is inserted when detecting Speak, Stop, or Cancel.
# Cancel is detected if after STX, CTRL-A is received before Speak.
# When STX ... Stop/Pause ... Speak is detected, WPM timings are not calculated.

# Example Output:
# 
# ␂ H E L K 🠠 L O ␃ 💬 ⏲12.3
# ␂ H E L 🗩HELLO ␃ 💬 ⏲16.3
# 🗪 { Speak : 2 , Characters : 10, AverageWPM : 14.3 , TopWPM : 16.3 }

def VisualizeKeypresses(keypresses):
    previousKeypress = None
    isPhraseStart = True
    isPhraseEnd = False
    totalPhraseCount = 0
    totalCharacterCount = 0
    characterCount = 0
    wpms = []
    previousCharacterTimestamp = None

    for keypress in keypresses.keyPresses:
        currentCharacterTimestamp = datetimeFromTimestamp(keypress.Timestamp)
        if previousCharacterTimestamp:
            characterDelta = currentCharacterTimestamp - previousCharacterTimestamp

        if isPhraseStart:
            print("␂", end = '')
            isPhraseStart = False
            characterCount = 0
            backspaceCount = 0

            phraseStartTimestamp = currentCharacterTimestamp

        if (previousKeypress == "LControlKey" or previousKeypress == "RControlKey"):
            if keypress.KeyPress == "W":    # Ctrl-W == Speak
                print("␃", end = '')
                isPhraseEnd = True
                wasPhraseSpoken = True
                print("💬", end = '')       # Speak
            elif keypress.KeyPress == "Q":  # Ctrl-Q == Pause
                print("␃", end = '')
                isPhraseEnd = True
                wasPhraseSpoken = False
                print("⏸", end = '')       # Pause
            elif keypress.KeyPress == "Q":  # Ctrl-E == Stop
                print("␃", end = '')
                isPhraseEnd = True
                wasPhraseSpoken = False
                print("🛑", end = '')       # Stop
            elif keypress.KeyPress == "A":  # Ctrl-A == Select All
                isPhraseEnd = True
                wasPhraseSpoken = False
                print("␘", end = '')        # Cancel/reset of thought
            elif keypress.KeyPress == "Left":
                print("🠠", end = '')        # TODO need emoji for jumping back a word
        elif keypress.KeyPress == "Back":
            # TODO Backspace needs additional logic for predictions
            # 
            # Example of prediction being used for correction. Note that gaze keypresses are 500ms or more apart,
            # whereas the prediction related keystrokes are about 10ms apart
            # Key:M Timestamp:1620234070.425752700
            # Key:S Timestamp:1620234071.43349900
            # Key:J Timestamp:1620234072.64601200
            # Key:O Timestamp:1620234072.932556900
            # Key:R Timestamp:1620234073.901352900
            # Key:Back Timestamp:1620234075.126854300
            # Key:Back Timestamp:1620234075.128678900
            # Key:Back Timestamp:1620234075.130742100
            # Key:Back Timestamp:1620234075.133772800
            # Key:A Timestamp:1620234075.139330600
            # Key:J Timestamp:1620234075.141458000
            # Key:O Timestamp:1620234075.142460800
            # Key:R Timestamp:1620234075.143512300
            # Key:I Timestamp:1620234075.144501000
            # Key:T Timestamp:1620234075.145684400
            # Key:Y Timestamp:1620234075.146953500

            print("🔙", end = '')
            characterCount -= 1
            backspaceCount += 1
            if characterDelta < minhumantime:
                if not wordPrediction:
                    # Word Prediction in use
                    wordPrediction = True
                    print("🗩", end = '')
        elif keypress.KeyPress == "Enter" or keypress.KeyPress == "Return":
            print("↩", end = '')
        elif keypress.KeyPress == "Space":
            print(" ", end = '')
        elif keypress.KeyPress == "OemPeriod":
            print(".", end = '')
        elif keypress.KeyPress == "Oemcomma":
            print(",", end = '')
        elif keypress.KeyPress == "OemQuestion":
            print("?", end = '')
        elif keypress.KeyPress == "Oem7":
            print("'", end = '')
        elif keypress.KeyPress == "LWin":
            print("🗔", end = '')
        elif keypress.KeyPress == "Tab":
            print("→", end = '')
        elif keypress.KeyPress == "Left":
            print("🠠", end = '')
        elif keypress.KeyPress == "LShiftKey" or keypress.KeyPress == "RShiftKey":
            if previousKeypress != keypress.KeyPress: # Ignore long holds on shift
                print("↑", end = '')
        elif keypress.KeyPress == "LControlKey" or keypress.KeyPress == "RControlKey":
            pass
        else:                               # Normal character, print as-is
            # TODO Questioning whether the characters should be stored in a buffer that gets manipulated 
            #      rather than outputting characters on the fly?
            print(keypress.KeyPress, end = '')
            characterCount += 1
            wordPrediction = False

        previousCharacterTimestamp = currentCharacterTimestamp
        previousKeypress = keypress.KeyPress

        if isPhraseEnd:
            isPhraseEnd = False
            isPhraseStart = True

            wpm = 0.0

            if characterCount > 0:
                totalPhraseCount += 1
                totalCharacterCount += characterCount
                wpm = (characterCount / 5) / ((currentCharacterTimestamp - phraseStartTimestamp).total_seconds() / 60)
                wpms.append(wpm)

            if wasPhraseSpoken:
                print(f"⏲{wpm:5.1f} backspaces {backspaceCount}", end = '\n')
            else:
                print("", end = '\n')


    # Note in the above example, characters is the effective characters (ie: what was actually spoken)
    # Since "HELLO" was spoken twice the characters are 5 per phrase, or 10 total
    totalWpm = 0.0
    countWpm = 0
    topWpm = 0.0
    averageWpm = 0.0
    for wpm in wpms:
        totalWpm += wpm
        countWpm += 1
        if wpm > topWpm:
            topWpm = wpm

    if countWpm > 0:
        averageWpm = totalWpm / countWpm

    print("")
    print(f"🗪[Speak: {totalPhraseCount}, Characters: {totalCharacterCount}, AverageWPM: {averageWpm:5.1f}, TopWPM: {topWpm:5.1f}]")

def listFilesWithExtension(dirname,extension):
    return (f for f in os.listdir(dirname) if f.endswith('.' + extension))

def datetimeFromTimestamp(timestamp):
    return datetime.datetime.fromtimestamp(timestamp.seconds + timestamp.nanos/1e9)

if len(sys.argv) != 2:
  print(f"Usage: {sys.argv[0]} input_file")
  sys.exit(-1)

keypresses = keypresses_pb2.KeyPresses()

filepath = sys.argv[1]

files = listFilesWithExtension(filepath, "protobuf")

for filename in files:
    f = open(os.path.join(filepath,filename), "rb")
    bytes = f.read()
    keypresses.ParseFromString(bytes)
    f.close()

    VisualizeKeypresses(keypresses)