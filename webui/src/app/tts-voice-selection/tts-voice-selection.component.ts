/**
 * Component for selection of TTS voice from the browser API.
 *
 * The options are based on `speechSynthesis.getVoices()`.
 */
import {AfterViewInit, Component, ElementRef, OnDestroy, OnInit, QueryList, ViewChildren} from '@angular/core';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {getAppSettings, setGenericTtsVoiceName} from '../settings/settings';
import {DEFAULT_LANGUAGE_CODE} from '../text-to-speech/text-to-speech.component';

const TEST_UTTERANCE_TEXT = 'This is a test sentence.';

/**
 * Set the voice of a SpeechSynthesisUtterance based on app settings.
 *
 * Will be no-op if no generic TTS voice name is set or the SpeechSynthesisVoice
 * of the specified voice name is unavailable.
 *
 * @param utterance The utterance of which the TTS voice will be set.
 */
export async function setUtteranceVoice(utterance: SpeechSynthesisUtterance) {
  const voiceName = (await getAppSettings()).genericTtsVoiceName;
  if (voiceName === undefined) {
    return;
  }
  const voices = window.speechSynthesis.getVoices().filter(voice => {
    return voice.name === voiceName;
  });
  if (voices.length === 0) {
    return;
  }
  utterance.voice = voices[0];
}

@Component({
  selector: 'app-tts-voice-selection-component',
  templateUrl: './tts-voice-selection.component.html',
})
export class TtsVoiceSelectionComponent implements OnInit, AfterViewInit,
                                                   OnDestroy {
  private static readonly _NAME = 'TtsVoiceSelectionComponent';

  private readonly instanceId =
      TtsVoiceSelectionComponent._NAME + '_' + createUuid();

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;
  private selectedVoiceName: string|undefined = undefined;
  private availableVoiceNames: string[] = [];
  private _selectedIndex: number = 0;

  ngOnInit() {
    getAppSettings().then(appSettings => {
      this.selectedVoiceName = appSettings.genericTtsVoiceName;
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        this.handleAvailableVoiceNames(voices);
        return;
      }
      window.speechSynthesis.onvoiceschanged = () => {
        this.handleAvailableVoiceNames(window.speechSynthesis.getVoices());
      };
    });
  }

  ngAfterViewInit() {
    updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    this.clickableButtons.changes.subscribe(
        (queryList: QueryList<ElementRef>) => {
          updateButtonBoxesForElements(this.instanceId, queryList);
        });
  }

  ngOnDestroy() {
    updateButtonBoxesToEmpty(this.instanceId);
    window.speechSynthesis.onvoiceschanged = null;
  }

  private handleAvailableVoiceNames(voices: SpeechSynthesisVoice[]) {
    const matchingLangVoices =
        window.speechSynthesis.getVoices().filter(voice => {
          return voice.lang.toLocaleLowerCase() ===
              DEFAULT_LANGUAGE_CODE.toLocaleLowerCase();
        });
    for (let i = 0; i < matchingLangVoices.length; ++i) {
      const voice = matchingLangVoices[i];
      this.availableVoiceNames.push(voice.name);
      if (this.selectedVoiceName !== undefined &&
          voice.name === this.selectedVoiceName) {
        this._selectedIndex = i;
      }
    }
  }

  get numAvailableTtsVoices(): number {
    return this.availableVoiceNames.length;
  }

  get selectedTtsVoiceName(): string|null {
    if (this.availableVoiceNames.length === 0 ||
        this._selectedIndex >= this.availableVoiceNames.length) {
      return null;
    }
    return this.availableVoiceNames[this._selectedIndex];
  }

  get selectedIndex(): number {
    return this._selectedIndex;
  }

  get isPrevButtonDisabled(): boolean {
    return this.availableVoiceNames.length === 0 || this.selectedIndex === 0;
  }

  get isNextButtonDisabled(): boolean {
    return this.availableVoiceNames.length === 0 ||
        this.selectedIndex === this.availableVoiceNames.length - 1;
  }

  onPrevButtonClicked(event: Event) {
    if (this.availableVoiceNames.length === 0) {
      return;
    }
    this._selectedIndex--;
    if (this._selectedIndex < 0) {
      this._selectedIndex = 0;
    }
    this.saveVoiceSelection();
  }

  onNextButtonClicked(event: Event) {
    if (this.availableVoiceNames.length === 0) {
      return;
    }
    this._selectedIndex++;
    if (this._selectedIndex >= this.availableVoiceNames.length) {
      this._selectedIndex = this.availableVoiceNames.length - 1;
    }
    this.saveVoiceSelection();
  }

  async onTestButtonClicked(event: Event) {
    const utterance = new SpeechSynthesisUtterance(TEST_UTTERANCE_TEXT);
    await setUtteranceVoice(utterance);
    window.speechSynthesis.speak(utterance);
  }

  private saveVoiceSelection() {
    setGenericTtsVoiceName(this.availableVoiceNames[this._selectedIndex]);
  }
}
