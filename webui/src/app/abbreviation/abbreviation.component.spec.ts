/** Unit tests for AbbreviationComponent. */

import {HttpClientModule} from '@angular/common/http';
import {ComponentFixture, TestBed, tick} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Observable, of, Subject} from 'rxjs';
import {createUuid} from 'src/utils/uuid';

import * as cefSharp from '../../utils/cefsharp';
import {HttpEventLogger} from '../event-logger/event-logger-impl';
import {repeatVirtualKey, VIRTUAL_KEY} from '../external/external-events.component';
import {InputBarControlEvent} from '../input-bar/input-bar.component';
import {clearSettings, setEnableAbbrevExpansionAutoFire} from '../settings/settings';
import {AbbreviationExpansionRespnose, FillMaskRequest, SpeakFasterService, TextPredictionRequest, TextPredictionResponse} from '../speakfaster-service';
import {StudyManager} from '../study/study-manager';
import {TestListener} from '../test-utils/test-cefsharp-listener';
import {AbbreviationSpec, InputAbbreviationChangedEvent} from '../types/abbreviation';
import {TextEntryEndEvent} from '../types/text-entry';

import {AbbreviationComponent, State} from './abbreviation.component';
import {AbbreviationModule} from './abbreviation.module';

class SpeakFasterServiceForTest {
  expandAbbreviation(
      speechContent: string, abbreviationSpec: AbbreviationSpec,
      numSamples: number,
      precedingText?: string): Observable<AbbreviationExpansionRespnose> {
    return of({});
  }

  textPrediction(textPredictionRequest: TextPredictionRequest):
      Observable<TextPredictionResponse> {
    return of({});
  }
}

describe('AbbreviationComponent', () => {
  let speakFasterServiceForTest: SpeakFasterServiceForTest;
  let abbreviationExpansionTriggers: Subject<InputAbbreviationChangedEvent>;
  let fillMaskTriggers: Subject<FillMaskRequest>;
  let textEntryEndSubject: Subject<TextEntryEndEvent>;
  let inputBarControlSubject: Subject<InputBarControlEvent>;
  let studyManager: StudyManager;
  let fixture: ComponentFixture<AbbreviationComponent>;
  let testListener: TestListener;
  let abbreviationChangeEvents: InputAbbreviationChangedEvent[];
  let inputBarControlEvents: InputBarControlEvent[];

  beforeEach(async () => {
    clearSettings();
    speakFasterServiceForTest = new SpeakFasterServiceForTest();
    testListener = new TestListener();
    (window as any)[cefSharp.BOUND_LISTENER_NAME] = testListener;
    studyManager = new StudyManager(null, null);
    await TestBed
        .configureTestingModule({
          imports: [AbbreviationModule, HttpClientModule],
          declarations: [AbbreviationComponent],
          providers: [
            {provide: SpeakFasterService, useValue: speakFasterServiceForTest},
            {provide: HttpEventLogger, useValue: new HttpEventLogger(null)},
            {provide: StudyManager, useValue: studyManager},
          ]
        })
        .compileComponents();
    abbreviationExpansionTriggers = new Subject();
    abbreviationChangeEvents = [];
    abbreviationExpansionTriggers.subscribe(
        (event) => abbreviationChangeEvents.push(event));
    inputBarControlSubject = new Subject();
    inputBarControlEvents = [];
    inputBarControlSubject.subscribe(
        (event) => inputBarControlEvents.push(event));
    fillMaskTriggers = new Subject();
    textEntryEndSubject = new Subject();
    fixture = TestBed.createComponent(AbbreviationComponent);
    fixture.componentInstance.abbreviationExpansionTriggers =
        abbreviationExpansionTriggers;
    fixture.componentInstance.inputBarControlSubject = inputBarControlSubject;
    fixture.componentInstance.fillMaskTriggers = fillMaskTriggers;
    fixture.componentInstance.textEntryEndSubject = textEntryEndSubject;
    fixture.componentInstance.conversationTurns = [];
    fixture.detectChanges();
  });

  afterAll(async () => {
    if (cefSharp.BOUND_LISTENER_NAME in (window as any)) {
      delete (window as any)[cefSharp.BOUND_LISTENER_NAME];
    }
  });

  it('initially displays no abbreviation options', () => {
    const abbreviationOptions =
        fixture.debugElement.queryAll(By.css('.abbreviation-option'));
    expect(abbreviationOptions.length).toEqual(0);
  });

  it('initially displays no abort button', () => {
    const abortButtons =
        fixture.debugElement.queryAll(By.css('.action-abort-button'));
    expect(abortButtons.length).toEqual(0);
  });

  it('initially displays no expand-abbreviation button', () => {
    const expandButton =
        fixture.debugElement.queryAll(By.css('.expand-abbreviation-button'));
    expect(expandButton.length).toEqual(0);
  });

  for (const [contextStrings, precedingText] of [
           [[], undefined],
           [['hello'], 'hi'],
  ] as Array<[string[], string | undefined]>) {
    it('sends http request on trigger: ' +
           `contextStrings = ${JSON.stringify(contextStrings)}`,
       () => {
         fixture.componentInstance.conversationTurns =
             contextStrings.map(str => ({
                                  speakerId: 'partner1',
                                  speechContent: str,
                                  startTimestamp: new Date(),
                                }));
         const spy = spyOn(
                         fixture.componentInstance.speakFasterService,
                         'expandAbbreviation')
                         .and.returnValue(of({
                           exactMatches: ['how are you', 'how about you'],
                         }));
         const abbreviationSpec: AbbreviationSpec = {
           tokens: [
             {
               value: 'h',
               isKeyword: false,
             },
             {
               value: 'a',
               isKeyword: false,
             },
             {
               value: 'y',
               isKeyword: false,
             }
           ],
           readableString: 'ace',
           precedingText,
           lineageId: createUuid(),
         };
         abbreviationExpansionTriggers.next({
           abbreviationSpec,
           requestExpansion: true,
         });
         expect(spy).toHaveBeenCalledOnceWith(
             contextStrings.join('|'), abbreviationSpec, 128, precedingText);
         expect(fixture.componentInstance.abbreviationOptions).toEqual([
           'how are you', 'how about you'
         ]);
       });
  }

  function populateAbbreviationOptions(options: string[]) {
    fixture.componentInstance.abbreviationOptions.splice(0);
    fixture.componentInstance.abbreviationOptions.push(...options);
  }

  it('displays expansion options when available', () => {
    populateAbbreviationOptions(['what time is it', 'we took it in']);
    fixture.componentInstance.state = State.CHOOSING_EXPANSION;
    fixture.detectChanges();
    const expansions =
        fixture.debugElement.queryAll(By.css('app-phrase-component'));
    expect(expansions.length).toEqual(2);
    expect(expansions[0].nativeElement.innerText).toEqual('what time is it');
    expect(expansions[1].nativeElement.innerText).toEqual('we took it in');
    const selectButtons =
        fixture.debugElement.queryAll(By.css('app-phrase-component'));
    expect(selectButtons.length).toEqual(2);
    const speakButtons = fixture.debugElement.queryAll(By.css('.speak-button'));
    expect(speakButtons.length).toEqual(2);
  });

  it('Calls injectKeys when option is selected', async () => {
    fixture.componentInstance.abbreviation = {
      tokens: ['w', 't', 'i', 'i'].map(char => ({
                                         value: char,
                                         isKeyword: false,
                                       })),
      readableString: 'wtii',
      triggerKeys: [VIRTUAL_KEY.SPACE, VIRTUAL_KEY.SPACE],
      eraserSequence: repeatVirtualKey(VIRTUAL_KEY.BACKSPACE, 8),
      lineageId: createUuid(),
    };
    populateAbbreviationOptions(['what time is it']);
    fixture.componentInstance.state = State.CHOOSING_EXPANSION;
    fixture.detectChanges();
    const selectButtons =
        fixture.debugElement.queryAll(By.css('.inject-button'));
    (selectButtons[0].nativeElement as HTMLButtonElement).click();
    await fixture.whenStable();
    const calls = testListener.injectedKeysCalls;
    expect(calls.length).toEqual(1);
    // NOTE: For now we exclude the eraser sequence: [8,  8,  8,  8,  8,  8,  8,
    // 8]. Includes the leading eraser keys and the trailing space.
    expect(calls[0]).toEqual(
        [87, 72, 65, 84, 32, 84, 73, 77, 69, 32, 73, 83, 32, 73, 84, 190, 32]);
    expect(testListener.injectedTextCalls).toEqual(['what time is it. ']);
  });

  it('clicking inject-button publishes to textEntryEndSubject', () => {
    const events: TextEntryEndEvent[] = [];
    textEntryEndSubject.subscribe(event => {
      events.push(event);
    });
    fixture.componentInstance.abbreviation = {
      tokens: ['w', 't', 'i', 'i'].map(char => ({
                                         value: char,
                                         isKeyword: false,
                                       })),
      readableString: 'wtii',
      triggerKeys: [VIRTUAL_KEY.SPACE, VIRTUAL_KEY.SPACE],
      lineageId: createUuid(),
    };
    populateAbbreviationOptions(['what time is it', 'we took it in']);
    fixture.componentInstance.state = State.CHOOSING_EXPANSION;
    fixture.detectChanges();
    const selectButtons =
        fixture.debugElement.queryAll(By.css('.inject-button'));
    (selectButtons[1].nativeElement as HTMLButtonElement).click();
    expect(events.length).toEqual(1);
    expect(events[0].text).toEqual('we took it in');
    expect(events[0].isFinal).toBeTrue();
    expect(events[0].timestampMillis).toBeGreaterThan(0);
    expect(events[0].inAppTextToSpeechAudioConfig).toBeUndefined();
    // "wtii" as a length 4; the trigger keys has a lenght 2; additionally,
    // there is the selection key at the end.
    const expectedNumKeypresses = 4 + 2 + 1;
    expect(events[0].numKeypresses).toEqual(expectedNumKeypresses);
    expect(events[0].numHumanKeypresses).toEqual(expectedNumKeypresses);
  });

  it('clicking speak-button publishes to textEntryEndSubject, with audio config',
     () => {
       const events: TextEntryEndEvent[] = [];
       textEntryEndSubject.subscribe(event => {
         events.push(event);
       });
       fixture.componentInstance.abbreviation = {
         tokens: ['w', 't', 'i', 'i'].map(char => ({
                                            value: char,
                                            isKeyword: false,
                                          })),
         readableString: 'wtii',
         triggerKeys: [VIRTUAL_KEY.SPACE, VIRTUAL_KEY.SPACE],
         lineageId: createUuid(),
       };
       populateAbbreviationOptions(['what time is it', 'we took it in']);
       fixture.componentInstance.state = State.CHOOSING_EXPANSION;
       fixture.detectChanges();
       const selectButtons =
           fixture.debugElement.queryAll(By.css('.speak-button'));
       (selectButtons[1].nativeElement as HTMLButtonElement).click();
       expect(events.length).toEqual(1);
       expect(events[0].text).toEqual('we took it in');
       expect(events[0].isFinal).toBeTrue();
       expect(events[0].timestampMillis).toBeGreaterThan(0);
       // "wtii" as a length 4; the trigger keys has a lenght 2; additionally,
       // there is the selection key at the end.
       const expectedNumKeypresses = 4 + 2 + 1;
       expect(events[0].numKeypresses).toEqual(expectedNumKeypresses);
       expect(events[0].numHumanKeypresses).toEqual(expectedNumKeypresses);
     });

  it('getting AE options resets error', () => {
    fixture.componentInstance.responseError = 'foo error';
    abbreviationExpansionTriggers.next({
      abbreviationSpec: {
        tokens: [{
          value: 'a',
          isKeyword: false,
        }],
        readableString: 'a',
        lineageId: createUuid(),
      },
      requestExpansion: true,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.responseError).toBeNull();
  });

  it('clicking the container issues refocus signal', () => {
    const container = fixture.debugElement.query(By.css('.container'));
    container.nativeElement.click();

    expect(inputBarControlEvents.length).toEqual(1);
  });

  it('isStudyOn is initially false', () => {
    expect(fixture.componentInstance.isStudyOn).toBeFalse();
  });

  it('isStudyOn is true when studyManager receives command', () => {
    studyManager.maybeHandleRemoteControlCommand('study on');

    expect(fixture.componentInstance.isStudyOn).toBeTrue();
  });

  it('isStudyOn goes back to false when study is ended', () => {
    studyManager.maybeHandleRemoteControlCommand('study on');
    studyManager.maybeHandleRemoteControlCommand('study off');

    expect(fixture.componentInstance.isStudyOn).toBeFalse();
  });

  it('displays expansion options with emphasized speak button during study',
     () => {
       studyManager.maybeHandleRemoteControlCommand('study on');
       populateAbbreviationOptions(['what time is it', 'we took it in']);
       fixture.componentInstance.state = State.CHOOSING_EXPANSION;
       fixture.detectChanges();
       const expansions =
           fixture.debugElement.queryAll(By.css('app-phrase-component'));
       expect(expansions.length).toEqual(2);
       expect(expansions[0].nativeElement.innerText).toEqual('what time is it');
       expect(expansions[1].nativeElement.innerText).toEqual('we took it in');

       const phraseComponents =
           fixture.debugElement.queryAll(By.css('app-phrase-component'));
       expect(phraseComponents.length).toEqual(2);
       expect(phraseComponents[0].componentInstance.emphasizeSpeakButton)
           .toBeTrue();
       expect(phraseComponents[1].componentInstance.emphasizeSpeakButton)
           .toBeTrue();
     });

  it('onTextClicked issues InputBarControlEvent for word chips', async () => {
    populateAbbreviationOptions(['what time is it', 'we took it in']);
    fixture.componentInstance.state = State.CHOOSING_EXPANSION;
    await fixture.componentInstance.onTextClicked(
        {phraseText: 'we took it in', phraseIndex: 1});

    expect(inputBarControlEvents.length).toEqual(1);
    expect(inputBarControlEvents[0]).toEqual({
      chips: [{text: 'we'}, {text: 'took'}, {text: 'it'}, {text: 'in'}],
    });
    expect(fixture.componentInstance.getPhraseBackgroundColor(0))
        .toEqual(AbbreviationComponent.PHRASE_BG_COLOR_DEFAULT);
    expect(fixture.componentInstance.getPhraseBackgroundColor(1))
        .toEqual(AbbreviationComponent.PHRASE_BG_COLOR_DEFAULT);
    expect(fixture.componentInstance.getPhraseHideSpeakButton(0)).toBeFalse();
    expect(fixture.componentInstance.getPhraseHideSpeakButton(1)).toBeFalse();
  });

  it('onTextClicked toggles phrase highlight color under AE auto fire',
     async () => {
       await setEnableAbbrevExpansionAutoFire(true);
       populateAbbreviationOptions(['what time is it', 'we took it in']);
       fixture.componentInstance.state = State.CHOOSING_EXPANSION;
       await fixture.componentInstance.onTextClicked(
           {phraseText: 'we took it in', phraseIndex: 1});

       expect(inputBarControlEvents.length).toEqual(0);
       expect(fixture.componentInstance.getPhraseBackgroundColor(0))
           .toEqual(AbbreviationComponent.PHRASE_BG_COLOR_DEFAULT);
       expect(fixture.componentInstance.getPhraseBackgroundColor(1))
           .toEqual(AbbreviationComponent.PHRASE_BG_COLOR_HIGHLIGHTED);
       expect(fixture.componentInstance.getPhraseHideSpeakButton(0)).toBeTrue();
       expect(fixture.componentInstance.getPhraseHideSpeakButton(1))
           .toBeFalse();

       await fixture.componentInstance.onTextClicked(
           {phraseText: 'what time is it', phraseIndex: 0});

       expect(inputBarControlEvents.length).toEqual(0);
       expect(fixture.componentInstance.getPhraseBackgroundColor(0))
           .toEqual(AbbreviationComponent.PHRASE_BG_COLOR_HIGHLIGHTED);
       expect(fixture.componentInstance.getPhraseBackgroundColor(1))
           .toEqual(AbbreviationComponent.PHRASE_BG_COLOR_DEFAULT);
       expect(fixture.componentInstance.getPhraseHideSpeakButton(0))
           .toBeFalse();
       expect(fixture.componentInstance.getPhraseHideSpeakButton(1)).toBeTrue();
     });

  it('onTextClicked twice toggles issues word chips under AE auto fire',
     async () => {
       await setEnableAbbrevExpansionAutoFire(true);
       populateAbbreviationOptions(['what time is it', 'we took it in']);
       fixture.componentInstance.state = State.CHOOSING_EXPANSION;
       await fixture.componentInstance.onTextClicked(
           {phraseText: 'we took it in', phraseIndex: 1});
       await fixture.componentInstance.onTextClicked(
           {phraseText: 'we took it in', phraseIndex: 1});

       expect(inputBarControlEvents.length).toEqual(1);
       expect(inputBarControlEvents[0]).toEqual({
         chips: [{text: 'we'}, {text: 'took'}, {text: 'it'}, {text: 'in'}],
       });
       expect(fixture.componentInstance.getPhraseBackgroundColor(0))
           .toEqual(AbbreviationComponent.PHRASE_BG_COLOR_DEFAULT);
       expect(fixture.componentInstance.getPhraseBackgroundColor(1))
           .toEqual(AbbreviationComponent.PHRASE_BG_COLOR_DEFAULT);
       expect(fixture.componentInstance.getPhraseHideSpeakButton(0))
           .toBeFalse();
       expect(fixture.componentInstance.getPhraseHideSpeakButton(1))
           .toBeFalse();
     });

  it('under AE auto fire, new AE resets phrase bg color', async () => {
    await setEnableAbbrevExpansionAutoFire(true);
    populateAbbreviationOptions(['what time is it', 'we took it in']);
    fixture.componentInstance.state = State.CHOOSING_EXPANSION;
    await fixture.componentInstance.onTextClicked(
        {phraseText: 'what time is it', phraseIndex: 0});

    const abbreviationSpec: AbbreviationSpec = {
      tokens: [{
        value: 'h',
        isKeyword: false,
      }],
      readableString: 'h',
      precedingText: '',
      lineageId: createUuid(),
    };
    abbreviationExpansionTriggers.next({
      abbreviationSpec,
      requestExpansion: true,
    });

    expect(fixture.componentInstance.getPhraseBackgroundColor(0))
        .toEqual(AbbreviationComponent.PHRASE_BG_COLOR_DEFAULT);
    expect(fixture.componentInstance.getPhraseBackgroundColor(1))
        .toEqual(AbbreviationComponent.PHRASE_BG_COLOR_DEFAULT);
    expect(fixture.componentInstance.getPhraseHideSpeakButton(0)).toBeFalse();
    expect(fixture.componentInstance.getPhraseHideSpeakButton(1)).toBeFalse();
  });
});
