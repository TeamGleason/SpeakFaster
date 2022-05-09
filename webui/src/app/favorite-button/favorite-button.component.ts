/**
 * A button for adding a phrase to favorite. Supports animation that
 * indicates states such as ongoing request, success and error.
 */
import {Component, EventEmitter, Input, OnDestroy, OnInit, Output} from '@angular/core';
import {Subject, Subscription} from 'rxjs';

import {getContextualPhraseStats, getPhraseStats, HttpEventLogger} from '../event-logger/event-logger-impl';
import {InputBarControlEvent} from '../input-bar/input-bar.component';
import {SpeakFasterService} from '../speakfaster-service';
import {AddContextualPhraseResponse, ContextualPhrase} from '../types/contextual_phrase';
import {TextEntryEndEvent} from '../types/text-entry';

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
  // If provided, will use the events to remember the last entered non-empty
  // text, and when the button is clicked while `phrase` is empty, the remebered
  // non-empty text will be added to favorite.
  @Input() textEntryEndSubject?: Subject<TextEntryEndEvent>;
  @Input() sendAsUserFeedback: boolean = false;
  @Input()
  tags: string[]|undefined =
      [FavoriteButtonComponent.DEFAULT_CONTEXTUAL_PHRASE_TAG];
  @Input() inputBarControlSubject?: Subject<InputBarControlEvent>;
  @Output()
  favoritePhraseAdded: EventEmitter<{text: string, success: boolean}> =
      new EventEmitter();

  state: State = State.READY;
  private textEntryEndSubjectSubscription?: Subscription;
  private lastNonEmptyText: string|null = null;

  constructor(
      public speakFasterService: SpeakFasterService,
      private eventLogger: HttpEventLogger) {}

  ngOnInit() {
    if (this.textEntryEndSubject) {
      this.textEntryEndSubjectSubscription =
          this.textEntryEndSubject.subscribe((event: TextEntryEndEvent) => {
            if (!event.isFinal || event.repeatLastNonEmpty || event.isAborted ||
                !event.text.trim()) {
              return;
            }
            // Remember the last-entered, non-empty phrase.
            this.lastNonEmptyText = event.text.trim();
          });
    }
  }

  ngOnDestroy() {
    if (this.textEntryEndSubjectSubscription) {
      this.textEntryEndSubjectSubscription.unsubscribe();
    }
  }

  onFavoriteButtonClicked(event: Event) {
    let phrase = this.phrase.trim() || this.lastNonEmptyText;
    if (!phrase) {
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
              feedbackMessage: phrase.trim(),
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
        const text = phrase.trim();
        const contextualPhrase: ContextualPhrase = {
          phraseId: '',  // For AddContextualPhraseRequest, this is ignored.
          text,
          // TODO(cais): Add unit test.
          tags: this.tags ||
              [FavoriteButtonComponent.DEFAULT_CONTEXTUAL_PHRASE_TAG],
        };
        if (this.phraseDisplayText) {
          contextualPhrase.displayText = this.phraseDisplayText;
        }
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
      this.eventLogger.logContextualPhraseDelete(getPhraseStats(phrase));
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
