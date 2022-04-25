/** Quick phrase list for direct selection. */
import {AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, QueryList, SimpleChanges, ViewChild, ViewChildren} from '@angular/core';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {AppComponent} from '../app.component';
import {getAppSettings} from '../settings/settings';

const SCROLL_HEIGHT_TOLERANCE_PX = 1.0;


export async function setTtsUtteranceVoice(
    utterance: SpeechSynthesisUtterance) {
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

/** Eye-gaze-compatible scroll buttons. */
@Component({
  selector: 'app-scroll-buttons-component',
  templateUrl: './scroll-buttons.component.html',
})
export class ScrollButtonsComponent implements AfterViewInit, OnDestroy {
  private static readonly _NAME = 'ScrollButtonsCompnoent';

  private readonly instanceId =
      ScrollButtonsComponent._NAME + '_' + createUuid();

  // The target div element to scroll up and down.
  @Input() scrollTarget!: HTMLDivElement;
  // Scroll step size (unit: CSS px).
  @Input() scrollStepPx!: number;
  @Output()
  scrollButtonClicked: EventEmitter<{direction: 'up' | 'down'}> =
      new EventEmitter();

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

  constructor() {}

  ngAfterViewInit() {
    updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    this.clickableButtons.changes.subscribe(
        (queryList: QueryList<ElementRef>) => {
          updateButtonBoxesForElements(this.instanceId, queryList);
        });
    AppComponent.registerAppResizeCallback(this.appResizeCallback.bind(this));
  }

  ngOnDestroy() {
    updateButtonBoxesToEmpty(this.instanceId);
  }

  onScrollButtonClicked(event: Event, direction: 'up'|'down') {
    if (direction === 'down') {
      const maxScrollY =
          this.scrollTarget.scrollHeight - this.scrollTarget.clientHeight;
      this.scrollTarget.scrollTop =
          Math.min(maxScrollY, this.scrollTarget.scrollTop + this.scrollStepPx);
    } else {
      const minScrollY = 0;
      this.scrollTarget.scrollTop =
          Math.max(minScrollY, this.scrollTarget.scrollTop - this.scrollStepPx);
    }
    this.scrollButtonClicked.emit({direction});
  }

  isScrollButtonDisabled(direction: 'up'|'down'): boolean {
    if (direction === 'up') {
      return this.scrollTarget.scrollTop <= 0;
    } else {
      return this.scrollTarget.scrollTop >= this.scrollTarget.scrollHeight -
          this.scrollTarget.clientHeight - SCROLL_HEIGHT_TOLERANCE_PX;
    }
  }

  checkPhraseOverflow(): boolean {
    if (!this.scrollTarget) {
      return false;
    }
    return this.scrollTarget.scrollHeight > this.scrollTarget.clientHeight;
  }

  private appResizeCallback() {
    if (this.clickableButtons.length > 0) {
      updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    }
  }
}
