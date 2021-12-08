import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Subject} from 'rxjs';

import {TextEntryBeginEvent, TextEntryEndEvent} from '../types/text-injection';

import {ExternalEventsComponent, getPunctuationLiteral, VIRTUAL_KEY, VKCODE_SPECIAL_KEYS} from './external-events.component';
import {ExternalEventsModule} from './external-events.module';

// TODO(cais): Remove fdescribe. DO NOT SUBMIT.
fdescribe('ExternalEventsComponent', () => {
  let textEntryBeginSubject: Subject<TextEntryBeginEvent>;
  let textEntryEndSubject: Subject<TextEntryEndEvent>;
  let fixture: ComponentFixture<ExternalEventsComponent>;
  let component: ExternalEventsComponent;
  let beginEvents: TextEntryBeginEvent[];
  let endEvents: TextEntryEndEvent[];

  beforeEach(async () => {
    await TestBed
        .configureTestingModule({
          imports: [ExternalEventsModule],
          declarations: [ExternalEventsComponent],
        })
        .compileComponents();
    textEntryBeginSubject = new Subject();
    textEntryEndSubject = new Subject();
    beginEvents = [];
    endEvents = [];
    textEntryBeginSubject.subscribe((event) => beginEvents.push(event));
    textEntryEndSubject.subscribe((event) => endEvents.push(event));
    fixture = TestBed.createComponent(ExternalEventsComponent);
    component = fixture.componentInstance;
    fixture.componentInstance.textEntryBeginSubject = textEntryBeginSubject;
    fixture.componentInstance.textEntryEndSubject = textEntryEndSubject;
    fixture.detectChanges();
  });

  it('Virtual key codes map has no duplicate values', () => {
    const valueSet = new Set(Object.values(VKCODE_SPECIAL_KEYS));
    expect(Object.values(VKCODE_SPECIAL_KEYS).length).toEqual(valueSet.size);
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
    component.externalKeypressCallback(65);  // 'a'
    expect(beginEvents.length).toEqual(1);
  });

  const vkCodesAndExpectedTextWithTestDescription:
      Array<[string, number[], string]> = [
        [
          'letters, number, space and punctuation',
          [72, 73, 188, 32, 87, 49, 190, 162, 81], 'hi, w1.'
        ],
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
        component.externalKeypressCallback(vkCode);
      }
      expect(beginEvents.length).toEqual(1);
      expect(endEvents.length).toEqual(1);
      expect(endEvents[0].text).toEqual(expectedText);
      expect(endEvents[0].isFinal).toBeTrue();
      expect(endEvents[0].timestampMillis)
          .toBeGreaterThanOrEqual(beginEvents[0].timestampMillis);
    });
  }
});
