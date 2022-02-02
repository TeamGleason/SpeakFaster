import {AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, OnInit, QueryList, ViewChildren} from '@angular/core';
import {Subject, Subscription} from 'rxjs';
import {keySequenceEndsWith, limitStringLength} from 'src/utils/text-utils';
import {createUuid} from 'src/utils/uuid';

import {injectKeys, updateButtonBoxesForElements, updateButtonBoxesToEmpty} from '../../utils/cefsharp';
import {isPlainAlphanumericKey, isTextContentKey} from '../../utils/keyboard-utils';
import {ExternalEventsComponent, KeypressListener, repeatVirtualKey, VIRTUAL_KEY} from '../external/external-events.component';
import {SpeakFasterService} from '../speakfaster-service';
import {AbbreviationSpec, InputAbbreviationChangedEvent} from '../types/abbreviation';
import {TextEntryEndEvent} from '../types/text-entry';

export enum State {
  PRE_CHOOSING_EXPANSION = 'PRE_CHOOSING_EXPANSION',
  CHOOSING_EXPANSION = 'CHOOSING_EXPANSION',
  SPELLING = 'SPELLING',
  CHOOSING_EDIT_TARGET = 'CHOOSING_EDIT_TARGET',
  CHOOSING_TOKEN = 'CHOOSING_TOKEN',
  CHOOSING_TOKEN_REPLACEMENT = 'CHOOSING_TOKEN_REPLACEMENT',
}

// Abbreviation expansion can be triggered by entering the abbreviation followed
// by typing two consecutive spaces in the external app.
// TODO(#49): This can be generalized and made configurable.
// TODO(#49): Explore continuous AE without explicit trigger, perhaps
// added by heuristics for detecting abbreviations vs. words.
export const ABBRVIATION_EXPANSION_TRIGGER_COMBO_KEY: string[] =
    [VIRTUAL_KEY.SPACE, VIRTUAL_KEY.SPACE];

@Component({
  selector: 'app-abbreviation-component',
  templateUrl: './abbreviation.component.html',
  providers: [SpeakFasterService],
})
export class AbbreviationComponent implements OnDestroy, OnInit, AfterViewInit {
  private static readonly _NAME = 'AbbreviationComponent';
  private static readonly _POST_SELECTION_DELAY_MILLIS = 500;
  private static readonly _TOKEN_REPLACEMENT_KEYBOARD_CALLBACK_NAME =
      'AbbreviationComponent_TokenReplacementKeyboardCallbackName';
  private static readonly _MAX_NUM_REPLACEMENT_TOKENS = 6;
  private readonly instanceId =
      AbbreviationComponent._NAME + '_' + createUuid();
  private keypressListener: KeypressListener = this.listenToKeypress.bind(this);
  @Input() contextStrings!: string[];
  @Input() textEntryEndSubject!: Subject<TextEntryEndEvent>;
  @Input()
  abbreviationExpansionTriggers!: Subject<InputAbbreviationChangedEvent>;
  @Input() abbreviationExpansionEditingTrigger!: Subject<boolean>;

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

  @ViewChildren('abbreviationOption')
  abbreviationOptionElements!: QueryList<ElementRef<HTMLElement>>;

  @ViewChildren('tokenInput')
  tokenInputElements!: QueryList<ElementRef<HTMLElement>>;
  private tokenInput: HTMLInputElement|null = null;

  state = State.PRE_CHOOSING_EXPANSION;
  readonly editTokens: string[] = [];
  readonly replacementTokens: string[] = [];
  selectedTokenIndex: number|null = null;
  manualTokenString: string = '';

  abbreviation: AbbreviationSpec|null = null;
  requestOngoing: boolean = false;
  responseError: string|null = null;
  abbreviationOptions: string[] = [];
  receivedEmptyOptions: boolean = false;
  private _selectedAbbreviationIndex: number = -1;
  private abbreviationExpansionTriggersSubscription?: Subscription;

  constructor(
      public speakFasterService: SpeakFasterService,
      private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    ExternalEventsComponent.registerKeypressListener(this.keypressListener);
    this.abbreviationExpansionTriggersSubscription =
        this.abbreviationExpansionTriggers.subscribe(
            (event: InputAbbreviationChangedEvent) => {
              if (!event.requestExpansion) {
                return;
              }
              this.abbreviation = event.abbreviationSpec;
              this.expandAbbreviation();
            });
  }

  ngAfterViewInit() {
    this.clickableButtons.changes.subscribe(
        (queryList: QueryList<ElementRef>) => {
          updateButtonBoxesForElements(this.instanceId, queryList);
        });
  }

  ngOnDestroy() {
    ExternalEventsComponent.unregisterKeypressListener(this.keypressListener);
    if (this.abbreviationExpansionTriggersSubscription) {
      this.abbreviationExpansionTriggersSubscription.unsubscribe();
    }
    updateButtonBoxesToEmpty(this.instanceId);
  }

  public listenToKeypress(keySequence: string[], reconstructedText: string):
      void {
    if (this.state === State.PRE_CHOOSING_EXPANSION) {
      if (keySequenceEndsWith(
              keySequence, ABBRVIATION_EXPANSION_TRIGGER_COMBO_KEY) &&
          reconstructedText.trim().length > 0) {
        let spaceIndex = reconstructedText.length - 1;
        while (reconstructedText[spaceIndex] === ' ' && spaceIndex >= 0) {
          spaceIndex--;
        }
        while (reconstructedText[spaceIndex] !== ' ' && spaceIndex >= 0) {
          spaceIndex--;
        }
        let text = reconstructedText.slice(spaceIndex + 1);
        let precedingText: string|undefined = spaceIndex > 0 ?
            reconstructedText.slice(0, spaceIndex).trim() :
            undefined;
        if (precedingText === '') {
          precedingText = undefined;
        }
        const eraserLength = text.length;
        text = text.trim();
        text = text.replace(/\n/g, '');
        if (text.length > 0) {
          // An abbreviation expansion has been triggered.
          // TODO(#49): Support keywords in abbreviation (e.g.,
          // "this event is going very well" --> "this e igvw")
          const abbreviationSpec: AbbreviationSpec = {
            tokens: text.split('').map(char => ({
                                         value: char,
                                         isKeyword: false,
                                       })),
            readableString: text,
            eraserSequence:
                repeatVirtualKey(VIRTUAL_KEY.BACKSPACE, eraserLength),
            precedingText,
            lineageId: createUuid(),
          };
          console.log('Abbreviation expansion triggered:', abbreviationSpec);
          this.abbreviationExpansionTriggers.next(
              {abbreviationSpec, requestExpansion: true});
          return;
        }
      }
    } else if (this.state === State.CHOOSING_EXPANSION) {
      // TODO(cais): Add unit test.
      // TODO(cais): Guard against irrelevant keys.
      this.state = State.SPELLING;
    }
  }

  onTryAgainButtonClicked(event: Event) {
    this.expandAbbreviation();
  }

  get selectedAbbreviationIndex() {
    return this._selectedAbbreviationIndex;
  }

  onEditButtonClicked(event: Event) {
    this.state = State.CHOOSING_EDIT_TARGET;
  }

  onExpansionOptionButtonClicked(event: {
    phraseText: string; phraseIndex: number
  }) {
    if (this.state === State.CHOOSING_EXPANSION ||
        this.state == State.SPELLING) {
      this.selectExpansionOption(event.phraseIndex, /* toInjectKeys= */ true);
    } else if (this.state === State.CHOOSING_EDIT_TARGET) {
      this.editTokens.splice(0);
      this.editTokens.push(
          ...this.abbreviationOptions[event.phraseIndex].split(' '));
      this.selectedTokenIndex = null;
      this.state = State.CHOOSING_TOKEN;
    }
  }

  onSpeakOptionButtonClicked(event: {phraseText: string, phraseIndex: number}) {
    if (this.state !== State.CHOOSING_EXPANSION) {
      return;
    }
    this.selectExpansionOption(
        event.phraseIndex, /* toInjectKeys= */ true,
        /* toTriggerInAppTextToSpeech= */ true);
  }

  onEditTokenButtonClicked(event: Event, index: number) {
    if (this.state !== State.CHOOSING_TOKEN) {
      return;
    }
    const tokensIncludingMask: string[] = this.editTokens.slice();
    tokensIncludingMask[index] = '_';
    const phraseWithMask = tokensIncludingMask.join(' ');
    const maskInitial = this.editTokens[index][0];
    const speechContent = this.contextStrings[this.contextStrings.length - 1];
    this.selectedTokenIndex = index;
    this.speakFasterService.fillMask(speechContent, phraseWithMask, maskInitial)
        .subscribe(
            data => {
              this.replacementTokens.splice(0);
              const replacements = data.results.slice();
              const originalToken = this.editTokens[this.selectedTokenIndex!];
              if (replacements.indexOf(originalToken) !== -1) {
                replacements.splice(replacements.indexOf(originalToken), 1);
              }
              this.replacementTokens.push(...replacements);
              if (this.replacementTokens.length >
                  AbbreviationComponent._MAX_NUM_REPLACEMENT_TOKENS) {
                this.replacementTokens.splice(
                    AbbreviationComponent._MAX_NUM_REPLACEMENT_TOKENS);
              }
              this.state = State.CHOOSING_TOKEN_REPLACEMENT;
            },
            error => {
                // TODO(cais): Handle fill mask error.
                // TODO(cais): Provide exit.
            });
  }

  private handleKeyboardEventForReplacemenToken(event: KeyboardEvent): boolean {
    if (isPlainAlphanumericKey(event, 'Enter')) {
      if (this.manualTokenString.trim().length > 0) {
        this.emitExpansionWithTokenReplacement(this.manualTokenString.trim());
        return true;
      } else if (this.selectedTokenIndex !== null) {
        // Use the original.
        this.emitExpansionWithTokenReplacement(
            this.editTokens[this.selectedTokenIndex]);
        return true;
      }
    } else if (isTextContentKey(event)) {
      this.manualTokenString += event.key.toLocaleLowerCase();
      return true;
    } else if (isPlainAlphanumericKey(event, 'Backspace')) {
      if (this.manualTokenString.length > 0) {
        this.manualTokenString =
            this.manualTokenString.slice(0, this.manualTokenString.length - 1);
        return true;
      }
    }
    return false;
  }

  onReplacementTokenButtonClicked(event: Event, index: number) {
    // Reconstruct the phrase with the replacement.
    this.emitExpansionWithTokenReplacement(this.replacementTokens[index]);
  }

  onNewAbbreviationSpec(abbreviationSpec: AbbreviationSpec) {
    this.abbreviationExpansionTriggers.next(
        {abbreviationSpec, requestExpansion: true});
  }

  private emitExpansionWithTokenReplacement(replacementToken: string) {
    // Reconstruct the phrase with the replacement.
    const tokens: string[] = this.editTokens.slice();
    tokens[this.selectedTokenIndex!] = replacementToken;
    this.textEntryEndSubject.next({
      text: tokens.join(' '),
      timestampMillis: Date.now(),
      isFinal: true,
    });
    // TODO(cais): Prevent selection in gap state.
    setTimeout(() => this.resetState(), 1000);
  }

  private selectExpansionOption(
      index: number, toInjectKeys: boolean,
      toTriggerInAppTextToSpeech: boolean = false) {
    if (this._selectedAbbreviationIndex === index || !this.abbreviation) {
      return;
    }
    this._selectedAbbreviationIndex = index;
    let numKeypresses = 0;
    numKeypresses = this.abbreviation.readableString.length + 1;
    if (this.abbreviation.triggerKeys != null) {
      numKeypresses += this.abbreviation.triggerKeys.length;
    }
    const text = this.abbreviationOptions[this._selectedAbbreviationIndex];
    this.textEntryEndSubject.next({
      text,
      timestampMillis: Date.now(),
      isFinal: true,
      numKeypresses,
      numHumanKeypresses: numKeypresses,
      inAppTextToSpeechAudioConfig:
          toTriggerInAppTextToSpeech ? {volume_gain_db: 0} : undefined,
    });
    if (toInjectKeys) {
      const injectedKeys: Array<string|VIRTUAL_KEY> =
          this.abbreviation!.eraserSequence || [];
      injectedKeys.push(...text.split(''));
      injectedKeys.push(VIRTUAL_KEY.SPACE);  // Append a space at the end.
      injectKeys(injectedKeys);
    }
    // TODO(cais): Prevent selection in gap state.
    setTimeout(
        () => this.resetState(),
        AbbreviationComponent._POST_SELECTION_DELAY_MILLIS);
  }

  private resetState() {
    this.abbreviation = null;
    this.requestOngoing = false;
    this.responseError = null;
    if (this.abbreviationOptions.length > 0) {
      this.abbreviationOptions.splice(0);
    }
    this._selectedAbbreviationIndex = -1;
    this.editTokens.splice(0);
    this.replacementTokens.splice(0);
    this.manualTokenString = '';
    this.state = State.PRE_CHOOSING_EXPANSION;
    this.cdr.detectChanges();
  }

  private expandAbbreviation() {
    if (this.abbreviation === null) {
      this.responseError = 'Cannot expand abbreviation: empty abbreviation';
      return;
    }
    this.abbreviationOptions = [];
    this.requestOngoing = true;
    this.responseError = null;
    this.receivedEmptyOptions = false;
    const LIMIT_TURNS = 2;
    const LIMIT_CONTEXT_TURN_LENGTH = 60
    const usedContextStrings: string[] = [...this.contextStrings.map(
        contextString =>
            limitStringLength(contextString, LIMIT_CONTEXT_TURN_LENGTH))];
    if (usedContextStrings.length > LIMIT_TURNS) {
      usedContextStrings.splice(0, usedContextStrings.length - LIMIT_TURNS);
    }
    // TODO(#49): Limit by token length?
    const numSamples = this.getNumSamples(this.abbreviation);
    const usedContextString = usedContextStrings.join('|');
    console.log(
        `Calling expandAbbreviation() (numSamples=${numSamples}):` +
        `context='${usedContextString}'; ` +
        `abbreviation=${JSON.stringify(this.abbreviation)}`);
    this.speakFasterService
        .expandAbbreviation(
            usedContextString, this.abbreviation, numSamples,
            this.abbreviation.precedingText)
        .subscribe(
            data => {
              this.requestOngoing = false;
              if (data.exactMatches != null) {
                this.abbreviationOptions.push(...data.exactMatches);
              }
              this.state = State.CHOOSING_EXPANSION;
              this.receivedEmptyOptions = this.abbreviationOptions.length === 0;
              this.cdr.detectChanges();
            },
            error => {
              this.requestOngoing = false;
              this.receivedEmptyOptions = false;
              this.responseError = error.message;
              this.cdr.detectChanges();
            });
    this.cdr.detectChanges();
  }

  /** Heuristics about the num_samples to use when requesting AE from server. */
  private getNumSamples(abbreviationSpec: AbbreviationSpec|null) {
    if (abbreviationSpec === null) {
      return 128;
    }
    let maxAbbrevLength = 0;
    for (const token of abbreviationSpec.tokens) {
      if (!token.isKeyword && token.value.length > maxAbbrevLength) {
        maxAbbrevLength = token.value.length;
      }
    }
    return maxAbbrevLength > 5 ? 256 : 128;
  }
}
