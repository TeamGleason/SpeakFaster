/** Quick phrase list for direct selection. */
import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, QueryList, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';
import {injectKeys, updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {AppComponent} from '../app.component';
import {VIRTUAL_KEY} from '../external/external-events.component';
import {TextEntryBeginEvent, TextEntryEndEvent} from '../types/text-entry';

@Component({
  selector: 'app-quick-phrases-component',
  templateUrl: './quick-phrases.component.html',
})
export class QuickPhrasesComponent implements AfterViewInit, OnDestroy {
  private static readonly _NAME = 'QuickPhrasesComponent';

  private readonly instanceId =
      QuickPhrasesComponent._NAME + '_' + createUuid();

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

  @Input() textEntryBeginSubject!: Subject<TextEntryBeginEvent>;
  @Input() textEntryEndSubject!: Subject<TextEntryEndEvent>;
  @Input() phrases: string[] = [];
  @Input() color: string = 'gray';
  // TODO: Do not hardcode.

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

  onInjectionOptionButtonClicked(event: {
    phraseText: string; phraseIndex: number
  }) {
    this.selectPhrase(
        event.phraseIndex, /* toInjectKeys= */ true,
        /* toTriggerInAppTextToSpeech= */ false);
  }

  onSpeakOptionButtonClicked(event: {phraseText: string, phraseIndex: number}) {
    this.selectPhrase(
        event.phraseIndex, /* toInjectKeys= */ true,
        /* toTriggerInAppTextToSpeech= */ true);
  }

  private selectPhrase(
      index: number, toInjectKeys: boolean,
      toTriggerInAppTextToSpeech: boolean = false) {
    let numKeypresses = 1;
    const phrase = this.phrases[index].trim();
    numKeypresses += phrase.length;
    this.textEntryBeginSubject.next({timestampMillis: Date.now()});
    this.textEntryEndSubject.next({
      text: phrase,
      // TODO(cais): Dehack or depend on dwell time.
      timestampMillis: Date.now() + 1000,
      isFinal: true,
      numKeypresses,
      numHumanKeypresses: 1,
      inAppTextToSpeechAudioConfig:
          toTriggerInAppTextToSpeech ? {volume_gain_db: 0} : undefined,
    });
    if (toInjectKeys) {
      const injectedKeys: Array<string|VIRTUAL_KEY> = [];
      injectedKeys.push(...phrase.split(''));  // Punctuation?
      injectedKeys.push(VIRTUAL_KEY.SPACE);    // Append a space at the end.
      injectKeys(injectedKeys);
    }
    // TODO(cais): Prevent selection in gap state.
  }

  private appResizeCallback() {
    if (this.clickableButtons.length > 0) {
      updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    }
  }

  // TODO(cais): Add unit tests.
}
