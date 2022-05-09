/** Unit tests for the favorite button. */

import {ComponentFixture, fakeAsync, TestBed, tick} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Observable, of, Subject} from 'rxjs';

import {HttpEventLogger} from '../event-logger/event-logger-impl';
import {InputBarControlEvent} from '../input-bar/input-bar.component';
import {SpeakFasterService} from '../speakfaster-service';
import {AddContextualPhraseRequest, AddContextualPhraseResponse, DeleteContextualPhraseRequest, DeleteContextualPhraseResponse} from '../types/contextual_phrase';
import {TextEntryEndEvent} from '../types/text-entry';

import {FavoriteButtonComponent, State} from './favorite-button.component';
import {FavoriteButtonModule} from './favorite-button.module';

class SpeakFasterServiceForTest {
  addContextualPhrase(request: AddContextualPhraseRequest):
      Observable<AddContextualPhraseResponse> {
    return of({phraseId: request.contextualPhrase.phraseId});
  }

  deleteContextualPhrase(request: DeleteContextualPhraseRequest):
      Observable<DeleteContextualPhraseResponse> {
    return of({phraseId: request.phraseId});
  }
}

describe('FavoriteButton', () => {
  let fixture: ComponentFixture<FavoriteButtonComponent>;
  let speakFasterServiceForTest: SpeakFasterServiceForTest;
  let textEntryEndSubject: Subject<TextEntryEndEvent>;
  let inputBarControlSubject: Subject<InputBarControlEvent>;
  let inputBarControlEvents: InputBarControlEvent[];
  let addedEvents: Array<{text: string, success: boolean}>;
  let httpEventLoggerForTest: HttpEventLogger;

  beforeEach(async () => {
    speakFasterServiceForTest = new SpeakFasterServiceForTest();
    textEntryEndSubject = new Subject();
    inputBarControlSubject = new Subject();
    inputBarControlEvents = [];
    inputBarControlSubject.subscribe((event) => {
      inputBarControlEvents.push(event);
    });
    httpEventLoggerForTest = new HttpEventLogger(null);
    await TestBed
        .configureTestingModule({
          imports: [FavoriteButtonModule],
          declarations: [FavoriteButtonComponent],
          providers: [
            {provide: SpeakFasterService, useValue: speakFasterServiceForTest},
            {provide: HttpEventLogger, useValue: httpEventLoggerForTest},
          ]
        })
        .compileComponents();
    fixture = TestBed.createComponent(FavoriteButtonComponent);
    addedEvents = [];
    fixture.componentInstance.favoritePhraseAdded.subscribe(
        event => addedEvents.push(event));
    fixture.componentInstance.textEntryEndSubject = textEntryEndSubject;
    fixture.componentInstance.inputBarControlSubject = inputBarControlSubject;
    fixture.detectChanges();
  });

  it('initially shows the ready image: not sending user feedback', () => {
    const button = fixture.debugElement.query(By.css('.favorite-button'));
    const img = button.query(By.css('.button-image'));

    expect(img.nativeElement.src.indexOf('/assets/images/favorite.png'))
        .toBeGreaterThanOrEqual(0);
    expect(button.query(By.css('.mat-progress-spinner'))).toBeNull();
  });

  it('initially shows the ready image: is deletion', () => {
    fixture.componentInstance.isDeletion = true;
    fixture.detectChanges();
    const button = fixture.debugElement.query(By.css('.favorite-button'));
    const img = button.query(By.css('.button-image'));

    expect(img.nativeElement.src.indexOf('/assets/images/delete.png'))
        .toBeGreaterThanOrEqual(0);
    expect(button.query(By.css('.mat-progress-spinner'))).toBeNull();
  });

  it('initially shows the add-comment image: sending user feedback', () => {
    fixture.componentInstance.sendAsUserFeedback = true;
    fixture.detectChanges();
    const button = fixture.debugElement.query(By.css('.favorite-button'));
    const img = button.query(By.css('.button-image'));

    expect(img.nativeElement.src.indexOf('/assets/images/add-comment.png'))
        .toBeGreaterThanOrEqual(0);
    expect(button.query(By.css('.mat-progress-spinner'))).toBeNull();
  });

  it('clicking button calls addContextualPhrase and resets state after delay',
     fakeAsync(() => {
       fixture.componentInstance.userId = 'testuser1';
       fixture.componentInstance.phrase = 'hi there!';
       fixture.componentInstance.phraseId = 'deadbeef';
       fixture.detectChanges();
       const button = fixture.debugElement.query(By.css('.favorite-button'));
       const spy = spyOn(speakFasterServiceForTest, 'addContextualPhrase')
                       .and.callThrough();
       button.nativeElement.click();
       fixture.detectChanges();

       expect(fixture.componentInstance.state).toEqual(State.SUCCESS);
       expect(spy).toHaveBeenCalledOnceWith({
         userId: 'testuser1',
         contextualPhrase: {
           phraseId: '',
           text: 'hi there!',
           tags: ['favorite'],
         },
       });
       expect(inputBarControlEvents.length).toEqual(1);
       expect(inputBarControlEvents[0]).toEqual({
         clearAll: true,
         refreshContextualPhrases: true,
       });
       expect(addedEvents).toEqual([{
         text: 'hi there!',
         success: true,
       }]);

       tick(2000);
       expect(fixture.componentInstance.state).toEqual(State.READY);
     }));

  it('error state: clicking button calls addContextualPhrase and resets state after delay',
     fakeAsync(() => {
       fixture.componentInstance.userId = 'testuser1';
       fixture.componentInstance.phrase = 'hi there!';
       fixture.componentInstance.phraseId = 'deadbeef';
       fixture.detectChanges();
       const button = fixture.debugElement.query(By.css('.favorite-button'));
       const spy = spyOn(speakFasterServiceForTest, 'addContextualPhrase')
                       .and.returnValue(of({errorMessage: 'foo error'}));
       button.nativeElement.click();
       fixture.detectChanges();

       expect(fixture.componentInstance.state).toEqual(State.ERROR);
       expect(spy).toHaveBeenCalledOnceWith({
         userId: 'testuser1',
         contextualPhrase: {
           phraseId: '',
           text: 'hi there!',
           tags: ['favorite'],
         },
       });
       expect(addedEvents).toEqual([{
         text: 'hi there!',
         success: false,
       }]);

       tick(2000);
       expect(fixture.componentInstance.state).toEqual(State.READY);
     }));

  for (const [originalTags, expectedRestoreTags] of [
           [['tag1', 'tag2'], ['tag1', 'tag2']],
           [['favorite'], ['favorite']],
  ]) {
    it('deleting phrase, clicking button toggles betweee and and delete calls',
       () => {
         fixture.componentInstance.isDeletion = true;
         fixture.componentInstance.userId = 'testuser1';
         fixture.componentInstance.phrase = 'hi there!';
         fixture.componentInstance.phraseId = 'deadbeef';
         fixture.componentInstance.tags = originalTags.slice();
         fixture.detectChanges();
         const button = fixture.debugElement.query(By.css('.favorite-button'));
         const addSpy = spyOn(speakFasterServiceForTest, 'addContextualPhrase')
                            .and.callThrough();
         const deleteSpy =
             spyOn(speakFasterServiceForTest, 'deleteContextualPhrase')
                 .and.callThrough();
         button.nativeElement.click();
         fixture.detectChanges();

         expect(fixture.componentInstance.state).toEqual(State.SUCCESS);
         expect(addSpy).not.toHaveBeenCalled();
         expect(deleteSpy).toHaveBeenCalledOnceWith({
           userId: 'testuser1',
           phraseId: 'deadbeef',
         });

         expect(button.query(By.css('.button-image'))
                    .nativeElement.src.indexOf('/assets/images/repeat.png'))
             .toBeGreaterThanOrEqual(0);
         button.nativeElement.click();
         fixture.detectChanges();

         expect(fixture.componentInstance.state).toEqual(State.RESTORED);
         expect(addSpy).toHaveBeenCalledOnceWith({
           userId: 'testuser1',
           contextualPhrase: {
             phraseId: '',
             text: 'hi there!',
             tags: expectedRestoreTags.slice(),
           },
         });

         expect(button.query(By.css('.button-image'))
                    .nativeElement.src.indexOf('/assets/images/delete.png'))
             .toBeGreaterThanOrEqual(0);
       });
  }

  it('send user feedback: clicking button calls addContextualPhrase and shows spinner',
     () => {
       fixture.componentInstance.sendAsUserFeedback = true;
       fixture.componentInstance.userId = 'testuser1';
       fixture.componentInstance.phrase = 'this is a test user feedback.';
       fixture.detectChanges();
       const button = fixture.debugElement.query(By.css('.favorite-button'));
       const spy =
           spyOn(httpEventLoggerForTest, 'logUserFeedback').and.callThrough();
       button.nativeElement.click();
       fixture.detectChanges();

       expect(fixture.componentInstance.state).toEqual(State.REQUESTING);
       expect(spy).toHaveBeenCalledOnceWith({
         feedbackMessage: 'this is a test user feedback.',
       });
       expect(button.query(By.css('.mat-progress-spinner'))).not.toBeNull();
     });

  it('send user feedback: clicking button with empty text has no effect',
     () => {
       fixture.componentInstance.userId = 'testuser1';
       fixture.componentInstance.phrase = '';
       fixture.componentInstance.sendAsUserFeedback = true;
       fixture.detectChanges();
       const button = fixture.debugElement.query(By.css('.favorite-button'));
       const spy =
           spyOn(httpEventLoggerForTest, 'logUserFeedback').and.callThrough();
       button.nativeElement.click();
       fixture.detectChanges();

       expect(fixture.componentInstance.state).toEqual(State.READY);
       expect(spy).not.toHaveBeenCalled();
     });

  it('click w/ empty phrase and remembered non-empty phrase adds to favorite',
     () => {
       fixture.componentInstance.userId = 'testuser1';
       textEntryEndSubject.next({
         text: 'This was spoken before',
         isFinal: true,
         timestampMillis: Date.now(),
       });
       const button = fixture.debugElement.query(By.css('.favorite-button'));
       const spy = spyOn(speakFasterServiceForTest, 'addContextualPhrase');
       fixture.componentInstance.phrase = '';
       fixture.detectChanges();
       button.nativeElement.click();

       expect(spy).toHaveBeenCalledWith({
         userId: 'testuser1',
         contextualPhrase: {
           phraseId: '',
           text: 'This was spoken before',
           tags: ['favorite'],
         }
       });
       expect(fixture.componentInstance.state).toEqual(State.REQUESTING);
     });

  it('click w/ empty phrase and no remembered phrase has no effect', () => {
    fixture.componentInstance.userId = 'testuser1';
    fixture.componentInstance.phrase = '';
    fixture.detectChanges();
    const button = fixture.debugElement.query(By.css('.favorite-button'));
    const spy = spyOn(speakFasterServiceForTest, 'addContextualPhrase');
    button.nativeElement.click();

    expect(spy).not.toHaveBeenCalled();
  });
});
