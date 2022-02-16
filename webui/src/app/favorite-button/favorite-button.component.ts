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
  RESTORED = 'RESTORED',
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

  state: State = State.READY;

  constructor(public speakFasterService: SpeakFasterService) {}

  ngOnInit() {}

  ngOnDestroy() {}

  onFavoriteButtonClicked(event: Event) {
    if (this.phrase.trim() === '') {
      return;
    }
    if (!this.userId) {
      throw new Error('Cannot add/delete phrase to favorite: Empty user ID');
    }
    if ((!this.isDeletion && this.state === State.READY) ||
        (this.isDeletion && this.state === State.SUCCESS)) {
      // This is a to-be-added phrase or a phrase that was just deleted.
      // The action to perform is hence adding phrase.
      this.state = State.REQUESTING;
      console.log('onFavoriteButtonClicked():', 100);
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
                if (data.errorMessage) {
                  console.error(`Error during adding of contextual phrase: ${
                      data.errorMessage}`);
                  this.state = State.ERROR;
                  return;
                }
                if (this.isDeletion) {
                  this.state = State.RESTORED;
                  this.phraseId = data.phraseId;
                } else {
                  this.state = State.SUCCESS;
                  this.scheduleReset();
                }
              },
              error => {
                setTimeout(() => {
                  this.state = State.ERROR;
                  this.scheduleReset();
                });
              });
    } else if (
        this.isDeletion &&
        (this.state === State.READY || this.state === State.RESTORED)) {
      // This is a to-be-deleted phrase and it hasn't been deleted yet.
      if (!this.phraseId) {
        throw new Error('Cannot delete phrase: Empty phrase ID');
      }
      console.log('onFavoriteButtonClicked():', 200);
      this.state = State.REQUESTING;
      this.speakFasterService
          .deleteContextualPhrase({
            userId: this.userId,
            phraseId: this.phraseId,
          })
          .subscribe(
              data => {
                if (data.errorMessage) {
                  console.error(`Error during adding of contextual phrase: ${
                    data.errorMessage}`);
                  this.state = State.ERROR;
                } else {
                  this.state = State.SUCCESS;
                }
              },
              error => {
                console.log('onFavoriteButtonClicked():', 220);
                // TODO(cais): Display error in UI.
                this.state = State.ERROR;
                this.scheduleReset();
                console.error('Deleting quick phrase failed:', error);
              });
    }
  }

  private scheduleReset() {
    setTimeout(() => {
      this.state = State.READY;
    }, FavoriteButtonComponent.STATE_DELAY_MILLIS);
  }
}
