import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnInit, Output, QueryList, SimpleChanges, ViewChildren} from '@angular/core';
import {Subject, Subscription} from 'rxjs';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {ExternalEventsComponent, KeypressListener} from '../external/external-events.component';
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

  constructor(public speakFasterService: SpeakFasterService) {}

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
              this._replacements.splice(0);
              if (data.results) {
                this._replacements.push(
                    ...data.results.map(word => word.trim()));
                // TODO(cais): Discard punctuation and deduplicate.
                // TODO(cais): Discard items that are the same as the original
                // one. .filter(
                //   result => result.trim().toLowerCase() !==
                //       this._tokens[index].trim().toLocaleLowerCase()));
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
    this.refinementResult.emit({
      phrase: this.fillMaskRequest.phraseWithMask.replace(
          '_', this._replacements[index]),
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
