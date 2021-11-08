import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnInit, Output, QueryList, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';

import {updateButtonBoxForHtmlElements} from '../../utils/cefsharp';
import {isPlainAlphanumericKey, isTextContentKey} from '../../utils/keyboard-utils';
import {KeyboardComponent} from '../keyboard/keyboard.component';
import {SpeakFasterService} from '../speakfaster-service';
import {AbbreviationExpansionSelectionEvent, AbbreviationSpec, InputAbbreviationChangedEvent} from '../types/abbreviations';

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
  private static readonly _TOKEN_REPLACEMENT_KEYBOARD_CALLBACK_NAME =
      'AbbreviationComponent_TokenReplacementKeyboardCallbackName';


  @Input() endpoint!: string;
  @Input() accessToken!: string;
  @Input() contextStrings!: string[];
  @Input()
  abbreviationExpansionTriggers!: Subject<InputAbbreviationChangedEvent>;
  @Input() abbreviationExpansionEditingTrigger!: Subject<boolean>;
  @Input() isSpelling: boolean = false;

  @Output()
  abbreviationExpansionSelected:
      EventEmitter<AbbreviationExpansionSelectionEvent> = new EventEmitter();

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

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

  constructor(private speakFasterService: SpeakFasterService) {}

  ngOnInit() {
    KeyboardComponent.registerCallback(
        AbbreviationComponent._NAME, this.baseKeyboardHandler.bind(this));
    this.abbreviationExpansionTriggers.subscribe(
        (event: InputAbbreviationChangedEvent) => {
          this.abbreviation = event.abbreviationSpec;
          if (event.triggerExpansion) {
            this.expandAbbreviation();
          }
        });
  }

  ngAfterViewInit() {
    this.clickableButtons.changes.subscribe(
        (queryList: QueryList<ElementRef>) => {
          setTimeout(() => {
            updateButtonBoxForHtmlElements(
                AbbreviationComponent._NAME, queryList);
          }, 20);
          // TODO(cais): Can we get rid of this ugly hack? The position of the
          // elements change during layout.
        });
  }

  baseKeyboardHandler(event: KeyboardEvent): boolean {
    if (event.altKey || event.metaKey) {
      return false;
    }
    const keyIndex = event.keyCode - 49;
    // Ctrl E or Enter activates AE.
    // Ctrl Q clears all the expansion options (if any).
    if ((event.ctrlKey && event.key.toLocaleLowerCase() === 'e') ||
        (isPlainAlphanumericKey(event, 'Enter', false))) {
      this.expandAbbreviation();
      return true;
    } else if (event.ctrlKey && event.key.toLocaleLowerCase() === 'q') {
      this.abbreviationOptions.splice(0);
      return true;
    } else if (
        event.shiftKey && keyIndex >= 0 &&
        keyIndex < this.abbreviationOptions.length) {
      this.selectExpansionOption(keyIndex);
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

  onExpansionOptionButtonSelectedForEditing(event: Event, index: number) {
    if (this.state === 'CHOOSING_EDIT_TARGET') {
      this.editTokens.splice(0);
      this.editTokens.push(...this.abbreviationOptions[index].split(' '));
      this.selectedTokenIndex = null;
      this.state = State.CHOOSING_TOKEN;
    }
  }

  onExpansionOptionButtonClicked(event: Event, index: number) {
    if (this.state === 'CHOOSING_EXPANSION') {
      this.selectExpansionOption(index);
    }
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
    this.speakFasterService
        .fillMask(
            this.endpoint, this.accessToken, speechContent, phraseWithMask,
            maskInitial)
        .subscribe(
            data => {
              this.replacementTokens.splice(0);
              const replacements = data.results.slice();
              const originalToken = this.editTokens[this.selectedTokenIndex!];
              if (replacements.indexOf(originalToken) !== -1) {
                replacements.splice(replacements.indexOf(originalToken), 1);
              }
              this.replacementTokens.push(...replacements);
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
    this.abbreviationExpansionSelected.emit({
      expansionText: tokens.join(' '),
    });
    KeyboardComponent.unregisterCallback(
        AbbreviationComponent._TOKEN_REPLACEMENT_KEYBOARD_CALLBACK_NAME);
    // TODO(cais): Prevent selection in gap state.
    setTimeout(() => this.resetState(), 1000);
  }

  private selectExpansionOption(index: number) {
    if (this._selectedAbbreviationIndex === index) {
      return;
    }
    this._selectedAbbreviationIndex = index;
    this.abbreviationExpansionSelected.emit({
      expansionText: this.abbreviationOptions[this._selectedAbbreviationIndex]
    });
    // TODO(cais): Prevent selection in gap state.
    setTimeout(() => this.resetState(), 1000);
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
  }

  private expandAbbreviation() {
    if (!this.endpoint) {
      this.responseError = 'Cannot expand abbreviation: endpoint is empty';
      return;
    }
    if (this.contextStrings.length === 0) {
      this.responseError =
          'Cannot expand abbreviation: no speech content as context';
      return;
    }
    if (this.abbreviation === null) {
      this.responseError = 'Cannot expand abbreviation: empty abbreviation';
      return;
    }
    this.abbreviationOptions = [];
    this.requestOngoing = true;
    this.responseError = null;
    const LIMIT_TURNS = 2;
    const usedContextStrings = [...this.contextStrings];
    if (usedContextStrings.length > LIMIT_TURNS) {
      usedContextStrings.splice(0, usedContextStrings.length - LIMIT_TURNS);
    }
    // TODO(cais): Limit by token length?
    console.log(
        'Calling expandAbbreviation():', usedContextStrings, this.abbreviation);
    this.speakFasterService
        .expandAbbreviation(
            this.endpoint, this.accessToken, usedContextStrings.join('|'),
            this.abbreviation)
        .subscribe(
            data => {
              this.requestOngoing = false;
              if (data.exactMatches != null) {
                this.abbreviationOptions = data.exactMatches;
              }
            },
            error => {
              this.requestOngoing = false;
              this.responseError = error.message;
            });
  }
}
