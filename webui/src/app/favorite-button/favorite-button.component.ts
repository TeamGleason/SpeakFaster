/**
 * A button for adding a phrase to favorite. Supports animation that
 * indicates states such as ongoing request, success and error.
 */
import {Component, EventEmitter, Input, OnDestroy, OnInit, Output} from '@angular/core';

import {SpeakFasterService} from '../speakfaster-service';
import {AddContextualPhraseResponse} from '../types/contextual_phrase';

export enum State {
  READY = 'READY',
  REQUESTING = 'REQUESTING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

@Component({
  selector: 'app-favorite-button-component',
  templateUrl: './favorite-button.component.html',
})
export class FavoriteButtonComponent implements OnInit, OnDestroy {
  private static readonly _NAME = 'FavoriteButtonComopnent';
  private static readonly STATE_DELAY_MILLIS = 2000;

  @Input() isDeletion: boolean = false;
  @Input() userId!: string;
  @Input() phrase!: string;
  // Phrase ID: must be provided if isDeleteion is true.
  @Input() phraseId?: string;
  @Output() deletionComplete: EventEmitter<string> = new EventEmitter();

  state: State = State.READY;

  constructor(public speakFasterService: SpeakFasterService) {}

  ngOnInit() {}

  ngOnDestroy() {}

  onFavoriteButtonClicked(event: Event) {
    if (!this.userId) {
      throw new Error('Cannot add/delete phrase to favorite: Empty user ID');
    }
    if (this.state !== State.READY || this.phrase.trim() === '') {
      return;
    }
    if (this.isDeletion) {
      if (!this.phraseId) {
        throw new Error('Cannot delete phrase: Empty phrase ID');
      }
      console.log(
          'Deleting:', this.userId, this.phraseId, this.phrase);  // DEBUG
      this.state = State.REQUESTING;
      this.speakFasterService
          .deleteContextualPhrase({
            userId: this.userId,
            phraseId: this.phraseId,
          })
          .subscribe(
              data => {
                this.state = State.SUCCESS;
                this.scheduleReset();
                // this.retrievePhrases();
                // TODO(cais): Trigger reset in parent.
                // TODO(cais): Add unit test.
              },
              error => {
                // TODO(cais): Display error in UI.
                this.state = State.ERROR;
                this.scheduleReset();
                console.error('Deleting quick phrase failed:', error);
              });
    } else {
      // TODO(cais): Add unit test.
      console.log('onFavoriteButtonClicked():', this.phrase);  // DEBUG
      this.state = State.REQUESTING;
      this.speakFasterService
          .addContextualPhrase({
            userId: this.userId,
            contextualPhrase: {
              phraseId: '',  // For AddContextualPhraseRequest, this is ignored.
              text: this.phrase.trim(),
              tags: ['favorite'],  // TODO(cais): Do not hardcode this tag
            }
          })
          .subscribe(
              (data: AddContextualPhraseResponse) => {
                this.state = State.SUCCESS;
                this.scheduleReset();
              },
              error => {
                setTimeout(() => {
                  this.state = State.ERROR;
                  this.scheduleReset();
                });
              });
    }
  }

  private scheduleReset() {
    setTimeout(() => {
      this.state = State.READY;
    }, FavoriteButtonComponent.STATE_DELAY_MILLIS);
  }
}
