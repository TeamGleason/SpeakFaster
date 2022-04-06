/** An editing interface for a quick phrase (a.k.a. contextual phrase). */
import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {SpeakFasterService} from '../speakfaster-service';

export enum State {
  READY = 'READY',
  CONFIRMING_DELETION = 'CONFIRMING_DELETION',
}

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
  @Output() phraseSaved: EventEmitter<{phraseId: string}> = new EventEmitter();

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;
  @ViewChild('textInput') textInput!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('displayTextInput')
  displayTextInput!: ElementRef<HTMLTextAreaElement>;

  constructor(private speakFasterService: SpeakFasterService) {}

  ngAfterViewInit() {
    updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
  }

  ngOnDestroy() {
    updateButtonBoxesToEmpty(this.instanceId);
  }

  onSaveButtonClicked(event: Event) {
    const newPhraseText = this.textInput.nativeElement.value.trim();
    const newPhraseDisplayText =
        this.displayTextInput.nativeElement.value.trim();
    console.log('*** save clicked:', newPhraseText, newPhraseDisplayText);
    this.speakFasterService
        .editContextualPhrase({
          userId: this.userId,
          phraseId: this.phraseId,
          text: newPhraseText,
          displayText: newPhraseDisplayText,
        })
        .subscribe(
            data => {
              this.phraseSaved.next({phraseId: this.phraseId});
              // TODO(cais): Add event logging.
              // if (data.errorMessage) {
              //   console.error(`Error during editing of contextual phrase:
              //   ${
              //       data.errorMessage}`);
              //   this.eventLogger.logContextualPhraseDeleteError(
              //       data.errorMessage);
              //   this.state = State.ERROR;
              // } else {
              //   this.state = State.SUCCESS;
              // }
            },
            error => {
                // TODO(cais): Display error in UI.
                // this.eventLogger.logContextualPhraseDeleteError('');
                // this.state = State.ERROR;
                // this.scheduleReset();
                // console.error('Deleting quick phrase failed:', error);
            });
  }
}
