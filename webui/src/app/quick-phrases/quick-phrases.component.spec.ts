/** Unit tests for QuickPhrasesComponent. */
import {Injectable, SimpleChange} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Observable, of, Subject, throwError} from 'rxjs';
import {createUuid} from 'src/utils/uuid';

import * as cefSharp from '../../utils/cefsharp';
import {HttpEventLogger} from '../event-logger/event-logger-impl';
import {SpeakFasterService, TextPredictionRequest, TextPredictionResponse} from '../speakfaster-service';
import {TestListener} from '../test-utils/test-cefsharp-listener';
import {ContextualPhrase} from '../types/contextual_phrase';
import {TextEntryBeginEvent, TextEntryEndEvent} from '../types/text-entry';

import {QuickPhrasesComponent} from './quick-phrases.component';
import {QuickPhrasesModule} from './quick-phrases.module';

type TestMode = 'normal'|'error';

@Injectable()
class SpeakFasterServiceForTest {
  readonly contextualPhrases: ContextualPhrase[] = [];
  private mode: TestMode = 'normal';

  constructor() {
    this.contextualPhrases.push(
        ...[{
          phraseId: createUuid(),
          text: 'Hello',
          tags: ['favorite'],
        },
            {
              phraseId: createUuid(),
              text: 'Thank you',
              tags: ['favorite'],
            },
            {
              phraseId: createUuid(),
              text: 'To living room',
              tags: ['care'],
            },
            {
              phraseId: createUuid(),
              text: 'To bedroom',
              tags: ['care'],
            },
    ]);
    for (let i = 0; i < 30; ++i) {
      this.contextualPhrases.push({
        phraseId: createUuid(),
        text: `Count %{i}`,
        tags: ['counting'],
      });
    }
  }

  public setTestMode(mode: TestMode) {
    this.mode = mode;
  }

  textPrediction(textPredictionRequest: TextPredictionRequest):
      Observable<TextPredictionResponse> {
    if (this.mode === 'error') {
      return throwError('Error');
    } else {
      return of({
        contextualPhrases: this.contextualPhrases.filter(phrase => {
          if (phrase.tags === undefined) {
            return false;
          }
          for (const tag of phrase.tags) {
            if (!textPredictionRequest.allowedTags ||
                textPredictionRequest.allowedTags.indexOf(tag) !== -1) {
              return true;
            }
          }
          return false;
        }),
      });
    }
  }
}

describe('QuickPhrasesComponent', () => {
  let fixture: ComponentFixture<QuickPhrasesComponent>;
  let testListener: TestListener;
  let textEntryBeginSubject: Subject<TextEntryBeginEvent>;
  let textEntryEndSubject: Subject<TextEntryEndEvent>;
  let speakFasterServiceForTest: SpeakFasterServiceForTest;

  beforeEach(async () => {
    speakFasterServiceForTest = new SpeakFasterServiceForTest();
    testListener = new TestListener();
    textEntryBeginSubject = new Subject();
    textEntryEndSubject = new Subject();
    (window as any)[cefSharp.BOUND_LISTENER_NAME] = testListener;
    await TestBed
        .configureTestingModule({
          imports: [QuickPhrasesModule],
          declarations: [QuickPhrasesComponent],
          providers: [
            {provide: SpeakFasterService, useValue: speakFasterServiceForTest},
            {provide: HttpEventLogger, useValue: new HttpEventLogger(null)},
          ],
        })
        .compileComponents();
    fixture = TestBed.createComponent(QuickPhrasesComponent);
    fixture.componentInstance.textEntryBeginSubject = textEntryBeginSubject;
    fixture.componentInstance.textEntryEndSubject = textEntryEndSubject;
    fixture.detectChanges();
  });

  it('shows PhraseComponents when phrases are non-empty', async () => {
    fixture.componentInstance.allowedTags = ['favorite'];
    fixture.componentInstance.ngOnChanges({
      allowedTags: new SimpleChange(
          undefined, fixture.componentInstance.allowedTags, true),
    });
    await fixture.whenStable();
    const phraseComponents =
        fixture.debugElement.queryAll(By.css('app-phrase-component'));
    const noQuickPhrases =
        fixture.debugElement.query(By.css('.no-quick-phrases'));
    const scrollButtons =
        fixture.debugElement.queryAll(By.css('.scroll-button'));
    const error = fixture.debugElement.query(By.css('.error'));

    expect(phraseComponents.length).toEqual(2);
    expect(phraseComponents[0].componentInstance.phraseText).toEqual('Hello');
    expect(phraseComponents[0].componentInstance.phraseIndex).toEqual(0);
    expect(phraseComponents[1].componentInstance.phraseText)
        .toEqual('Thank you');
    expect(phraseComponents[1].componentInstance.phraseIndex).toEqual(1);
    expect(noQuickPhrases).toBeNull();
    expect(scrollButtons).toEqual([]);
    expect(error).toBeNull();
  });

  it('hides progress spinner after successful prhase retrieval', async () => {
    fixture.componentInstance.allowedTags = ['favorite'];
    fixture.componentInstance.ngOnChanges({
      allowedTags: new SimpleChange(
          undefined, fixture.componentInstance.allowedTags, true),
    });
    await fixture.whenStable();

    const retrievingPhrases =
        fixture.debugElement.query(By.css('.retrieving-quick-phrases'));
    expect(retrievingPhrases).toBeNull();
    const matProgressSpinner =
        fixture.debugElement.query(By.css('mat-progress-spinner'));
    expect(matProgressSpinner).toBeNull();
  });

  it('shows no-quick-phrases label when phrases are empty', async () => {
    fixture.componentInstance.allowedTags = ['nonexistent_tag'];
    fixture.componentInstance.ngOnChanges({
      allowedTags: new SimpleChange(
          ['favorite'], fixture.componentInstance.allowedTags, false),
    });
    await fixture.whenStable();
    const phraseComponents =
        fixture.debugElement.queryAll(By.css('app-phrase-component'));
    const noQuickPhrases =
        fixture.debugElement.query(By.css('.no-quick-phrases'));

    expect(phraseComponents).toEqual([]);
    expect(noQuickPhrases).not.toBeNull();
  });

  it('phrase speak button triggers text entry begin-end events', async () => {
    let beginEvents: TextEntryBeginEvent[] = [];
    let endEvents: TextEntryEndEvent[] = [];
    textEntryBeginSubject.subscribe(event => {
      beginEvents.push(event);
    });
    textEntryEndSubject.subscribe(event => {
      endEvents.push(event);
    });
    fixture.componentInstance.allowedTags = ['favorite'];
    fixture.componentInstance.ngOnChanges({
      allowedTags: new SimpleChange(
          undefined, fixture.componentInstance.allowedTags, true),
    });
    await fixture.whenStable();
    const phraseComponents =
        fixture.debugElement.queryAll(By.css('app-phrase-component'));
    phraseComponents[0].componentInstance.speakButtonClicked.emit(
        {phraseText: 'Hello', phraseIndex: 0});

    expect(beginEvents.length).toEqual(1);
    expect(beginEvents[0].timestampMillis).toBeGreaterThan(0);
    expect(endEvents.length).toEqual(1);
    expect(endEvents[0].text).toEqual('Hello');
    expect(endEvents[0].timestampMillis)
        .toBeGreaterThan(beginEvents[0].timestampMillis);
    expect(endEvents[0].injectedKeys).toBeUndefined();
    expect(endEvents[0].isFinal).toEqual(true);
    expect(endEvents[0].inAppTextToSpeechAudioConfig).toEqual({
      volume_gain_db: 0
    });
    expect(testListener.injectedKeysCalls.length).toEqual(0);
  });

  it('phrase inject button triggers tex entry begin-end events', async () => {
    let beginEvents: TextEntryBeginEvent[] = [];
    let endEvents: TextEntryEndEvent[] = [];
    textEntryBeginSubject.subscribe(event => {
      beginEvents.push(event);
    });
    textEntryEndSubject.subscribe(event => {
      endEvents.push(event);
    });
    fixture.componentInstance.allowedTags = ['favorite'];
    fixture.componentInstance.ngOnChanges({
      allowedTags: new SimpleChange(
          undefined, fixture.componentInstance.allowedTags, true),
    });
    await fixture.whenStable();
    const phraseComponents =
        fixture.debugElement.queryAll(By.css('app-phrase-component'));
    phraseComponents[1].componentInstance.injectButtonClicked.emit(
        {phraseText: 'Thank you', phraseIndex: 1});

    expect(beginEvents.length).toEqual(1);
    expect(beginEvents[0].timestampMillis).toBeGreaterThan(0);
    expect(endEvents.length).toEqual(1);
    expect(endEvents[0].text).toEqual('Thank you');
    expect(endEvents[0].timestampMillis)
        .toBeGreaterThan(beginEvents[0].timestampMillis);
    expect(endEvents[0].isFinal).toEqual(true);
    expect(endEvents[0].inAppTextToSpeechAudioConfig).toBeUndefined();
    expect(testListener.injectedKeysCalls.length).toEqual(1);
    expect(testListener.injectedKeysCalls[0].length)
        .toEqual('Thank you'.length + 1);
  });

  it('when overflow happens, shows scroll buttons and registers buttons boxes',
     async () => {
       // Assume that 30 phrases of 'Counting ...' is enough to cause overflow
       // and therefore scrolling. Same below.
       fixture.componentInstance.allowedTags = ['counting'];
       fixture.componentInstance.ngOnChanges({
         allowedTags: new SimpleChange(
             undefined, fixture.componentInstance.allowedTags, true),
       });
       await fixture.whenStable();
       const phrasesContainer =
           fixture.debugElement.query(By.css('.quick-phrases-container'));

       const scrollButtons =
           fixture.debugElement.queryAll(By.css('.scroll-button'));
       expect(scrollButtons.length).toEqual(2);
       expect(phrasesContainer.nativeElement.scrollTop).toEqual(0);
       const buttonBoxCalls = testListener.updateButtonBoxesCalls.filter(
           (call) => {return call[0].startsWith('QuickPhrasesComponent_')});
       const lastButtonBoxCall = buttonBoxCalls[buttonBoxCalls.length - 1];
       expect(lastButtonBoxCall[1].length).toEqual(2);
       expect(lastButtonBoxCall[1][0].length).toEqual(4);
       expect(lastButtonBoxCall[1][1].length).toEqual(4);
     });

  it('clicking scroll down button updates scrollTop', async () => {
    fixture.componentInstance.allowedTags = ['counting'];
    fixture.componentInstance.ngOnChanges({
      allowedTags: new SimpleChange(
          undefined, fixture.componentInstance.allowedTags, true),
    });
    await fixture.whenStable();
    const phrasesContainer =
        fixture.debugElement.query(By.css('.quick-phrases-container'));

    const scrollButtons =
        fixture.debugElement.queryAll(By.css('.scroll-button'));
    scrollButtons[1].nativeElement.click();
    await fixture.whenStable();
    expect(phrasesContainer.nativeElement.scrollTop).toBeGreaterThan(0);
  });

  it('clicking scroll down then scroll up updates scrollTop', async () => {
    fixture.componentInstance.allowedTags = ['counting'];
    fixture.componentInstance.ngOnChanges({
      allowedTags: new SimpleChange(
          undefined, fixture.componentInstance.allowedTags, true),
    });
    await fixture.whenStable();
    const phrasesContainer =
        fixture.debugElement.query(By.css('.quick-phrases-container'));

    const scrollButtons =
        fixture.debugElement.queryAll(By.css('.scroll-button'));
    scrollButtons[1].nativeElement.click();
    await fixture.whenStable();
    scrollButtons[0].nativeElement.click();
    await fixture.whenStable();
    expect(phrasesContainer.nativeElement.scrollTop).toEqual(0);
  });

  it('shows progress spinner during request', () => {
    const retrievingPhrases =
        fixture.debugElement.queryAll(By.css('.retrieving-quick-phrases'));
    expect(retrievingPhrases.length).toEqual(1);
    const matProgressSpinner =
        fixture.debugElement.queryAll(By.css('mat-progress-spinner'));
    expect(matProgressSpinner.length).toEqual(1);
  });

  it('shows error message when error occurs', async () => {
    speakFasterServiceForTest.setTestMode('error');
    fixture.componentInstance.allowedTags = ['favorite'];
    fixture.componentInstance.ngOnChanges({
      allowedTags: new SimpleChange(
          undefined, fixture.componentInstance.allowedTags, true),
    });
    await fixture.whenStable();

    const errors = fixture.debugElement.queryAll(By.css('.error'));
    expect(errors.length).toEqual(1);
  });
});
