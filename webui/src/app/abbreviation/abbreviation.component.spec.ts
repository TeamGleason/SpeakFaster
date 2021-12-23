/** Unit tests for AbbreviationComponent. */

import {HttpClientModule} from '@angular/common/http';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {of, Subject} from 'rxjs';

import * as cefSharp from '../../utils/cefsharp';
import {repeatVirtualKey, VIRTUAL_KEY} from '../external/external-events.component';
import {TestListener} from '../test-utils/test-cefsharp-listener';
import {AbbreviationSpec, InputAbbreviationChangedEvent} from '../types/abbreviation';
import {TextEntryEndEvent} from '../types/text-entry';

import {AbbreviationComponent} from './abbreviation.component';
import {AbbreviationModule} from './abbreviation.module';

describe('AbbreviationComponent', () => {
  let abbreviationExpansionTriggers: Subject<InputAbbreviationChangedEvent>;
  let textEntryEndSubject: Subject<TextEntryEndEvent>;
  let fixture: ComponentFixture<AbbreviationComponent>;
  let testListener: TestListener;

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
    textEntryEndSubject = new Subject();
    fixture = TestBed.createComponent(AbbreviationComponent);
    fixture.componentInstance.abbreviationExpansionTriggers =
        abbreviationExpansionTriggers;
    fixture.componentInstance.textEntryEndSubject = textEntryEndSubject;
    fixture.detectChanges();
  });

  afterAll(async () => {
    delete (window as any)[cefSharp.BOUND_LISTENER_NAME];
  });

  it('initially displays no abbreviation options', () => {
    const abbreviationOptions =
        fixture.debugElement.queryAll(By.css('.abbreviation-option'));
    expect(abbreviationOptions.length).toEqual(0);
  });

  for (const [contextStrings, precedingText] of
       [
         [[], undefined],
         [['hello'], 'hi'],
       ] as Array<[string[], string|undefined]>) {
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
         };
         abbreviationExpansionTriggers.next({
           abbreviationSpec,
           requestExpansion: true,
         });
         expect(spy).toHaveBeenCalledOnceWith(
             contextStrings.join('|'), abbreviationSpec, 128, undefined);
         expect(fixture.componentInstance.abbreviationOptions).toEqual([
           'how are you', 'how about you'
         ]);
       });
  }

  it('displays expansion options when available', () => {
    fixture.componentInstance.abbreviationOptions =
        ['what time is it', 'we took it in'];
    fixture.detectChanges();
    const expansions =
        fixture.debugElement.queryAll(By.css('.abbreviation-expansion'));
    expect(expansions.length).toEqual(2);
    expect(expansions[0].nativeElement.innerText).toEqual('what time is it');
    expect(expansions[1].nativeElement.innerText).toEqual('we took it in');
    const selectButtons =
        fixture.debugElement.queryAll(By.css('.select-button'));
    expect(selectButtons.length).toEqual(2);
    const speakButtons = fixture.debugElement.queryAll(By.css('.speak-button'));
    expect(speakButtons.length).toEqual(2);
  });

  it('calls updateButtonBoxes when expansion options become available',
     async () => {
       fixture.componentInstance.abbreviationOptions = ['what time is it'];
       fixture.detectChanges();
       await fixture.whenStable();
       const calls = testListener.updateButtonBoxesCalls;
       expect(calls.length).toEqual(1);
       expect(calls[0][0].indexOf('AbbreviationComponent')).toEqual(0);
       expect(calls[0][1].length).toEqual(2);
     });

  it('calls updateButtonBoxes with empty arg when option is selcted',
     async () => {
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
         triggerKeys: [VIRTUAL_KEY.SPACE, VIRTUAL_KEY.SPACE]
       };
       fixture.componentInstance.abbreviationOptions = ['what time is it'];
       fixture.detectChanges();
       const selectButtons =
           fixture.debugElement.queryAll(By.css('.select-button'));
       (selectButtons[0].nativeElement as HTMLButtonElement).click();
       await fixture.whenStable();
       const calls = testListener.updateButtonBoxesCalls;
       expect(calls[calls.length - 1][0].indexOf('AbbreviationComponent'))
           .toEqual(0);
       expect(calls[calls.length - 1][1]).toEqual([]);
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
    };
    fixture.componentInstance.abbreviationOptions = ['what time is it'];
    fixture.detectChanges();
    const selectButtons =
        fixture.debugElement.queryAll(By.css('.select-button'));
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

  it('clicking select-button publishes to textEntryEndSubject', () => {
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
      triggerKeys: [VIRTUAL_KEY.SPACE, VIRTUAL_KEY.SPACE]
    };
    fixture.componentInstance.abbreviationOptions =
        ['what time is it', 'we took it in'];
    fixture.detectChanges();
    const selectButtons =
        fixture.debugElement.queryAll(By.css('.select-button'));
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
});
