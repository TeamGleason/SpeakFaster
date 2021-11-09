import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnInit, Output, QueryList, SimpleChange, SimpleChanges, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';
import {updateButtonBoxForHtmlElements} from 'src/utils/cefsharp';

import {SpeakFasterService} from '../speakfaster-service';
import {TextInjection} from '../types/text-injection';

@Component({
  selector: 'app-text-continuation-component',
  templateUrl: './text-continuation.component.html',
})
export class TextContinuationComponent implements AfterViewInit, OnChanges {
  private static readonly _NAME = 'TextContinuationComponent';

  @Input() endpoint!: string;
  @Input() accessToken!: string;
  @Input() contextStrings!: string[];
  @Input() textPrefix!: string;
  @Input() textInjectionSubject!: Subject<TextInjection>;

  @ViewChildren('clickableButton')
  buttons!: QueryList<ElementRef<HTMLButtonElement>>;

  readonly continuationOptions: string[] = [];

  constructor(private speakFasterService: SpeakFasterService) {}

  ngOnInit() {}

  ngAfterViewInit() {
    this.buttons.changes.subscribe(
        (queryList: QueryList<ElementRef<HTMLButtonElement>>) => {
          setTimeout(
              () => updateButtonBoxForHtmlElements(
                  TextContinuationComponent._NAME, queryList),
              20);
        });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!changes['textPrefix']) {
      return;
    }
    const textPrefixChange: SimpleChange = changes['textPrefix'];
    const textPrefix = textPrefixChange.currentValue;
    if (textPrefix[textPrefix.length - 1] !== ' ') {
      return;
    }
    this.continuationOptions.splice(0);
    this.speakFasterService
        .textContinuation(
            this.endpoint, this.accessToken, this.contextStrings,
            textPrefix.trim())
        .subscribe(
            data => {
              this.continuationOptions.push(...data.outputs);
            },
            error => {
              this.continuationOptions.splice(0);
              // TODO(cais): UI for indicating error.
            });
  }

  onContinuationOptionButtonClicked(event: Event, index: number) {
    const text =
        this.textPrefix.trim() + ' ' + this.continuationOptions[index].trim();
    this.textInjectionSubject.next({
      text,
      timestampMillis: Date.now(),
    });
    this.continuationOptions.splice(0);
  }
}
