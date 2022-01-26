/** Unit tests for AbbreviationComponent. */

import {HttpClientModule} from '@angular/common/http';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {of, Subject} from 'rxjs';
import {createUuid} from 'src/utils/uuid';

import * as cefSharp from '../../utils/cefsharp';
import {repeatVirtualKey, VIRTUAL_KEY} from '../external/external-events.component';
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
    fixture.componentInstance.state = State.CHOOSING_EXPANSION;
    fixture.detectChanges();

    const spellComponents =
        fixture.debugElement.queryAll(By.css('app-spell-component'));
    expect(spellComponents.length).toEqual(1);
  });
});
