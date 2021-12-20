import {AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnInit, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';
import {limitStringLength} from 'src/utils/text-utils';
import {createUuid} from 'src/utils/uuid';

import {injectKeys, updateButtonBoxesForElements} from '../../utils/cefsharp';
import {VIRTUAL_KEY} from '../external/external-events.component';
import {isPlainAlphanumericKey, isTextContentKey} from '../../utils/keyboard-utils';
import {KeyboardComponent} from '../keyboard/keyboard.component';
import {SpeakFasterService} from '../speakfaster-service';
import {AbbreviationSpec, InputAbbreviationChangedEvent} from '../types/abbreviation';
import {TextEntryEndEvent} from '../types/text-entry';

enum State {
  CHOOSING_EXPANSION = 'CHOOSING_EXPANSION',
  CHOOSING_EDIT_TARGET = 'CHOOSING_EDIT_TARGET',
  CHOOSING_TOKEN = 'CHOOSING_TOKEN',
  CHOOSING_TOKEN_REPLACEMENT = 'CHOOSING_TOKEN_REPLACEMENT',
}

@Component({
  selector: 'app-abbreviation-component',
  templateUrl: './abbreviation.component.html',
  providers: [SpeakFasterService],
})
export class AbbreviationComponent implements OnInit, AfterViewInit {
  private static readonly _NAME = 'AbbreviationComponent';
  private static readonly _POST_SELECTION_DELAY_MILLIS = 500;
  private static readonly _TOKEN_REPLACEMENT_KEYBOARD_CALLBACK_NAME =
      'AbbreviationComponent_TokenReplacementKeyboardCallbackName';
  private static readonly _MAX_NUM_REPLACEMENT_TOKENS = 6;
  private readonly instanceId =
      AbbreviationComponent._NAME + '_' + createUuid();
  @Input() contextStrings!: string[];
  @Input() textEntryEndSubject!: Subject<TextEntryEndEvent>;
  @Input()
  abbreviationExpansionTriggers!: Subject<InputAbbreviationChangedEvent>;
  @Input() abbreviationExpansionEditingTrigger!: Subject<boolean>;
  @Input() isSpelling: boolean = false;

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

  @ViewChildren('abbreviationOption')
  abbreviationOptionElements!: QueryList<ElementRef<HTMLElement>>;

  @ViewChildren('tokenInput')
  tokenInputElements!: QueryList<ElementRef<HTMLElement>>;
  private tokenInput: HTMLInputElement|null = null;

  state = State.CHOOSING_EXPANSION;
  readonly editTokens: string[] = [];
  readonly replacementTokens: string[] = [];
  selectedTokenIndex: number|null = null;
  manualTokenString: string = '';

  abbreviation: AbbreviationSpec|null = null;
  requestOngoing: boolean = false;
  responseError: string|null = null;
  abbreviationOptions: string[] = [];
  private _selectedAbbreviationIndex: number = -1;

  constructor(
      public speakFasterService: SpeakFasterService,
      private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    KeyboardComponent.registerCallback(
        AbbreviationComponent._NAME, this.baseKeyboardHandler.bind(this));
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
          updateButtonBoxesForElements(
              AbbreviationComponent._NAME + this.instanceId, queryList);
        });
    // console.log(this.tokenInputElements);  // DEBUG
    // for (const element of this.tokenInputElements) {
    //   console.log('element:', element);
    // }
    // console.log('tokenInput=', this.tokenInput);  // DEBUG
  }

  baseKeyboardHandler(event: KeyboardEvent): boolean {
    if (event.altKey || event.metaKey) {
      return false;
    }
    const keyIndex = event.keyCode - 49;
    // Ctrl E or Enter activates AE.
    // Ctrl Q clears all the expansion options (if any).
    // if ((event.ctrlKey && event.key.toLocaleLowerCase() === 'e') ||
    //     (isPlainAlphanumericKey(event, 'Enter', false))) {
    //   console.log(this.tokenInputElements);  // DEBUG
    //   this.expandAbbreviation();
    //   return true;
    // }
    // TODO(cais): Move this logic to abbreviation-editing-component.

    if (event.ctrlKey && event.key.toLocaleLowerCase() === 'q') {
      this.abbreviationOptions.splice(0);
      return true;
    } else if (
        event.shiftKey && keyIndex >= 0 &&
        keyIndex < this.abbreviationOptions.length) {
      this.selectExpansionOption(keyIndex, /* toInjectKeys= */ true);
      return true;
    }
    return false;
  }

  get selectedAbbreviationIndex() {
    return this._selectedAbbreviationIndex;
  }

  onEditButtonClicked(event: Event) {
    this.state = State.CHOOSING_EDIT_TARGET;
  }

  onExpansionOptionButtonClicked(event: Event, index: number) {
    if (this.state === 'CHOOSING_EXPANSION') {
      this.selectExpansionOption(index, /* toInjectKeys= */ true);
    } else if (this.state === 'CHOOSING_EDIT_TARGET') {
      this.editTokens.splice(0);
      this.editTokens.push(...this.abbreviationOptions[index].split(' '));
      this.selectedTokenIndex = null;
      this.state = State.CHOOSING_TOKEN;
    }
  }

  onSpeakOptionButtonClicked(event: Event, index: number) {
    throw new Error('Not implemented yet');
    // TODO(#49): Implement key injection with TTS trigger.
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
              KeyboardComponent.registerCallback(
                  AbbreviationComponent
                      ._TOKEN_REPLACEMENT_KEYBOARD_CALLBACK_NAME,
                  this.handleKeyboardEventForReplacemenToken.bind(this));
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

  private emitExpansionWithTokenReplacement(replacementToken: string) {
    // Reconstruct the phrase with the replacement.
    const tokens: string[] = this.editTokens.slice();
    tokens[this.selectedTokenIndex!] = replacementToken;
    this.textEntryEndSubject.next({
      text: tokens.join(' '),
      timestampMillis: Date.now(),
      isFinal: true,
    });
    KeyboardComponent.unregisterCallback(
        AbbreviationComponent._TOKEN_REPLACEMENT_KEYBOARD_CALLBACK_NAME);
    // TODO(cais): Prevent selection in gap state.
    setTimeout(() => this.resetState(), 1000);
  }

  private selectExpansionOption(index: number, toInjectKeys: boolean) {
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
    this.state = State.CHOOSING_EXPANSION;
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
    const LIMIT_TURNS = 2;
    const LIMIT_CONTECT_TURN_LENGTH = 60
    const usedContextStrings = [...this.contextStrings.map(
        contextString =>
            limitStringLength(contextString, LIMIT_CONTECT_TURN_LENGTH))];
    if (usedContextStrings.length > LIMIT_TURNS) {
      usedContextStrings.splice(0, usedContextStrings.length - LIMIT_TURNS);
    }
    // TODO(#49): Limit by token length?
    const numSamples = this.getNumSamples(this.abbreviation);
    const usedContextString = usedContextStrings.join('|');
    console.log(
        `Calling expandAbbreviation() (numSamples=${numSamples}):` +
            `context='${usedContextString}'; abbreviation=`,
        this.abbreviation);
    this.speakFasterService
        .expandAbbreviation(usedContextString, this.abbreviation, numSamples)
        .subscribe(
            data => {
              this.requestOngoing = false;
              if (data.exactMatches != null) {
                this.abbreviationOptions = data.exactMatches;
                this.cdr.detectChanges();
              }
            },
            error => {
              this.requestOngoing = false;
              this.responseError = error.message;
              this.cdr.detectChanges();
            });
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
