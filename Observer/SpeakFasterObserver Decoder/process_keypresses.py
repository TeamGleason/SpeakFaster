"""
Processes keypress protobuffers to generate visualized results.
Can generate various statistics (WPM, KSR, Error Rate) as well
as output files capable of being used in other tools.
"""
import os
import sys
import argparse
import datetime
import glob
import jsonpickle
import keypresses_pb2

# Assuming that eye gaze activation faster than 300ms is faster than
# realistically possible.  This is useful for detecting automatic insertion of
# characters as opposed to manually typed characters.  A prime example is when
# predictions are used.  A rapid series of backspace keys followed by rapid
# typing of characters
MIN_GAZE_TIME = datetime.timedelta(milliseconds=300)

# Assume that after 90 seconds of inactivity we are doing a new utterance
LONG_DELTA_TIME = datetime.timedelta(seconds=90)

CONTROL_KEYS = {
    "Left": "↶",  # Back one word
    "Right": "↷",  # Forward one word
    "X": "✂️",  # Cut
    "C": "📄",  # Copy
    "V": "📋",  # Paste
    "Z": "↺",  # Undo
}

CANCEL_KEYS = {
    "Q": "⏸",  # Pause
    "E": "🛑",  # Stop
    "A": "␘",  # Select All, considered reset of thought
}

WINDOWS_KEYS = {
    "A": "🗔",  # Win+A = Action Center
    "S": "🗔",  # Win+S = Search
    "Tab": "🗔",  # Win+Tab = Task View
}

SPECIAL_KEYS = {
    "Space": " ",
    "OemPeriod": ".",
    "Oemcomma": ",",
    "OemQuestion": "?",
    "OemMinus": "-",
    "Oemplus": "=",
    "Oemtilde": "`",
    "Oem1": ";",  # OemSemicolon
    "Oem4": "[",  # OemOpenBrackets
    "Oem5": "\\",  # OemPipe
    "Oem6": "]",  # OemCloseBrackets
    "Oem7": "'",  # OemQuotes
    "Tab": "↦",
    "Left": "↶",
    "Right": "↷",
    "Back": "🠠",
    "Delete": "🠠",
    "Enter": "↩",
    "Return": "↩",
    "LWin": "🗔",
    "LControlKey": "🎛️",
    "LShiftKey": "↑",
    "End": "🔚",
    "Next": "⏭️",
    "Up": "⬆️",
    "Down": "⬇️",
    "PageUp": "⏫",
    "PageDown": "⏬",
    "NumLock": "🔒",
    "LButton, OemClear": "🆑",
    "OemOpenBrackets": "[",
    "OemCloseBrackets": "]",
    "D1": "1",
    "D2": "2",
    "D3": "3",
    "D4": "4",
    "D5": "5",
    "D6": "6",
    "D7": "7",
    "D8": "8",
    "D9": "9",
    "D0": "0",
}
SHIFTED_SPECIAL_KEYS = {
    "D1": "!",
    "D2": "@",
    "D3": "#",
    "D4": "$",
    "D5": "%",
    "D6": "^",
    "D7": "&",
    "D8": "*",
    "D9": "(",
    "D0": ")",
    "OemMinus": "-",
    "Oemplus": "=",
    "Oem1": ":",  # OemSemicolon
    "Oem4": "{",  # OemOpenBrackets
    "Oem5": "|",  # OemPipe
    "Oem6": "}",  # OemCloseBrackets
    "Oem7": '"',  # OemQuotes
    "OemPeriod": ">",
    "Oemcomma": "<",
    "Oemtilde": "~",
    "Back": "🠠",
    "Space": " ",
    "Return": "↩",
    "End": "🔚",
}

# pylint: disable=too-few-public-methods
class Prediction:
    """
    A Prediction is a gaze activated keypress followed by a series of
    automatically generated keypresses. for example, "🠠🠠ELLO " might
    be the prediction provided after typing "HIL".
    """

    def __init__(self, keypresses, current_key_index, total_keyspresses):
        """
        Creates a `Prediction` instance starting at current_key_index.

        The prediction continues up to, but not including, the next gaze initiated keypress.

        Args:
          keypresses: keypresses_pb2 object to be processed
          current_key_index: index into the keypresses object where the prediction begins
          total_keyspresses: size of the keypresses object
        """
        self.length = 0  # the number of keypresses used in the prediction, 8 in the case of "🗩🠠🠠HELLO "
        self.gain = (
            -1  # the number of extra characters contributed to the actual output, 3 in the case of "🗩🠠🠠HELLO "
        )
        self.start_index = current_key_index
        self.end_index = 0
        self.prediction_string = ""
        self.keystrokes = []

        index = current_key_index
        is_next_gaze_initiated = False

        _is_current_gaze_initiated, delta_time = is_key_gaze_initiated(
            keypresses, current_key_index, total_keyspresses
        )

        self.timedelta = delta_time.total_seconds()

        while index < total_keyspresses and not is_next_gaze_initiated:
            current_keypress = keypresses.keyPresses[index]

            self.prediction_string += output_for_keypress(
                current_keypress.KeyPress, False
            )

            # Just keep processing automatic keypresses until next gaze initiated key
            is_next_gaze_initiated, _datetime_delta = is_key_gaze_initiated(
                keypresses, index + 1, total_keyspresses
            )
            index += 1
            self.length += 1

            # Predictions can start with 0 or more backspace characters.
            # After that they are a combination of characters, sometimes
            # including purposely uppercase characters (hence the LShiftKey).
            # Predictions generally conclude with a space key.
            #
            # Examples:
            # 🗩↑I
            # 🗩↑A↑L↑S
            # 🗩🠠🠠🠠🠠↑CUBS
            # 🗩ELLO
            if current_keypress.KeyPress == "Back":
                self.gain -= 1
            elif (
                current_keypress.KeyPress == "LShiftKey"
                or is_character(current_keypress.KeyPress)
                or current_keypress.KeyPress == "Space"
            ):
                self.gain += 1

        self.end_index = index - 1

        for idx in range(self.start_index, self.end_index):
            current_keypress = keypresses.keyPresses[idx]
            self.keystrokes.append(
                {
                    current_keypress.KeyPress,
                    datetime_from_protobuf_timestamp(current_keypress.Timestamp),
                }
            )

    def __str__(self):
        return f"🗩{self.prediction_string}"


# A phrase is defined as a series of keypresses over a period of time
# The phrase may end with it being spoken or not spoken
class Phrase:
    """
    A Phrase is a series keypresses that ends in a termination state.
    Possible termination states are Spoken, Cancelled, or Timeout.
    """

    # pylint: disable=too-many-instance-attributes
    def __init__(self):
        """
        Creates a `Phrase` instance.
        """
        self.start_index = 0  # Index of the first keypress in the phrase
        self.end_index = 0  # Index of the last keypress in the phrase
        self.start_timestamp = None
        self.end_timestamp = None
        # A string used for visualizing the key sequences. It includes
        # the gaze-initiated and machine-predicted characters, backspaces,
        # and so forth.
        self.visualized_string = ""
        self.ending_string = ""
        self.was_spoken = False
        self.was_cancelled = False
        self.was_timeout = False
        self.character_count = 0
        self.backspace_count = 0
        self.delword_count = 0
        self.gaze_keypress_count = 0
        self.machine_keypress_count = 0
        self.predictions = []
        self.keystrokes = []
        self.wpm = 0.0
        self.ksr = 0.0
        self.error = 0.0

    def add_control_key(self, control_key, num_gaze_keypresses):
        """Add a control key (i.e., a key entered with the Ctrl key on).

        Args:
          control_key: The control key to be added. This is the second of
            the keypresses used to enter the control key, represented as
            a KeyPress proto.
          num_gaze_keypresses: Number of gaze keypreses used to enter this
            control key.
        """
        self.visualized_string += CONTROL_KEYS[control_key.KeyPress]
        self.gaze_keypress_count += num_gaze_keypresses
        # TODO(cais): Process control keys including cut, paste, undo, and redo.

    def add_non_control_key(self, keypress, shift_on=False):
        """Add a non-control key (i.e., a key entered without the Ctrl key).

        Args:
          keypress: The non-control key, represented as a KeyPress proto.
          shift_on: Whether the Shift key is held when `key` is entered.
        """
        self.visualized_string += output_for_keypress(
            keypress.KeyPress, shift_on=shift_on)
        self.character_count += 1
        self.gaze_keypress_count += 2 if shift_on else 1
        # TODO(cais): Handle Backspace and other special keys.

    def finalize(self):
        """
        When the phrase is complete, we want to run various calculations for
        WPM, KSR, and Error rate.  We also validate to ensure there are no
        missing Keypresses in the range.
        """
        self.calculate_wpm()
        self.calculate_ksr()
        self.calculate_error()
        self.validate()

        for idx in range(self.start_index, self.end_index):
            current_keypress = KEYPRESSES.keyPresses[idx]
            self.keystrokes.append(
                {
                    current_keypress.KeyPress,
                    datetime_from_protobuf_timestamp(current_keypress.Timestamp),
                }
            )

    def calculate_error(self):
        """
        Error rate relates the number of corrections in comparison to the
        number of keys the user pressed.  Backspace count includes both
        direct backspaces as well as delword (which counts as one backspace).
        Similarly, Gaze KeyPress count includes the keypresses that were done
        via gaze.  For predictions, it will be one gaze keypress.
        """
        if self.was_spoken and self.gaze_keypress_count > 0:
            self.error = (
                self.backspace_count + self.delword_count
            ) / self.gaze_keypress_count

    def calculate_ksr(self):
        """
        KSR is Keystroke Savings Rate, defined as
        (total_chars - actual_num_of_keystrokes) / total_chars
        """

        # The gaze_keypress_count for the phrase includes the two keypresses
        # needed to trigger speech. We don't want to include those in the KSR
        actual_num_of_keystrokes = self.gaze_keypress_count - 2

        if self.was_spoken and self.character_count > 0:
            self.ksr = (
                self.character_count - actual_num_of_keystrokes
            ) / self.character_count

    def calculate_wpm(self):
        """
        WPM is Words per minute, defined as (total_chars / 5) / time
        """
        if self.was_spoken and self.character_count > 1:
            self.wpm = (self.character_count / 5) / (
                (self.end_timestamp - self.start_timestamp).total_seconds() / 60
            )

    def validate(self):
        """
        Runs basic validation to ensure there are no missing keypresses.
        """
        if (
            not self.keypress_count()
            == self.gaze_keypress_count + self.machine_keypress_count
        ):
            raise Exception(
                f"Missing Keypresses KeyPress:{self.keypress_count()} Gaze:{self.gaze_keypress_count} Machine:{self.machine_keypress_count}"
            )

        if not (self.was_cancelled or self.was_spoken or self.was_timeout):
            raise Exception(
                "Phrase end error. Phrase was not Cancelled, Timeout, or Spoken!"
            )

    def cancel(self, ending_string):
        """
        End phrase via Cancellation.
        """
        self.was_cancelled = True
        self.ending_string = ending_string

    def timeout(self):
        """
        End phrase via Timeout.
        """
        self.was_timeout = True
        self.ending_string = "⏰"

    def speak(self):
        """
        End phrase via Speech.
        """
        self.was_spoken = True
        self.ending_string = "💬"

    def keypress_count(self):
        """
        Returns:
            Total number of keypresses used in this phrase.
        """
        return self.end_index - self.start_index + 1

    def __str__(self):
        """
        Returns:
            Formatted string representation of the Phrase.
        """
        return_string = (
            f"[{self.start_index:8}:{self.end_index:8}] "
            + f"Time:{self.end_timestamp} "
            + f"{self.ending_string} "
            + f"␂{self.visualized_string}␃ "
            + f"{self.ending_string}"
        )
        if self.was_spoken:
            return_string += (
                f" ⏲{self.wpm:0.2f} wpm "
                + f"⌨️{self.ksr:0.2f} ksr "
                + f"🤦{self.error:0.2%} error"
            )
        return_string += (
            f" back:{self.backspace_count} "
            + f"delword:{self.delword_count} "
            + f"gaze:{self.gaze_keypress_count} "
            + f"prediction:{len(self.predictions)} "
            + f"chars:{self.character_count}"
        )

        return return_string


# pylint: disable=too-many-branches
# pylint: disable=too-many-statements
# pylint: disable=too-many-locals
def visualize_keypresses(keypresses, args):
    """
    Processes the keypresses object, breaking it down into Phrases.

    Raises:
        Exceptions based on parsing logic errors.
    """
    phrases = []
    current_phrase = None
    is_phrase_start = True
    is_phrase_end = False

    total_keyspresses = len(keypresses.keyPresses)

    current_key_index = 0

    # Assume the first key is gaze initialized.
    while current_key_index < total_keyspresses:
        keypress = keypresses.keyPresses[current_key_index]
        current_timestamp = datetime_from_protobuf_timestamp(keypress.Timestamp)
        is_current_gaze_initialized, _ = is_key_gaze_initiated(
            keypresses, current_key_index, total_keyspresses
        )
        is_next_gaze_initialized, next_character_delta = is_key_gaze_initiated(
            keypresses, current_key_index + 1, total_keyspresses
        )

        if is_phrase_start:
            # print(f"{current_key_index}: new phrase")  # DEBUG
            current_phrase = Phrase()
            current_phrase.start_index = current_key_index
            is_phrase_start = False
            is_phrase_end = False
            current_phrase.start_timestamp = current_timestamp

        if (
            keypress.KeyPress == "LControlKey" or keypress.KeyPress == "RControlKey"
        ) and (
            is_current_gaze_initialized or is_next_gaze_initialized
        ) and current_key_index + 1 < total_keyspresses:
            # TODO How does the user erase the state of the previously spoken phrase
            # before entering the next phrase? Without the state erasure, the previous
            # phrase will be spoken alongside the next one, which is undesirable.
            next_keypress = keypresses.keyPresses[current_key_index + 1]
            if next_keypress.KeyPress == "W":
                # Ctrl-W == Speak
                is_phrase_end = True
                current_key_index += 2
                current_phrase.gaze_keypress_count += 2
                current_phrase.speak()
            elif next_keypress.KeyPress in CANCEL_KEYS:
                # TODO If ctrl-A is followed by ctrl-W, was phrase cancelled?
                is_phrase_end = True
                current_key_index += 2
                current_phrase.gaze_keypress_count += 2
                current_phrase.cancel(CANCEL_KEYS[next_keypress.KeyPress])
            elif next_keypress.KeyPress in CONTROL_KEYS:
                current_phrase.add_control_key(
                    next_keypress, num_gaze_keypresses=2)
                current_key_index += 2
            else:
                # Handle the control key in isolation
                current_phrase.add_non_control_key(keypress, shift_on=False)
                # current_phrase.visualized_string += output_for_keypress(
                #     keypress.KeyPress, False
                # )
                # current_phrase.character_count += 1
                # current_phrase.gaze_keypress_count += 1
                current_key_index += 1
        elif keypress.KeyPress == "LShiftKey":
            if (
                current_key_index + 1 < total_keyspresses
                and keypresses.keyPresses[current_key_index + 1].KeyPress
                != "LShiftKey"
                and keypresses.keyPresses[current_key_index + 1].KeyPress
                != "LControlKey"
            ):
                current_phrase.add_non_control_key(
                    keypresses.keyPresses[current_key_index + 1], shift_on=True)
                # current_phrase.visualized_string += output_for_keypress(
                #     keypresses.keyPresses[current_key_index + 1].KeyPress,
                #     shift_on=True
                # )
                current_key_index += 2
                # current_phrase.character_count += 1
                # current_phrase.gaze_keypress_count += 2
            else:
                current_phrase.add_non_control_key(keypress, shift_on=False)
                # current_phrase.visualized_string += output_for_keypress(
                #     keypress.KeyPress,
                #     shift_on=False
                # )
                # current_phrase.character_count += 1
                current_key_index += 1
                # current_phrase.gaze_keypress_count += 1
        elif is_next_gaze_initialized:
            # next character is gaze initated.
            if keypress.KeyPress == "Back":
                current_phrase.backspace_count += 1
                current_phrase.character_count -= 1
                current_phrase.gaze_keypress_count += 1
            else:
                current_phrase.character_count += 1
                current_phrase.gaze_keypress_count += 1
            # current_phrase.add_non_control_key(keypress, shift_on=False)
            current_phrase.visualized_string += output_for_keypress(
                keypress.KeyPress, shift_on=False
            )
            current_key_index += 1
        else:
            # next character is not gaze initiated.
            if (
                keypress.KeyPress == "LControlKey"
                and current_key_index + 3 < total_keyspresses
                and keypresses.keyPresses[current_key_index + 1].KeyPress == "LShiftKey"
                and keypresses.keyPresses[current_key_index + 2].KeyPress == "Left"
                and keypresses.keyPresses[current_key_index + 3].KeyPress == "Back"
            ):
                # ctrl-shift-left-back == DelWord
                current_phrase.visualized_string += "↞"
                current_key_index += 4
                current_phrase.delword_count += 1
                current_phrase.gaze_keypress_count += 1
                current_phrase.machine_keypress_count += 3
            elif (
                keypress.KeyPress == "LWin"
                and current_key_index + 1 < total_keyspresses
            ):
                # Automated windows hotkeys
                next_keypress = keypresses.keyPresses[current_key_index + 1]
                if next_keypress.KeyPress in WINDOWS_KEYS:
                    is_phrase_end = True
                    current_key_index += 2
                    current_phrase.gaze_keypress_count += 1
                    current_phrase.machine_keypress_count += 1
                    current_phrase.cancel(WINDOWS_KEYS[next_keypress.KeyPress])
                else:
                    raise Exception(
                        f"Unknown windows key combo Win+{next_keypress.KeyPress}"
                    )
            else:
                # Prediction
                current_prediction = Prediction(
                    keypresses, current_key_index, total_keyspresses
                )
                current_key_index += current_prediction.length
                current_phrase.character_count += current_prediction.gain + 1
                current_phrase.gaze_keypress_count += 1
                current_phrase.machine_keypress_count += current_prediction.length - 1

                current_phrase.visualized_string += str(current_prediction)

                current_phrase.predictions.append(current_prediction)

        if next_character_delta > LONG_DELTA_TIME:
            is_phrase_end = True
            current_phrase.timeout()

        if not is_phrase_end and current_key_index >= total_keyspresses:
            # If we have run out of keypresses, but have not otherwise ended
            # the phrase, ensure the phrase is ended
            is_phrase_end = True
            current_phrase.cancel("␘")

        if is_phrase_end:
            # The current_key_index is pointing to the beginning of the next
            # phrase. Grab the timestamp from the keypress just before it,
            # which is the end of the current phrase.
            current_phrase.end_index = current_key_index - 1
            end_keypress = keypresses.keyPresses[current_phrase.end_index]
            current_phrase.end_timestamp = datetime_from_protobuf_timestamp(
                end_keypress.Timestamp
            )
            current_phrase.finalize()

            phrases.append(current_phrase)

            current_phrase = None
            is_phrase_end = False
            is_phrase_start = True

    key_index = 0
    total_gaze_keypress_count = 0
    total_machine_keypress_count = 0
    total_character_count = 0
    total_phrase_keypress_count = 0
    timeout_count = 0
    cancelled_count = 0
    spoken_count = 0
    phrase_count = len(phrases)
    wpms = []

    visualization_string = ""

    for phrase in phrases:
        total_gaze_keypress_count += phrase.gaze_keypress_count
        total_machine_keypress_count += phrase.machine_keypress_count
        total_character_count += phrase.character_count
        total_phrase_keypress_count += phrase.keypress_count()

        if phrase.start_index != key_index:
            raise Exception(
                f"Index mismatch. Expected {key_index} but got {phrase.start_index}"
            )

        key_index = phrase.end_index + 1

        if phrase.was_cancelled:
            cancelled_count += 1
        elif phrase.was_timeout:
            timeout_count += 1
        elif phrase.was_spoken:
            spoken_count += 1
            wpms.append(phrase.wpm)
        else:
            raise Exception(
                "Phrase end error. Phrase was not Cancelled, Timeout, or Spoken!"
            )

        visualization_string += f"{phrase}\n"

    average_wpms, top_wpm = average_wpm(wpms)

    predictions = []
    predictions_count = 0
    average_prediction_length = 0.0
    average_prediction_gain = 0.0

    for phrase in phrases:
        predictions_count += len(phrase.predictions)
        predictions.extend(phrase.predictions)
    for pred in predictions:
        average_prediction_length += pred.length
        average_prediction_gain += pred.gain

    average_prediction_length /= predictions_count
    average_prediction_gain /= predictions_count

    # The totalPhraseKeypressCount is a bug check, it MUST equal
    # totalKeyspresses.  Otherwise we have lost keypresses somehow
    if total_phrase_keypress_count != total_keyspresses:
        raise Exception(
            f"Keypress mismatch, {total_keyspresses - total_phrase_keypress_count} keypresses missing from phrases. PhraseKeypressCount:{total_phrase_keypress_count} KeypressCount:{total_keyspresses}"
        )

    if (
        total_phrase_keypress_count
        != total_gaze_keypress_count + total_machine_keypress_count
    ):
        raise Exception(
            f"Missing Keypresses KeyPress:{total_phrase_keypress_count} Gaze:{total_gaze_keypress_count} Machine:{total_machine_keypress_count}"
        )

    if phrase_count != spoken_count + timeout_count + cancelled_count:
        raise Exception(
            f"Phrase mismatch, {phrase_count - (spoken_count + timeout_count + cancelled_count)} phrases missing."
        )

    if predictions_count != len(predictions):
        raise Exception(
            f"Predictions mismatch, {predictions_count} predicitons but found {len(predictions)}"
        )

    visualization_string += "\n"
    visualization_string += f"🗪[Speak: {spoken_count}, AverageWPM: {average_wpms:5.1f}, TopWPM: {top_wpm:5.1f}]\n"
    visualization_string += f"Total Keypresses: {total_keyspresses} Gaze: {total_gaze_keypress_count} Characters: {total_character_count}\n"
    visualization_string += f"Total Phrases:{phrase_count} Spoken:{spoken_count}({spoken_count/phrase_count:0.2%}) Cancelled:{cancelled_count}({cancelled_count/phrase_count:0.2%}) Timeouts:{timeout_count}({timeout_count/phrase_count:0.2%})\n"
    visualization_string += f"Total Predictions: {predictions_count} Average Length: {average_prediction_length:0.3f} Average Gain: {average_prediction_gain:0.3f}\n"

    predictions_string = jsonpickle.encode(predictions)
    phrases_string = jsonpickle.encode(phrases)

    if args.visualize_path:
        save_string_to_file(args.visualize_path, visualization_string)
        print(f"Visualization saved to {args.visualize_path}")

    if args.prediction_path:
        save_string_to_file(args.prediction_path, predictions_string)
        print(f"Predictions saved to {args.prediction_path}")

    if args.phrases_path:
        save_string_to_file(args.phrases_path, phrases_string)
        print(f"Phrases saved to {args.phrases_path}")


def list_keypresses(keypresses, args):
    """
    Generates basic human readable data from keypresses.
    """
    total_keys_pressed = len(keypresses.keyPresses)

    current_key_index = 0
    gaze_keypress_count = 0
    keypresses_objects = []

    while current_key_index < total_keys_pressed:
        keypress = keypresses.keyPresses[current_key_index]

        is_gaze_typed = False

        is_gaze_typed, delta_timestamp = is_key_gaze_initiated(
            keypresses, current_key_index, total_keys_pressed
        )

        is_next_gaze_typed, _ = is_key_gaze_initiated(
            keypresses, current_key_index + 1, total_keys_pressed
        )

        if is_gaze_typed:
            gaze_keypress_count += 1

        is_long_pause = False
        if delta_timestamp > LONG_DELTA_TIME:
            is_long_pause = True

        keypresses_objects.append(
            {
                "Index": current_key_index,
                "Keypress": keypress.KeyPress,
                "Timestamp": datetime_from_protobuf_timestamp(
                    keypress.Timestamp
                ).isoformat(),
                "Timedelta": delta_timestamp.total_seconds(),
                "Gaze": is_gaze_typed,
                "IsLongPause": is_long_pause,
                "IsCharacter": is_character(keypress.KeyPress),
                "IsNextGazeTyped": not is_next_gaze_typed
            }
        )

        current_key_index += 1

    keypresses_string = jsonpickle.encode(keypresses_objects)

    if args.stream_path:
        save_string_to_file(args.stream_path, keypresses_string)
        print(f"Keypress stream saved to {args.stream_path}")


def average_wpm(wpms):
    """Calculates the average and top wpm from the wpms collection

    Returns:
        average_wpm: float of the average wpm
        top_wpm: float of the highest wpm in the wpms collection
    """
    total = 0.0
    count = 0
    top = 0.0
    average = 0.0
    for wpm in wpms:
        total += wpm
        count += 1
        if wpm > top:
            top = wpm

    if count > 0:
        average = total / count
    return average, top


def is_key_gaze_initiated(keypresses, current_key_index, total_keypress_count):
    """Determines whether a keypress was initiated by gaze or not.

    We assume that keypresses must be more than MIN_GAZE_TIME since the
    prior keypress to be considered gaze initiated.

    Returns:
        is_gaze_initiated: True if the keypress is gaze initiated
        delta_timestamp: Timedelta object from prior to current keypress
    """
    is_gaze_initiated = True
    delta_timestamp = datetime.timedelta(0)

    if 0 < current_key_index < total_keypress_count:
        current_timestamp = datetime_from_protobuf_timestamp(
            keypresses.keyPresses[current_key_index].Timestamp
        )
        previous_timestamp = datetime_from_protobuf_timestamp(
            keypresses.keyPresses[current_key_index - 1].Timestamp
        )
        delta_timestamp = current_timestamp - previous_timestamp

        if delta_timestamp < MIN_GAZE_TIME:
            is_gaze_initiated = False

    return is_gaze_initiated, delta_timestamp


def is_character(keypress):
    """Determines whether the given keypress is a character.

    Returns:
        True if the keypress is a single character (ie: A-Z, 0-9)
        False otherwise
    """
    return len(keypress) == 1


def output_for_keypress(keypress, shift_on):
    """Generates the matching string output for a given keypress.

    Returns:
        String representing the keypre

    Raises:
        Exception: Unhandled keypress
    """
    if is_character(keypress):
        return keypress

    if not shift_on and keypress in SPECIAL_KEYS:
        return SPECIAL_KEYS[keypress]

    if shift_on and keypress in SHIFTED_SPECIAL_KEYS:
        return SHIFTED_SPECIAL_KEYS[keypress]

    print(f"{keypress} not handled, outputting 👽")
    return "👽"


def datetime_from_protobuf_timestamp(protobuf_timestamp):
    """Converts a protobuf_timestamp into a standard python datetime object.

    Returns:
        python datetime object
    """
    return datetime.datetime.fromtimestamp(
        protobuf_timestamp.seconds + protobuf_timestamp.nanos / 1e9
    )


def load_keypresses_from_directory(keypress_directorypath):
    """Loads multiple keypress protobuffers from keypress_directorypath.

    Returns:
        A keypresses_pb2 object
    """
    files = glob.glob(os.path.join(keypress_directorypath, "*." + "protobuf"))

    sorted_files = sorted(files)

    keypresses = keypresses_pb2.KeyPresses()
    merged_keypresses = keypresses_pb2.KeyPresses()
    for filename in sorted_files:
        with open(os.path.join(keypress_directorypath, filename), "rb") as file:
            keypress_protobuf_bytes = file.read()
            keypresses.ParseFromString(keypress_protobuf_bytes)

        merged_keypresses.keyPresses.extend(keypresses.keyPresses)

    merged_keypresses.keyPresses.sort(
        key=lambda x: datetime_from_protobuf_timestamp(x.Timestamp)
    )

    return merged_keypresses


def load_keypresses_from_file(keypress_filepath):
    """Loads keypress protobuffer from keypress_filepath.

    Returns:
        A keypresses_pb2 object
    """
    keypresses = keypresses_pb2.KeyPresses()

    with open(keypress_filepath, "rb") as file:
        keypress_protobuf_bytes = file.read()
        keypresses.ParseFromString(keypress_protobuf_bytes)

    return keypresses


def save_string_to_file(output_filepath, output_string):
    """Saves the output_string to output_filepath."""
    with open(output_filepath, "wb") as file:
        file.write(output_string.encode())


def parse_arguments():
    """Parses command line arguments.

    Returns:
        is_valid: True if the parsing was successful.
        args: the parsed arguments object.
    """
    is_valid = True
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "-f",
        "--file",
        type=str,
        help="Path to keypresses protobuf file.",
        dest="input_filepath",
    )
    parser.add_argument(
        "-d",
        "--dir",
        type=str,
        help="Path to directory containing one or more keypresses protobuf files.",
        dest="input_directory_path",
    )
    parser.add_argument(
        "--stream",
        type=str,
        help="Path to output json stream of keypresses.",
        dest="stream_path",
    )
    parser.add_argument(
        "--visualize",
        type=str,
        help="Path to output visualized results.",
        dest="visualize_path",
    )
    parser.add_argument(
        "--predictions",
        type=str,
        help="Path to output json prediction results.",
        dest="prediction_path",
    )
    parser.add_argument(
        "--phrases",
        type=str,
        help="Path to output json phrase results.",
        dest="phrases_path",
    )

    # Parse and print the results
    args = parser.parse_args()

    # Must specify input file or directory, but not both
    if (args.input_directory_path is None) == (args.input_filepath is None):
        print("Must specify either --dir or --file.")
        parser.print_help()
        is_valid = False

    return is_valid, args


is_valid_arguments, parsed_args = parse_arguments()

if not is_valid_arguments:
    sys.exit()

KEYPRESSES = None
if parsed_args.input_directory_path:
    KEYPRESSES = load_keypresses_from_directory(parsed_args.input_directory_path)
elif parsed_args.input_filepath:
    KEYPRESSES = load_keypresses_from_file(parsed_args.input_filepath)

if not KEYPRESSES:
    print("Failed loading keypresses!")
    sys.exit()

list_keypresses(KEYPRESSES, parsed_args)
visualize_keypresses(KEYPRESSES, parsed_args)

print("Processing Complete")
