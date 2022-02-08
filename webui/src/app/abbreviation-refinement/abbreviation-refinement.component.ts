import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnInit, Output, QueryList, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {ExternalEventsComponent, KeypressListener} from '../external/external-events.component';
import {FillMaskResponse, SpeakFasterService} from '../speakfaster-service';

enum State {
  CHOOSING_TOKEN = 'CHOOSING_TOKEN',
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

export type RefinementType = 'REPLACE_TOKEN' | 'CHOOSE_PREFIX';

@Component({
  selector: 'app-abbreviation-refinement-component',
  templateUrl: './abbreviation-refinement.component.html',
})
export class AbbreviationRefinementComponent implements OnInit, AfterViewInit {
  private static readonly _NAME = 'AbbreviationRefinementComponent';
  private readonly instanceId =
      AbbreviationRefinementComponent._NAME + '_' + createUuid();

  @Input() refinementType: RefinementType = 'REPLACE_TOKEN';
  @Input() contextStrings!: string[];
  @Input() originalExpansionText!: string;
  @Output()
  refinementResult: EventEmitter<RefinementResult> = new EventEmitter();

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

  private readonly keypressListener: KeypressListener =
      this.listenToKeypress.bind(this);
  private readonly _tokens: string[] = [];
  private replacementIndex: number|null = null;
  private readonly _replacements: string[] = [];

  @ViewChildren('clickableButton')
  buttons!: QueryList<ElementRef<HTMLButtonElement>>;

  state: State = State.CHOOSING_TOKEN;

  constructor(public speakFasterService: SpeakFasterService) {}
  // TODO(cais): Provide escape route.

  ngOnInit() {
    this._tokens.push(...this.originalExpansionText.split(' '));
    ExternalEventsComponent.registerKeypressListener(this.keypressListener)
  }

  ngAfterViewInit() {
    updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    this.clickableButtons.changes.subscribe(
        (queryList: QueryList<ElementRef>) => {
          updateButtonBoxesForElements(this.instanceId, queryList);
        });
  }

  ngOnDestroy() {
    ExternalEventsComponent.unregisterKeypressListener(this.keypressListener);
    updateButtonBoxesToEmpty(this.instanceId);
  }

  onTokenButtonClicked(event: Event, index: number) {
    if (this.state === State.REQUEST_ONGOING) {
      return;
    }
    const speechContent = this.contextStrings.join('|');
    this.replacementIndex = index;
    const tokensIncludingMask: string[] = this._tokens.slice();
    tokensIncludingMask[index] = '_';
    const phraseWithMask = tokensIncludingMask.join(' ');
    const maskInitial = this._tokens[index][0];
    this.state = State.REQUEST_ONGOING;
    this.speakFasterService.fillMask(speechContent, phraseWithMask, maskInitial)
        .subscribe(
            (data: FillMaskResponse) => {
              this._replacements.splice(0);
              this._replacements.push(...data.results.filter(
                  result => result.trim().toLowerCase() !==
                      this._tokens[index].trim().toLocaleLowerCase()));
              // TODO(cais): Deal with `data.results` is undefined.
              this.state = State.CHOOSING_TOKEN_REPLACEMNT;
            },
            error => {
              this.state = State.ERROR;
              // TODO(cais): Handle fill mask error.
              // TODO(cais): Provide exit.
            });
  }

  onReplacementButtonClicked(event: Event, index: number) {
    if (this.replacementIndex === null) {
      return;
    }
    const tokens: string[] = this._tokens.slice();
    tokens[this.replacementIndex] = this._replacements[index];
    this.refinementResult.emit({
      phrase: tokens.join(' '),
      isAbort: false,
    });
  }

  public listenToKeypress(keySequence: string[], reconstructedText: string):
      void {
    // TODO(cais): Listen to replacement keys.
  }

  get currentTokens(): string[] {
    return this._tokens.slice();
  }

  get replacements(): string[] {
    return this._replacements.slice();
  }

  isTokenChosenForReplacement(index: number): boolean {
    return this.replacementIndex === index;
  }
}
