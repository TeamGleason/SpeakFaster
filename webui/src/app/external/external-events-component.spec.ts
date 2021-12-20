import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Subject} from 'rxjs';

import {InputAbbreviationChangedEvent} from '../types/abbreviation';
import {TextEntryBeginEvent, TextEntryEndEvent} from '../types/text-entry';

import {ExternalEventsComponent, getPunctuationLiteral, getVirtualkeyCode, repeatVirtualKey, VIRTUAL_KEY, VKCODE_SPECIAL_KEYS} from './external-events.component';
import {ExternalEventsModule} from './external-events.module';

describe('ExternalEventsComponent', () => {
  let textEntryBeginSubject: Subject<TextEntryBeginEvent>;
  let textEntryEndSubject: Subject<TextEntryEndEvent>;
  let abbreviationExpansionTriggers: Subject<InputAbbreviationChangedEvent>;
  let fixture: ComponentFixture<ExternalEventsComponent>;
  let component: ExternalEventsComponent;
  let beginEvents: TextEntryBeginEvent[];
  let endEvents: TextEntryEndEvent[];
  let abbreviationChangeEvents: InputAbbreviationChangedEvent[];

  beforeEach(async () => {
    await TestBed
        .configureTestingModule({
          imports: [ExternalEventsModule],
          declarations: [ExternalEventsComponent],
        })
        .compileComponents();
    textEntryBeginSubject = new Subject();
    textEntryEndSubject = new Subject();
    abbreviationExpansionTriggers = new Subject();
    beginEvents = [];
    endEvents = [];
    abbreviationChangeEvents = [];
    textEntryBeginSubject.subscribe((event) => beginEvents.push(event));
    textEntryEndSubject.subscribe((event) => endEvents.push(event));
    abbreviationExpansionTriggers.subscribe(
        (event) => abbreviationChangeEvents.push(event));
    fixture = TestBed.createComponent(ExternalEventsComponent);
    component = fixture.componentInstance;
    fixture.componentInstance.textEntryBeginSubject = textEntryBeginSubject;
    fixture.componentInstance.textEntryEndSubject = textEntryEndSubject;
    fixture.componentInstance.abbreviationExpansionTriggers =
        abbreviationExpansionTriggers;
    fixture.detectChanges();
    jasmine.getEnv().allowRespy(true);
  });

  it('Virtual key codes map has no duplicate values', () => {
    const valueSet = new Set(Object.values(VKCODE_SPECIAL_KEYS));
    expect(Object.values(VKCODE_SPECIAL_KEYS).length).toEqual(valueSet.size);
  });

  it('getVirtualkeyCode returns correct code for special keys', () => {
    expect(getVirtualkeyCode(VIRTUAL_KEY.BACKSPACE)).toEqual([8]);
    expect(getVirtualkeyCode(VIRTUAL_KEY.ENTER)).toEqual([13]);
    expect(getVirtualkeyCode(VIRTUAL_KEY.SPACE)).toEqual([32]);
    expect(getVirtualkeyCode(VIRTUAL_KEY.END)).toEqual([35]);
    expect(getVirtualkeyCode(VIRTUAL_KEY.HOME)).toEqual([36]);
  });

  it('getVirtualkeyCode returns correct code for non-special keys', () => {
    expect(getVirtualkeyCode(' ')).toEqual([32]);
    expect(getVirtualkeyCode('A')).toEqual([65]);
    expect(getVirtualkeyCode('a')).toEqual([65]);
    expect(getVirtualkeyCode('Z')).toEqual([90]);
    expect(getVirtualkeyCode('z')).toEqual([90]);
    expect(getVirtualkeyCode('!')).toEqual([160, 49]);
    expect(getVirtualkeyCode('?')).toEqual([160, 191]);
    expect(getVirtualkeyCode('.')).toEqual([190]);
    expect(getVirtualkeyCode(',')).toEqual([188]);
  });

  it('getPunctuationLiteral returns correct values', () => {
    expect(getPunctuationLiteral(VIRTUAL_KEY.SEMICOLON_COLON, false))
        .toEqual(';');
    expect(getPunctuationLiteral(VIRTUAL_KEY.SEMICOLON_COLON, true))
        .toEqual(':');
    expect(getPunctuationLiteral(VIRTUAL_KEY.SLASH_QUESTION_MARK, false))
        .toEqual('/');
    expect(getPunctuationLiteral(VIRTUAL_KEY.SLASH_QUESTION_MARK, true))
        .toEqual('?');
    expect(getPunctuationLiteral(VIRTUAL_KEY.PERIOD, true)).toEqual('.');
    expect(getPunctuationLiteral(VIRTUAL_KEY.COMMA, true)).toEqual(',');
  });

  it('typing a key sends TextEntryBeginEvent', () => {
    component.externalKeypressHook(65);  // 'a'
    expect(beginEvents.length).toEqual(1);
  });

  for (const keyCodeSequence of [
           [72, 65, 89, 32, 32],          // h, a, y, space, space
           [32, 72, 65, 89, 32, 32],      // space, h, a, y, space, space
           [65, 32, 72, 65, 89, 32, 32],  // a, space, h, a, y, space, space
  ]) {
    it(`Double space triggers abbreviation expansion, key codes = ${
           keyCodeSequence}`,
       () => {
         keyCodeSequence.forEach(code => component.externalKeypressHook(code));
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
             readableString: 'hay',
             eraserSequence: repeatVirtualKey(VIRTUAL_KEY.BACKSPACE, 5),
           },
           requestExpansion: true,
         };
         expect(abbreviationChangeEvents).toEqual([expected]);
       });
  }

  const vkCodesAndExpectedTextWithTestDescription:
      Array<[string, number[], string]> = [
        [
          'letters, number, space and punctuation',
          [72, 73, 188, 32, 87, 49, 190, 162, 81], 'hi, w1.'
        ],
        ['with exclamation point', [72, 73, 160, 49, 162, 81], 'hi!'],
        ['shift punctuation', [72, 73, 160, 186, 191, 162, 81], 'hi:/'],
        ['repeating LCtrl key', [72, 73, 162, 162, 81], 'hi'],
        ['with new lines', [72, 73, 188, 13, 87, 162, 81], 'hi,\nw'],
        ['with backspace', [72, 73, 8, 72, 162, 81], 'hh'],
        ['with left arrow and inserted char', [72, 73, 37, 65, 162, 81], 'hai'],
        ['with left arrow and backspace', [72, 73, 37, 8, 162, 81], 'i'],
        ['with noop left arrow', [39, 72, 73, 162, 81], 'hi'],
        ['with noop right arrow', [72, 73, 39, 162, 81], 'hi'],
        [
          'with left & right arrow, inserted chars',
          [72, 73, 37, 65, 39, 65, 162, 81], 'haia'
        ],
        ['home key', [72, 73, 188, 32, 36, 65, 66, 162, 81], 'abhi, '],
        [
          'home key and end key', [72, 73, 188, 32, 36, 65, 35, 66, 162, 81],
          'ahi, b'
        ],
        [
          'new line and home key', [72, 73, 188, 13, 87, 36, 65, 162, 81],
          'hi,\naw'
        ],
        [
          'new line, home and end key',
          [72, 73, 188, 13, 87, 36, 35, 65, 162, 81], 'hi,\nwa'
        ],
        ['with noop home key', [36, 72, 73, 162, 81], 'hi'],
        ['with noop end key', [72, 73, 35, 162, 81], 'hi'],
        ['home and delete key', [72, 73, 188, 36, 46, 162, 81], 'i,'],
        ['1 left arrow and 1 delete key', [72, 73, 188, 37, 46, 162, 81], 'hi'],
        [
          '2 left arrows and 1 delete key', [72, 73, 188, 37, 37, 46, 162, 81],
          'h,'
        ],
      ];
  for (const
           [description,
            vkCodes,
            expectedText,
  ] of vkCodesAndExpectedTextWithTestDescription) {
    it(`reconstructs text and sends end event: ${description}`, () => {
      for (const vkCode of vkCodes) {
        component.externalKeypressHook(vkCode);
      }
      expect(beginEvents.length).toEqual(1);
      expect(endEvents.length).toEqual(1);
      expect(endEvents[0].text).toEqual(expectedText);
      expect(endEvents[0].isFinal).toBeTrue();
      expect(endEvents[0].timestampMillis)
          .toBeGreaterThanOrEqual(beginEvents[0].timestampMillis);
    });
  }

  it('Correctly identifies human-entered and auto-injected keys', () => {
    spyOn(Date, 'now').and.returnValue(0);
    component.externalKeypressHook(65);  // Human-entered.
    spyOn(Date, 'now').and.returnValue(1000);
    component.externalKeypressHook(66);  // Word completion selection by human.
    spyOn(Date, 'now').and.returnValue(1010);
    component.externalKeypressHook(67);  // Injected key.
    spyOn(Date, 'now').and.returnValue(1020);
    component.externalKeypressHook(68);  // Injected key.
    spyOn(Date, 'now').and.returnValue(1030);
    component.externalKeypressHook(32);  // Injected key.
    spyOn(Date, 'now').and.returnValue(2000);
    component.externalKeypressHook(69);  // Word completion selection by human.
    spyOn(Date, 'now').and.returnValue(2010);
    component.externalKeypressHook(70);  // Injected key.
    spyOn(Date, 'now').and.returnValue(3000);
    component.externalKeypressHook(162);  // Human-entered.
    spyOn(Date, 'now').and.returnValue(3600);
    component.externalKeypressHook(81);  // Human-entered.
    expect(beginEvents.length).toEqual(1);
    expect(endEvents.length).toEqual(1);
    expect(endEvents[0].text).toEqual('abcd ef');
    expect(endEvents[0].numHumanKeypresses).toEqual(5);
  });

  it('Correct resets human-entered keypress after previous end event', () => {
    spyOn(Date, 'now').and.returnValue(0);
    component.externalKeypressHook(65);  // Human-entered.
    spyOn(Date, 'now').and.returnValue(1000);
    component.externalKeypressHook(162);  // Human-entered.
    spyOn(Date, 'now').and.returnValue(2000);
    component.externalKeypressHook(81);  // Human-entered.
    // Ends first phrase; begins second one.
    spyOn(Date, 'now').and.returnValue(3000);
    component.externalKeypressHook(65);  // Human-entered.
    spyOn(Date, 'now').and.returnValue(4000);
    component.externalKeypressHook(66);  // Word completion selection by human.
    spyOn(Date, 'now').and.returnValue(4010);
    component.externalKeypressHook(67);  // Injected key.
    spyOn(Date, 'now').and.returnValue(5000);
    component.externalKeypressHook(162);  // Human-entered.
    spyOn(Date, 'now').and.returnValue(6000);
    component.externalKeypressHook(81);  // Human-entered.
    expect(beginEvents.length).toEqual(2);
    expect(endEvents.length).toEqual(2);
    expect(endEvents[0].text).toEqual('a');
    expect(endEvents[0].numHumanKeypresses).toEqual(3);
    expect(endEvents[1].text).toEqual('abc');
    expect(endEvents[1].numHumanKeypresses).toEqual(4);
  });
});
