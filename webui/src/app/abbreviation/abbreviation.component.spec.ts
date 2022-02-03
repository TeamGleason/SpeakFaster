/** Unit tests for AbbreviationComponent. */

import {HttpClientModule} from '@angular/common/http';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {of, Subject} from 'rxjs';
import {createUuid} from 'src/utils/uuid';

import * as cefSharp from '../../utils/cefsharp';
import {ExternalEventsComponent, repeatVirtualKey, VIRTUAL_KEY} from '../external/external-events.component';
import {configureService} from '../speakfaster-service';
import {TestListener} from '../test-utils/test-cefsharp-listener';
import {AbbreviationSpec, InputAbbreviationChangedEvent} from '../types/abbreviation';
import {TextEntryEndEvent} from '../types/text-entry';

import {AbbreviationComponent, State} from './abbreviation.component';
import {AbbreviationModule} from './abbreviation.module';

describe('AbbreviationComponent', () => {
  let abbreviationExpansionTriggers: Subject<InputAbbreviationChangedEvent>;
  let textEntryEndSubject: Subject<TextEntryEndEvent>;
  let fixture: ComponentFixture<AbbreviationComponent>;
  let testListener: TestListener;
  let abbreviationChangeEvents: InputAbbreviationChangedEvent[];

  beforeEach(async () => {
    testListener = new TestListener();
    (window as any)[cefSharp.BOUND_LISTENER_NAME] = testListener;
    await TestBed
        .configureTestingModule({
          imports: [AbbreviationModule, HttpClientModule],
          declarations: [AbbreviationComponent],
        })
        .compileComponents();
    abbreviationExpansionTriggers = new Subject();
    abbreviationChangeEvents = [];
    abbreviationExpansionTriggers.subscribe(
        (event) => abbreviationChangeEvents.push(event));
    textEntryEndSubject = new Subject();
    fixture = TestBed.createComponent(AbbreviationComponent);
    fixture.componentInstance.abbreviationExpansionTriggers =
        abbreviationExpansionTriggers;
    fixture.componentInstance.textEntryEndSubject = textEntryEndSubject;
    fixture.detectChanges();
    configureService({
      endpoint: '',
      accessToken: null,
    });
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

  it('displays expand-abbreviation button after text becomes non-empty', () => {
    fixture.componentInstance.listenToKeypress(['a'], 'a');
    fixture.detectChanges();

    const expandButton =
        fixture.debugElement.queryAll(By.css('.expand-abbreviation-button'));
    expect(expandButton.length).toEqual(1);
  });

  it('Erases text to empty hides expand-abbreviation button', () => {
    fixture.componentInstance.listenToKeypress(['a'], 'a');
    fixture.componentInstance.listenToKeypress(
        ['a', VIRTUAL_KEY.BACKSPACE], '');
    fixture.detectChanges();

    const expandButton =
        fixture.debugElement.queryAll(By.css('.expand-abbreviation-button'));
    expect(expandButton.length).toEqual(0);
    expect(expandButton.length).toEqual(0);
  });

  it('clicking expand-abbreviation button sends trigger', () => {
    const triggers: InputAbbreviationChangedEvent[] = [];
    fixture.componentInstance.abbreviationExpansionTriggers.subscribe(
        trigger => {
          triggers.push(trigger);
        });
    fixture.componentInstance.listenToKeypress(['a'], 'a');
    fixture.componentInstance.listenToKeypress(['a', 'b'], 'ab');
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', VIRTUAL_KEY.SPACE], 'ab ');
    fixture.detectChanges();
    const expandButton =
        fixture.debugElement.query(By.css('.expand-abbreviation-button'));
    expandButton.nativeElement.click();

    expect(triggers.length).toEqual(1);
    expect(triggers[0].abbreviationSpec.tokens).toEqual([
      {
        value: 'a',
        isKeyword: false,
      },
      {value: 'b', isKeyword: false}
    ]);
    expect(triggers[0].abbreviationSpec.readableString).toEqual('ab');
    expect(triggers[0].requestExpansion).toBeTrue();
  });

  for (const [contextStrings, precedingText] of [
           [[], undefined],
           [['hello'], 'hi'],
  ] as Array<[string[], string | undefined]>) {
    it('sends http request on trigger: ' +
           `contextStrings = ${JSON.stringify(contextStrings)}`,
       () => {
         fixture.componentInstance.contextStrings = contextStrings;
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

  it('displays expansion options when available', () => {
    fixture.componentInstance.abbreviationOptions =
        ['what time is it', 'we took it in'];
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
    fixture.componentInstance.abbreviationOptions = ['what time is it'];
    fixture.componentInstance.state = State.CHOOSING_EXPANSION;
    fixture.detectChanges();
    const selectButtons =
        fixture.debugElement.queryAll(By.css('.inject-button'));
    (selectButtons[0].nativeElement as HTMLButtonElement).click();
    await fixture.whenStable();
    const calls = testListener.injectedKeysCalls;
    expect(calls.length).toEqual(1);
    // Includes the leading eraser keys and the trailing space.
    expect(calls[0]).toEqual([
      8,  8,  8,  8,  8,  8,  8,  8,  87, 72, 65, 84,
      32, 84, 73, 77, 69, 32, 73, 83, 32, 73, 84, 32,
    ]);
  });

  it('clicking abort button resets state and send end event', () => {
    const textEntryEndEvents: TextEntryEndEvent[] = [];
    textEntryEndSubject.subscribe(event => {
      textEntryEndEvents.push(event);
    });
    fixture.componentInstance.reconstructedText = 'wtii  ';
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
    fixture.componentInstance.abbreviationOptions = ['what time is it'];
    fixture.componentInstance.state = State.CHOOSING_EXPANSION;
    fixture.detectChanges();
    const abortButtons =
        fixture.debugElement.query(By.css('.action-abort-button'));
    abortButtons.nativeElement.click();
    fixture.detectChanges();

    const {componentInstance} = fixture;
    expect(componentInstance.state).toEqual(State.PRE_CHOOSING_EXPANSION);
    expect(componentInstance.abbreviation).toBeNull();
    expect(componentInstance.responseError).toBeNull();
    expect(componentInstance.abbreviationOptions).toEqual([]);
    expect(componentInstance.reconstructedText).toEqual('');
    expect(textEntryEndEvents.length).toEqual(1);
    expect(textEntryEndEvents[0].text).toEqual('');
    expect(textEntryEndEvents[0].timestampMillis).toBeGreaterThan(0);
    expect(textEntryEndEvents[0].isFinal).toBeTrue();
    expect(textEntryEndEvents[0].isAborted).toBeTrue();
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
    fixture.componentInstance.abbreviationOptions =
        ['what time is it', 'we took it in'];
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
       fixture.componentInstance.abbreviationOptions =
           ['what time is it', 'we took it in'];
       fixture.componentInstance.state = State.CHOOSING_EXPANSION;
       fixture.detectChanges();
       const selectButtons =
           fixture.debugElement.queryAll(By.css('.speak-button'));
       (selectButtons[1].nativeElement as HTMLButtonElement).click();
       expect(events.length).toEqual(1);
       expect(events[0].text).toEqual('we took it in');
       expect(events[0].isFinal).toBeTrue();
       expect(events[0].timestampMillis).toBeGreaterThan(0);
       expect(events[0].inAppTextToSpeechAudioConfig).toEqual({
         volume_gain_db: 0
       });
       // "wtii" as a length 4; the trigger keys has a lenght 2; additionally,
       // there is the selection key at the end.
       const expectedNumKeypresses = 4 + 2 + 1;
       expect(events[0].numKeypresses).toEqual(expectedNumKeypresses);
       expect(events[0].numHumanKeypresses).toEqual(expectedNumKeypresses);
     });

  it('shows request ongoing spinner and message during server call', () => {
    fixture.componentInstance.contextStrings = ['hello'];
    fixture.componentInstance.listenToKeypress(
        ['h', 'a', 'y', ' ', ' '], 'hay  ');
    fixture.detectChanges();

    const requestOngoingMessages =
        fixture.debugElement.queryAll(By.css('.request-ongoing-message'));
    expect(requestOngoingMessages.length).toEqual(1);
    expect(requestOngoingMessages[0].nativeElement.innerText)
        .toEqual('Getting abbrevaition expansions...');
    const spinners =
        fixture.debugElement.queryAll(By.css('mat-progress-spinner'));
    expect(spinners.length).toEqual(1);
  });
  it('shows request ongoing spinner and message during server call',
     async () => {
       fixture.componentInstance.contextStrings = ['hello'];
       fixture.componentInstance.listenToKeypress(
           ['h', 'a', 'y', ' ', ' '], 'hay  ');
       fixture.detectChanges();

       const requestOngoingMessages =
           fixture.debugElement.queryAll(By.css('.request-ongoing-message'));
       expect(requestOngoingMessages.length).toEqual(1);
       expect(requestOngoingMessages[0].nativeElement.innerText)
           .toEqual('Getting abbrevaition expansions...');
       const spinners =
           fixture.debugElement.queryAll(By.css('mat-progress-spinner'));
       expect(spinners.length).toEqual(1);
     });

  for (const [keySequence, precedingText] of [
           [['h', 'a', 'y', ' ', ' '], undefined],
           [[' ', 'h', 'a', 'y', ' ', ' '], undefined],
           [['a', ' ', 'h', 'a', 'y', ' ', ' '], 'a'],
  ] as Array<[string[], string | undefined]>) {
    it(`Double space triggers abbreviation expansion, key codes = ${
           keySequence}`,
       () => {
         spyOn(
             fixture.componentInstance.speakFasterService, 'expandAbbreviation')
             .and.returnValue(of({
               exactMatches: ['how are you', 'how about you'],
             }));
         fixture.componentInstance.contextStrings = ['hello'];
         fixture.componentInstance.listenToKeypress(
             keySequence, keySequence.join(''));
         const expected: InputAbbreviationChangedEvent = {
           abbreviationSpec: {
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
             precedingText,
             readableString: 'hay',
             eraserSequence: repeatVirtualKey(VIRTUAL_KEY.BACKSPACE, 5),
             lineageId: abbreviationChangeEvents[0].abbreviationSpec.lineageId,
           },
           requestExpansion: true,
         };
         expect(abbreviationChangeEvents).toEqual([expected]);
       });
  }

  it('Shows no-option mesasage and try-again button if no option', () => {
    spyOn(fixture.componentInstance.speakFasterService, 'expandAbbreviation')
        .and.returnValue(of({}));
    fixture.componentInstance.contextStrings = ['hello'];
    fixture.componentInstance.listenToKeypress(
        ['h', 'a', 'y', ' ', ' '], 'hay  ');
    fixture.detectChanges();

    const noExpansionSpans =
        fixture.debugElement.queryAll(By.css('.response-empty'));
    expect(noExpansionSpans.length).toEqual(1);
    const tryAgainButtons =
        fixture.debugElement.queryAll(By.css('.try-again-button'));
    expect(tryAgainButtons.length).toEqual(1);
  });

  it('Clicking try again button dismisses no-expansion and try-again button',
     async () => {
       const spy = spyOn(
                       fixture.componentInstance.speakFasterService,
                       'expandAbbreviation')
                       .and.returnValue(of({}));
       fixture.componentInstance.contextStrings = ['hello'];
       fixture.componentInstance.listenToKeypress(
           ['h', 'a', 'y', ' ', ' '], 'hay  ');
       fixture.detectChanges();
       const tryAgainButtons =
           fixture.debugElement.query(By.css('.try-again-button'));
       spy.and.callThrough();
       tryAgainButtons.nativeElement.click();
       fixture.detectChanges();
       await fixture.whenStable();

       expect(fixture.debugElement.query(By.css('.response-empty'))).toBeNull();
       expect(fixture.debugElement.query(By.css('.try-again-button')))
           .toBeNull();
     });

  it('does not display SpellComponent initially', () => {
    const spellComponents =
        fixture.debugElement.queryAll(By.css('app-spell-component'));
    expect(spellComponents).toEqual([]);
  });

  it('displays SpellComponent given abbreviaton and state', () => {
    fixture.componentInstance.contextStrings = ['hello'];
    fixture.detectChanges();
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
      readableString: 'hay',
      lineageId: createUuid(),
    };
    abbreviationExpansionTriggers.next({
      abbreviationSpec,
      requestExpansion: true,
    });
    fixture.componentInstance.contextStrings = ['hello'];
    fixture.componentInstance.state = State.CHOOSING_EXPANSION;
    fixture.detectChanges();

    const spellComponents =
        fixture.debugElement.queryAll(By.css('app-spell-component'));
    expect(spellComponents.length).toEqual(1);
  });

  it('unsubscribes from textEntryEndSubject on destroy', () => {
    fixture.detectChanges();
    const prevNumListeners = ExternalEventsComponent.getNumKeypressListeners();
    fixture.componentInstance.ngOnDestroy();

    expect(ExternalEventsComponent.getNumKeypressListeners())
        .toEqual(prevNumListeners - 1);
  });
});
