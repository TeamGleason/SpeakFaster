/** An editing interface for a quick phrase (a.k.a. contextual phrase). */
import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {getContextualPhraseStats, HttpEventLogger} from '../event-logger/event-logger-impl';
import {InputBarControlEvent} from '../input-bar/input-bar.component';
import {SpeakFasterService} from '../speakfaster-service';
import {ContextualPhrase} from '../types/contextual_phrase';

@Component({
  selector: 'app-phrase-editing-component',
  templateUrl: './phrase-editing.component.html',
})
export class PhraseEditingComponent implements AfterViewInit, OnDestroy {
  private static readonly _NAME = 'PhraseEditingComponent';

  private readonly instanceId =
      PhraseEditingComponent._NAME + '_' + createUuid();
  @Input() userId!: string;
  @Input() phraseId!: string;
  @Input() phraseText!: string;
  @Input() phraseDisplayText?: string;
  @Input() inputBarControlSubject?: Subject<InputBarControlEvent>;
  @Output() phraseSaved: EventEmitter<{phraseId: string}> = new EventEmitter();

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;
  @ViewChild('textInput') textInput!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('displayTextInput')
  displayTextInput!: ElementRef<HTMLTextAreaElement>;

  errorMessage: string|null = null;

  constructor(
      private speakFasterService: SpeakFasterService,
      private eventLogger: HttpEventLogger) {}

  ngAfterViewInit() {
    updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    // Automatically focus onto the display-text textarea.
    this.displayTextInput.nativeElement.focus();
  }

  ngOnDestroy() {
    updateButtonBoxesToEmpty(this.instanceId);
  }

  onSaveButtonClicked(event: Event) {
    this.errorMessage = null;
    const newPhraseText = this.textInput.nativeElement.value.trim();
    let newPhraseDisplayText = this.displayTextInput.nativeElement.value.trim();
    if (newPhraseDisplayText === newPhraseText) {
      newPhraseDisplayText = '';
    }
    const contextualPhrase: ContextualPhrase = {
      phraseId: this.phraseId,
      text: newPhraseText,
      displayText: newPhraseDisplayText,
    };
    this.eventLogger.logContextualPhraseEdit(
        getContextualPhraseStats(contextualPhrase));
    this.speakFasterService
        .editContextualPhrase({
          userId: this.userId,
          phraseId: this.phraseId,
          text: newPhraseText,
          displayText: newPhraseDisplayText,
        })
        .subscribe(
            data => {
              if (!data) {
                this.errorMessage = 'An error occurred. Please try again.';
                this.eventLogger.logContextualPhraseEditError('');
              }
              if (data.errorMessage) {
                this.errorMessage = data.errorMessage;
                console.error(`Error during editing of contextual phrase:
                ${data.errorMessage}`);
                this.eventLogger.logContextualPhraseEditError(
                    data.errorMessage);
                return;
              }
              this.phraseSaved.next({phraseId: this.phraseId});
              if (this.inputBarControlSubject) {
                this.inputBarControlSubject.next({
                  clearAll: true,
                })
              }
            },
            error => {
              this.errorMessage = 'An error occurred. Please try again.';
              this.eventLogger.logContextualPhraseEditError('');
            });
  }

  onSpokenButtonClicked(event: Event) {
    this.textInput.nativeElement.focus();
  }

  onDisplayedButtonClicked(event: Event) {
    this.displayTextInput.nativeElement.focus();
  }
}
