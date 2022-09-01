import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnInit, Output, QueryList, SimpleChanges, ViewChildren} from '@angular/core';
import {Subscription} from 'rxjs';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {extractEndPunctuation} from 'src/utils/text-utils';
import {createUuid} from 'src/utils/uuid';

import {getAbbreviationExpansionResponseStats, HttpEventLogger} from '../event-logger/event-logger-impl';
import {FillMaskRequest, FillMaskResponse, SpeakFasterService} from '../speakfaster-service';

enum State {
  REQUEST_ONGOING = 'REQUEST_ONGOING',
  CHOOSING_TOKEN_REPLACEMNT = 'CHOOSING_TOKEN_REPLACEMNT',
  ERROR = 'ERROR',
}

/** Result of the refinement process. */
export interface RefinementResult {
  // The string that results from the refinement.
  phrase: string;

  // Whether the refinement process is aborted.
  isAbort: boolean;
}

export type RefinementType = 'REPLACE_TOKEN'|'CHOOSE_PREFIX';

@Component({
  selector: 'app-abbreviation-refinement-component',
  templateUrl: './abbreviation-refinement.component.html',
})
export class AbbreviationRefinementComponent implements OnInit, AfterViewInit,
                                                        OnChanges {
  private static readonly _NAME = 'AbbreviationRefinementComponent';
  private readonly instanceId =
      AbbreviationRefinementComponent._NAME + '_' + createUuid();
  private static readonly VALID_WORD_REGEX = /^[A-Za-z]+[,;\-\.\?\!]$/;

  @Input() refinementType: RefinementType = 'REPLACE_TOKEN';
  @Input() fillMaskRequest!: FillMaskRequest;
  @Input() originalExpansionText!: string;
  @Output()
  refinementResult: EventEmitter<RefinementResult> = new EventEmitter();

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

  private replacementIndex: number|null = null;
  private readonly _replacements: string[] = [];

  @ViewChildren('clickableButton')
  buttons!: QueryList<ElementRef<HTMLButtonElement>>;

  state: State = State.REQUEST_ONGOING;
  private clickableButtonsSubscription?: Subscription;

  constructor(
      public speakFasterService: SpeakFasterService,
      private eventLogger: HttpEventLogger) {}

  ngOnInit() {}

  ngAfterViewInit() {
    updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    this.clickableButtonsSubscription = this.clickableButtons.changes.subscribe(
        (queryList: QueryList<ElementRef>) => {
          updateButtonBoxesForElements(this.instanceId, queryList);
        });
  }

  ngOnChanges(changes: SimpleChanges) {
    // TODO(cais): Add unit test.
    if (!changes.fillMaskRequest) {
      return;
    }
    this.callFillMask();
  }

  ngOnDestroy() {
    if (this.clickableButtonsSubscription) {
      this.clickableButtonsSubscription.unsubscribe();
    }
    updateButtonBoxesToEmpty(this.instanceId);
  }

  private callFillMask() {
    this.state = State.REQUEST_ONGOING;
    this.speakFasterService.fillMask(this.fillMaskRequest)
        .subscribe(
            (data: FillMaskResponse) => {
              this.eventLogger.logAbbreviationExpansionWordRefinemenResponse(
                  getAbbreviationExpansionResponseStats(data.results));
              this._replacements.splice(0);
              if (data.results) {
                for (let word of data.results) {
                  word = word.trim();
                  if (word.match(
                          AbbreviationRefinementComponent.VALID_WORD_REGEX)) {
                    continue;
                  }
                  // Remove punctuation.
                  word = word.replace(/[\.\,\;\-\!\?\_]/g, '');
                  if (this._replacements.indexOf(word) === -1) {
                    this._replacements.push(word);
                  }
                }
              }
              this.state = State.CHOOSING_TOKEN_REPLACEMNT;
            },
            error => {
              this.state = State.ERROR;
              // TODO(cais): Handle fill mask error.
              // TODO(cais): Provide exit.
            });
  }

  onReplacementButtonClicked(event: Event, index: number) {
    const replacement = this._replacements[index];
    this.eventLogger.logAbbreviationExpansionWordRefinementSelection(
        replacement.length, index);
    const tokens = this.fillMaskRequest.phraseWithMask.split(/\s+/);
    let newPhrase: string = '';
    tokens.forEach((token, i) => {
      if (token === '_') {
        const endPunctuation =
            extractEndPunctuation(this.fillMaskRequest.originalChipStrings[i]);
        newPhrase += replacement + endPunctuation + ' ';

      } else {
        newPhrase += token + ' ';
      }
    });
    this.refinementResult.emit({
      phrase: newPhrase.trim(),
      isAbort: false,
    });
  }

  onAbortButtonClicked(event: Event) {
    this.refinementResult.emit({
      phrase: '',
      isAbort: true,
    });
  }

  onTryAgainButtonClicked(event: Event) {
    this.callFillMask();
  }

  get replacements(): string[] {
    return this._replacements.slice();
  }

  get replacementsEmpty(): boolean {
    return this._replacements.length === 0;
  }

  isTokenChosenForReplacement(index: number): boolean {
    return this.replacementIndex === index;
  }
}
