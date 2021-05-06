import keypresses_pb2
import sys
import os

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


# Iterates though all people in the AddressBook and prints info about them.
def VisualizeKeypresses(keypresses):
    previousKeypress = None
    isPhraseStart = True
    isPhraseEnd = False
    totalPhraseCount = 0
    totalCharacterCount = 0
    characterCount = 0
    wpms = []
    phraseStartTimeSeconds = 0
    phraseStartTimeNanos = 0

    for keypress in keypresses.keyPresses:
        if isPhraseStart:
            print("␂", end = '')
            isPhraseStart = False
            characterCount = 0
            phraseStartTimeSeconds = keypress.Timestamp.seconds
            phraseStartTimeNanos = keypress.Timestamp.nanos

        if keypress.KeyPress == "LControlKey" or keypress.KeyPress == "RControlKey":
            previousKeypress = "Ctrl"
        elif (previousKeypress == "Ctrl" or previousKeypress == "Ctrl"):
            if keypress.KeyPress == "W":    # Ctrl-W == Speak
                print("␃", end = '')
                isPhraseEnd = True
                print("💬", end = '')
                previousKeypress = None
            elif keypress.KeyPress == "Q":  # Ctrl-Q == Pause
                print("␃", end = '')
                isPhraseEnd = True
                print("⏸", end = '')
                previousKeypress = None
            elif keypress.KeyPress == "Q":  # Ctrl-E == Stop
                print("␃", end = '')
                isPhraseEnd = True
                print("🛑", end = '')
                previousKeypress = None
            elif keypress.KeyPress == "A":  # Ctrl-A == Select All
                previousKeypress = "SelectAll"
                previousKeypress = None
        elif keypress.KeyPress == "Back":
            # TODO Backspace needs additional logic for predictions
            print("🠠", end = '')
            characterCount -= 1
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
        elif keypress.KeyPress == "LShiftKey" or keypress.KeyPress == "RShiftKey":
            if previousKeypress != "Shift": # Ignore long holds on shift
                print("↑", end = '')
            previousKeypress = "Shift"
        else:                               # Normal character, print as-is
            # TODO Questioning whether the characters should be stored in a buffer that gets manipulated 
            #      rather than outputting characters on the fly?
            print(keypress.KeyPress, end = '')
            characterCount += 1

        if isPhraseEnd:
            isPhraseEnd = False
            isPhraseStart = True

            wpm = 0.0

            if characterCount > 0:
                totalPhraseCount += 1
                totalCharacterCount += characterCount
                wpm = (characterCount / 5) / ((keypress.Timestamp.seconds - phraseStartTimeSeconds) / 60)
                wpms.append(wpm)

            print(f"⏲{wpm:5.1f}", end = '\n')

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

if len(sys.argv) != 2:
  print(f"Usage: {sys.argv[0]} input_file")
  sys.exit(-1)

keypresses = keypresses_pb2.KeyPresses()

# Read the existing address book.
filepath = sys.argv[1]

files = listFilesWithExtension(filepath, "protobuf")

for filename in files:
    f = open(os.path.join(filepath,filename), "rb")
    bytes = f.read()
    keypresses.ParseFromString(bytes)
    f.close()

    VisualizeKeypresses(keypresses)