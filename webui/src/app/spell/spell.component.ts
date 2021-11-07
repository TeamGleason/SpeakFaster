import {AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, QueryList, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';
import {updateButtonBoxes, updateButtonBoxForHtmlElements} from 'src/utils/cefsharp';

import {isPlainAlphanumericKey, isTextContentKey} from '../../utils/keyboard-utils';
import {AbbreviationSpec, AbbreviationToken, StartSpellingEvent} from '../types/abbreviations';

enum SpellingState {
  NOT_STARTED = 'NOT_STARTED',
  CHOOSING_TOKEN = 'CHOOSING_TOKEN',
  SPELLING_TOKEN = 'SPELLING_TOKEN',
  DONE = 'DONE',
}

@Component({
  selector: 'app-spell-component',
  templateUrl: './spell.component.html',
})
export class SpellComponent implements OnInit, AfterViewInit, OnDestroy {
  private static readonly _NAME = 'SpellComponent';

  @Input() spellIndex: number|null = null;
  @Input() startSpellingSubject!: Subject<StartSpellingEvent>;
  @Output()
  newAbbreviationSpec: EventEmitter<AbbreviationSpec> = new EventEmitter();

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLButtonElement>>;

  originalAbbreviationChars: string[] = [];

  // Words that have already been spelled out so far. This supports
  // incremental spelling out of multiple words in an abbreviation.
  readonly spelledWords: Array<string|null> = [];

  ngOnInit() {
    this.startSpellingSubject.subscribe((event: StartSpellingEvent) => {
      this.state = SpellingState.CHOOSING_TOKEN;
      if (this.originalAbbreviationChars.length > 0 &&
          !event.isNewSpellingTask) {
        return;
      }
      if (event.isNewSpellingTask) {
        this.spelledWords.splice(0);
        this.originalAbbreviationChars = event.originalAbbreviationChars;
      }
    });
  }

  ngAfterViewInit() {
    this.clickableButtons.changes.subscribe(
        (queryList: QueryList<ElementRef<HTMLButtonElement>>) => {
          setTimeout(() => {
            updateButtonBoxForHtmlElements(SpellComponent._NAME, queryList);
          }, 20);
        });
  }

  ngOnDestroy() {
    // NOTE: Hide doesn't really call onDestroy().
  }

  state: SpellingState = SpellingState.NOT_STARTED;
  tokenSpellingInput: string = '';

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (this.state === SpellingState.NOT_STARTED) {
      return;
    }
    if (this.originalAbbreviationChars.length === 0) {
      return;
    }
    if (this.state === SpellingState.CHOOSING_TOKEN &&
        !(event.altKey || event.ctrlKey || event.metaKey)) {
      // TODO(cais): Support circular selection of duplicate characters.
      const key = event.key.toLocaleLowerCase();
      const index = this.originalAbbreviationChars.indexOf(key);
      if (index !== -1) {
        this.startSpellingToken(index);
      }
    } else if (this.state === SpellingState.SPELLING_TOKEN) {
      // Ctrl S, Ctrl E or Enter ends the spelling.
      if ((event.ctrlKey &&
           (event.key.toLocaleLowerCase() === 's' ||
            event.key.toLocaleLowerCase() === 'e')) ||
          (isPlainAlphanumericKey(event, 'Enter', false))) {
        this.endSpelling();
        event.preventDefault();
        event.stopPropagation();
      }
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      if (event.key === 'Backspace' && this.tokenSpellingInput.length > 0) {
        this.tokenSpellingInput = this.tokenSpellingInput.substring(
            0, this.tokenSpellingInput.length - 1);
        event.preventDefault();
        event.stopPropagation();
      } else if (isTextContentKey(event)) {
        this.tokenSpellingInput += event.key.toLocaleLowerCase();
        event.preventDefault();
        event.stopPropagation();
      }
    }
  }

  onDoneButtonClicked(event: Event) {
    this.endSpelling();
  }

  onTokenButtonClicked(event: Event, i: number) {
    this.startSpellingToken(i);
  }

  private startSpellingToken(index: number) {
    this.spellIndex = index;
    this.tokenSpellingInput = this.originalAbbreviationChars[index];
    this.state = SpellingState.SPELLING_TOKEN;
    if (this.spelledWords.length !== this.originalAbbreviationChars.length) {
      this.spelledWords.splice(0);
      for (let i = 0; i < this.originalAbbreviationChars.length; ++i) {
        this.spelledWords.push(null);
      }
    }
  }

  private endSpelling() {
    this.state = SpellingState.DONE;
    this.newAbbreviationSpec.emit(this.reconstructAbbreviation());
    this.spellIndex = null;
    updateButtonBoxes(SpellComponent._NAME, []);
  }

  private reconstructAbbreviation(): AbbreviationSpec {
    this.spelledWords[this.spellIndex!] = this.tokenSpellingInput.trim();
    const abbrevSpec: AbbreviationSpec = {tokens: [], readableString: ''};
    let currentToken: AbbreviationToken = {value: '', isKeyword: false};
    for (let i = 0; i < this.originalAbbreviationChars.length; ++i) {
      if (this.spelledWords[i] !== null) {
        if (currentToken.value.length > 0) {
          abbrevSpec.tokens.push(currentToken);
        }
        abbrevSpec.tokens.push({
          value: this.spelledWords[i] as string,
          isKeyword: true,
        });
        currentToken = {value: '', isKeyword: false};
      } else {
        const char = this.originalAbbreviationChars[i];
        currentToken.value += char;
      }
    }
    if (currentToken.value.length > 0) {
      abbrevSpec.tokens.push(currentToken);
    }
    abbrevSpec.readableString =
        abbrevSpec.tokens.map(token => token.value).join(' ');
    return abbrevSpec;
  }
}
