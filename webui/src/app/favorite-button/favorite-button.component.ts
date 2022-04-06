/**
 * A button for adding a phrase to favorite. Supports animation that
 * indicates states such as ongoing request, success and error.
 */
import {Component, EventEmitter, Input, OnDestroy, OnInit, Output} from '@angular/core';
import {Subject} from 'rxjs';

import {getContextualPhraseStats, getPhraseStats, HttpEventLogger} from '../event-logger/event-logger-impl';
import {InputBarControlEvent} from '../input-bar/input-bar.component';
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
  private static readonly DEFAULT_CONTEXTUAL_PHRASE_TAG = 'favorite';

  @Input() isDeletion: boolean = false;
  @Input() userId!: string;
  @Input() phrase!: string;
  @Input() phraseDisplayText?: string;
  // Phrase ID: must be provided if isDeleteion is true.
  @Input() phraseId?: string;
  @Input() sendAsUserFeedback: boolean = false;
  @Input()
  tags: string[]|undefined =
      [FavoriteButtonComponent.DEFAULT_CONTEXTUAL_PHRASE_TAG];
  @Input() inputBarControlSubject?: Subject<InputBarControlEvent>;
  @Output()
  favoritePhraseAdded: EventEmitter<{text: string, success: boolean}> =
      new EventEmitter();

  state: State = State.READY;

  constructor(
      public speakFasterService: SpeakFasterService,
      private eventLogger: HttpEventLogger) {}

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
      if (this.sendAsUserFeedback) {
        // Send as user feedback.
        this.eventLogger
            .logUserFeedback({
              feedbackMessage: this.phrase.trim(),
            })
            .then(
                () => {
                  this.state = State.SUCCESS;
                  this.scheduleReset();
                },
                () => {
                  this.state = State.ERROR;
                  this.scheduleReset();
                });
      } else {
        // Add contextual phrase.
        const text = this.phrase.trim();

        const contextualPhrase = {
          phraseId: '',  // For AddContextualPhraseRequest, this is ignored.
          text,
          // TODO(cais): Add unit test.
          displayText: this.phraseDisplayText,
          tags: this.tags ||
              [FavoriteButtonComponent.DEFAULT_CONTEXTUAL_PHRASE_TAG],
        };
        this.eventLogger.logContextualPhraseAdd(
            getContextualPhraseStats(contextualPhrase));
        this.speakFasterService
            .addContextualPhrase({
              userId: this.userId,
              contextualPhrase,
            })
            .subscribe(
                (data: AddContextualPhraseResponse) => {
                  if (data.errorMessage) {
                    console.error(`Error during adding of contextual phrase: ${
                        data.errorMessage}`);
                    this.eventLogger.logContextualPhraseAddError(
                        data.errorMessage);
                    this.state = State.ERROR;
                    this.favoritePhraseAdded.next({text, success: false});
                    this.scheduleReset();
                    return;
                  }
                  if (this.isDeletion) {
                    this.state = State.RESTORED;
                    this.phraseId = data.phraseId;
                  } else {
                    this.state = State.SUCCESS;
                    this.sendContextualPhraseRrefreshSignal();
                    this.scheduleReset();
                  }
                  this.favoritePhraseAdded.next({text, success: true});
                },
                error => {
                  this.eventLogger.logContextualPhraseAddError('');
                  setTimeout(() => {
                    this.state = State.ERROR;
                    this.favoritePhraseAdded.next({text, success: false});
                    this.scheduleReset();
                  });
                });
      }
    } else if (
        this.isDeletion &&
        (this.state === State.READY || this.state === State.RESTORED)) {
      // This is a to-be-deleted phrase and it hasn't been deleted yet.
      if (!this.phraseId) {
        throw new Error('Cannot delete phrase: Empty phrase ID');
      }
      this.state = State.REQUESTING;
      this.eventLogger.logContextualPhraseDelete(getPhraseStats(this.phrase));
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
                  this.eventLogger.logContextualPhraseDeleteError(
                      data.errorMessage);
                  this.state = State.ERROR;
                } else {
                  this.state = State.SUCCESS;
                }
              },
              error => {
                // TODO(cais): Display error in UI.
                this.eventLogger.logContextualPhraseDeleteError('');
                this.state = State.ERROR;
                this.scheduleReset();
                console.error('Deleting quick phrase failed:', error);
              });
    }
  }

  private sendContextualPhraseRrefreshSignal() {
    if (this.inputBarControlSubject) {
      this.inputBarControlSubject.next({
        clearAll: true,
        refreshContextualPhrases: true,
      });
    }
  }

  private scheduleReset() {
    setTimeout(() => {
      this.state = State.READY;
    }, FavoriteButtonComponent.STATE_DELAY_MILLIS);
  }
}
