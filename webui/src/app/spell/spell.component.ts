import {ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, QueryList, SimpleChanges, ViewChildren} from '@angular/core';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {isAlphanumericChar} from 'src/utils/text-utils';
import {createUuid} from 'src/utils/uuid';

import {AppComponent} from '../app.component';
import {ExternalEventsComponent, getVirtualkeyCode, KeypressListener, repeatVirtualKey, VIRTUAL_KEY} from '../external/external-events.component';
import {AbbreviationSpec, AbbreviationToken} from '../types/abbreviation';

// TODO(cais): Support workflow: enter initial-only abbreviation, get no
// matching AE option, continue to type out any word of the phrase, and
// hit enter to perform AE with keyword. Can enter more keywords if still has
// no match.
// TODO(cais): Support workflow, same as above, but before entering the
// keyword, first click a button to indicate which word is being spelled out.
export enum SpellingState {
  CHOOSING_TOKEN = 'CHOOSING_TOKEN',
  SPELLING_TOKEN = 'SPELLING_TOKEN',
  DONE = 'DONE',
}

@Component({
  selector: 'app-spell-component',
  templateUrl: './spell.component.html',
})
export class SpellComponent implements OnInit, OnChanges, OnDestroy {
  private static readonly _NAME = 'SpellComponent';
  private readonly instanceId = SpellComponent._NAME + '_' + createUuid();

  @Input() originalAbbreviationSpec!: AbbreviationSpec;
  @Output()
  newAbbreviationSpec: EventEmitter<AbbreviationSpec> = new EventEmitter();

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLButtonElement>>;

  originalAbbreviationChars: string[] = [];
  // Which word in the abbreviated phrase is being spelled.
  spellIndex: number|null = null;
  state: SpellingState = SpellingState.CHOOSING_TOKEN;
  tokenSpellingInput: string = '';
  private eraserSequence: string[] = [];
  private keypressListener: KeypressListener = this.listenToKeypress.bind(this);

  // Words that have already been spelled out so far. This supports
  // incremental spelling out of multiple words in an abbreviation.
  readonly spelledWords: Array<string|null> = [];

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    ExternalEventsComponent.registerKeypressListener(this.keypressListener);
    if (this.eraserSequence.length === 0) {
      this.resetState();
    }
    AppComponent.registerAppResizeCallback(this.appResizeCallback.bind(this));
  }

  ngOnDestroy() {
    // TODO(cais): Add unit test.
    updateButtonBoxesToEmpty(this.instanceId);
    ExternalEventsComponent.unregisterKeypressListener(this.keypressListener);
  }

  ngAfterViewInit() {
    if (this.clickableButtons === undefined) {
      return;
    }
    updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    this.clickableButtons.changes.subscribe(
        (queryList: QueryList<ElementRef<HTMLButtonElement>>) => {
          updateButtonBoxesForElements(this.instanceId, queryList);
        });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.originalAbbreviationSpec &&
        changes.originalAbbreviationSpec.previousValue &&
        changes.originalAbbreviationSpec.previousValue.lineageId !==
            changes.originalAbbreviationSpec.currentValue.lineageId) {
      this.resetState();
    }
  }

  private appResizeCallback() {
    if (this.clickableButtons.length > 0) {
      updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    }
  }

  private resetState() {
    this.originalAbbreviationChars.splice(0);
    this.spelledWords.splice(0);
    this.originalAbbreviationSpec.tokens.forEach(token => {
      this.originalAbbreviationChars.push(token.value);
      this.spelledWords.push(null);
    });
  }

  listenToKeypress(keySequence: string[], reconstructedText: string): void {
    const lastKey = keySequence[keySequence.length - 1];
    if (this.state === SpellingState.CHOOSING_TOKEN ||
        this.state === SpellingState.DONE) {
      const spellIndices: number[] = [];
      this.originalAbbreviationChars.forEach((abbreviationChar, i) => {
        if (abbreviationChar.toLowerCase().slice(0, 1) === lastKey) {
          spellIndices.push(i);
        }
      });
      if (spellIndices.length === 1) {
        // There is a unique matching token.
        this.spellIndex = spellIndices[0];
        this.state = SpellingState.SPELLING_TOKEN;
        this.tokenSpellingInput = lastKey;
        this.eraserSequence.splice(0);
        this.eraserSequence.push(lastKey);
        this.cdr.detectChanges();
        // TODO(cais): Disallow punctuation?
      }
    } else if (this.state === SpellingState.SPELLING_TOKEN) {
      if (isAlphanumericChar(lastKey)) {
        this.tokenSpellingInput += lastKey;
        this.eraserSequence.push(lastKey);
        this.cdr.detectChanges();
      } else if (lastKey === VIRTUAL_KEY.BACKSPACE) {
        if (this.tokenSpellingInput.length > 0) {
          this.tokenSpellingInput = this.tokenSpellingInput.slice(
              0, this.tokenSpellingInput.length - 1);
          this.eraserSequence.splice(this.eraserSequence.length - 1);
        }
      } else {
        // Any keys other than alphanumeric or backspace terminates the spelling
        // and trigger a new AE call. this.spellingKeys.push(lastKey);
        this.eraserSequence.push(lastKey);
        this.endSpelling();
      }
    }
  }

  onTokenButtonClicked(event: Event, i: number) {
    // Clicking a token button is the way to specify the word being spelled out
    // when there are duplicate letters.
    this.spellIndex = i;
    this.tokenSpellingInput = this.originalAbbreviationChars[i];
    this.eraserSequence.splice(0);
    this.state = SpellingState.SPELLING_TOKEN;
    this.cdr.detectChanges();
  }

  onDoneButtonClicked(event: Event) {
    this.endSpelling();
  }

  stringAtIndex(i: number): string {
    if (this.spelledWords.length > 0 && this.spelledWords[i] !== null) {
      return this.spelledWords[i] as string;
    } else {
      return this.originalAbbreviationChars[i];
    }
  }

  private endSpelling() {
    this.state = SpellingState.DONE;
    const abbreviationSpec = this.recreateAbbreviation();
    this.originalAbbreviationSpec = abbreviationSpec;
    this.newAbbreviationSpec.emit(abbreviationSpec);
    this.tokenSpellingInput = '';
    this.spellIndex = null;
    this.cdr.detectChanges();
  }

  private recreateAbbreviation(): AbbreviationSpec {
    this.spelledWords[this.spellIndex!] = this.tokenSpellingInput.trim();
    let pendingChars = '';
    const tokens: AbbreviationToken[] = [];
    for (let i = 0; i < this.originalAbbreviationChars.length; ++i) {
      if (this.spelledWords[i] === null) {
        // Word not spelled out.
        pendingChars += this.originalAbbreviationChars[i];
      } else {
        // The word has been spelled out.
        if (pendingChars) {
          tokens.push({
            value: pendingChars,
            isKeyword: false,
          });
          pendingChars = '';
        }
        tokens.push({
          value: this.spelledWords[i]!,
          isKeyword: true,
        });
      }
    }
    if (pendingChars) {
      tokens.push({
        value: pendingChars,
        isKeyword: false,
      });
    }
    let newAbbreviationSpec: AbbreviationSpec = {
      tokens,
      readableString: tokens.map(token => token.value).join(' '),
      lineageId: this.originalAbbreviationSpec.lineageId,
    };
    if (this.originalAbbreviationSpec.eraserSequence !== undefined) {
      newAbbreviationSpec = {
        ...newAbbreviationSpec,
        eraserSequence: [
          ...this.originalAbbreviationSpec.eraserSequence,
          ...repeatVirtualKey(
              VIRTUAL_KEY.BACKSPACE, this.eraserSequence.length),
        ],
      };
    }
    return newAbbreviationSpec;
  }
}
