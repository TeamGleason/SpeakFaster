import {ComponentFixture, TestBed} from '@angular/core/testing';
import {Subject} from 'rxjs';

import {TextEntryBeginEvent, TextEntryEndEvent} from '../types/text-entry';

import {ExternalEventsComponent, getPunctuationLiteral, getVirtualkeyCode, LCTRL_KEY_HEAD_FOR_TTS_TRIGGER, repeatVirtualKey, VIRTUAL_KEY, VKCODE_SPECIAL_KEYS} from './external-events.component';
import {ExternalEventsModule} from './external-events.module';

const END_KEY_CODE = getVirtualkeyCode(LCTRL_KEY_HEAD_FOR_TTS_TRIGGER)[0]

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
    jasmine.getEnv().allowRespy(true);
    ExternalEventsComponent.clearKeypressListeners();
    ExternalEventsComponent.clearIgnoreKeySequences();
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

  it('typing an internal key sends TextEntryBeginEvent', () => {
    component.externalKeypressHook(65, /* isExternal= */ false);  // 'a'
    expect(beginEvents.length).toEqual(1);
  });

  it('typing an external key sends TextEntryBeginEvent', () => {
    component.externalKeypressHook(65, /* isExternal= */ true);  // 'a'
    expect(beginEvents.length).toEqual(1);
  });

  it('final event in textEntryEndSubject resets external state', () => {
    component.externalKeypressHook(65);  // 'a'
    textEntryEndSubject.next({
      text: 'hi',
      timestampMillis: Date.now(),
      isFinal: true,
    });
    expect(component.externalText).toEqual('');
  });

  it('final event in textEntryEndSubject resets internal state', () => {
    component.externalKeypressHook(65, /* isExterna= */ false);  // 'a'
    textEntryEndSubject.next({
      text: 'hi',
      timestampMillis: Date.now(),
      isFinal: true,
    });
    expect(component.internalText).toEqual('');
  });

  it('final event in textEntryEndSubject resets state', () => {
    component.externalKeypressHook(65);  // 'a'
    textEntryEndSubject.next({
      text: 'hi',
      timestampMillis: Date.now(),
      isFinal: true,
    });
    expect(component.externalText).toEqual('');
  });

  it('non-final event in textEntryEndSubject does not reset state', () => {
    component.externalKeypressHook(65);  // 'a'
    textEntryEndSubject.next({
      text: 'hi',
      timestampMillis: Date.now(),
      isFinal: false,
    });
    expect(component.externalText).toEqual('a');
  });

  it('aborted event resets state', () => {
    component.externalKeypressHook(65);  // 'a'
    component.externalKeypressHook(32);  // Space
    component.externalKeypressHook(32);  // Space
    textEntryEndSubject.next({
      text: '',
      timestampMillis: Date.now(),
      isFinal: true,
      isAborted: true,
    });
    expect(component.externalText).toEqual('');
  });

  it('Registering keypress listener causes listener to be called', () => {
    const keySequences: string[][] = [];
    const reconstructedTexts: string[] = [];
    ExternalEventsComponent.registerKeypressListener(
        (keySequence: string[], reconstructedText: string) => {
          keySequences.push(keySequence.slice());
          reconstructedTexts.push(reconstructedText);
        });
    component.externalKeypressHook(65, /* isExternal= */ false);  // 'a'
    component.externalKeypressHook(32, /* isExternal= */ false);  // Space
    expect(keySequences).toEqual([['a'], ['a', ' ']]);
    expect(reconstructedTexts).toEqual(['a', 'a ']);
  });

  it('External keypresses do not invoke registered listeners', () => {
    const keySequences: string[][] = [];
    const reconstructedTexts: string[] = [];
    ExternalEventsComponent.registerKeypressListener(
        (keySequence: string[], reconstructedText: string) => {
          keySequences.push(keySequence.slice());
          reconstructedTexts.push(reconstructedText);
        });
    component.externalKeypressHook(65, /* isExternal= */ true);  // 'a'
    component.externalKeypressHook(32, /* isExternal= */ true);  // Space
    expect(keySequences).toEqual([]);
    expect(reconstructedTexts).toEqual([]);
  });

  it('Registers number keys', () => {
    const keySequences: string[][] = [];
    const reconstructedTexts: string[] = [];
    ExternalEventsComponent.registerKeypressListener(
        (keySequence: string[], reconstructedText: string) => {
          keySequences.push(keySequence.slice());
          reconstructedTexts.push(reconstructedText);
        });
    component.externalKeypressHook(57, /* isExternal= */ false);  // '9'
    component.externalKeypressHook(56, /* isExternal= */ false);  // '8'
    component.externalKeypressHook(49, /* isExternal= */ false);  // '1'
    component.externalKeypressHook(48, /* isExternal= */ false);  // '0'
    expect(keySequences).toEqual([
      ['9'], ['9', '8'], ['9', '8', '1'], ['9', '8', '1', '0']
    ]);
    expect(reconstructedTexts).toEqual(['9', '98', '981', '9810']);
  });

  it('Reistering keypress listener updates listener count', () => {
    ExternalEventsComponent.registerKeypressListener(
        (keySequence: string[], reconstructedText: string) => {});

    expect(ExternalEventsComponent.getNumKeypressListeners()).toEqual(1);
  });

  it('Unregistering keypress listener', () => {
    const keySequences: string[][] = [];
    const listener = (keySequence: string[], reconstructedText: string) => {
      keySequences.push(keySequence.slice());
    };
    ExternalEventsComponent.registerKeypressListener(listener);
    ExternalEventsComponent.unregisterKeypressListener(listener);
    component.externalKeypressHook(65);  // 'a'
    component.externalKeypressHook(32);  // Space

    expect(ExternalEventsComponent.getNumKeypressListeners()).toEqual(0);
    expect(keySequences).toEqual([]);
  });

  const vkCodesAndExpectedTextWithTestDescription:
      Array<[string, number[], string]> = [
        [
          'letters, number, space and punctuation',
          [72, 73, 188, 32, 87, 49, 190, 162, END_KEY_CODE], 'hi, w1.'
        ],
        ['with exclamation point', [72, 73, 160, 49, 162, END_KEY_CODE], 'hi!'],
        [
          'shift punctuation', [72, 73, 160, 186, 191, 162, END_KEY_CODE],
          'hi:/'
        ],
        ['repeating LCtrl key', [72, 73, 162, 162, END_KEY_CODE], 'hi'],
        ['with new lines', [72, 73, 188, 13, 87, 162, END_KEY_CODE], 'hi,\nw'],
        ['with backspace', [72, 73, 8, 72, 162, END_KEY_CODE], 'hh'],
        [
          'with left arrow and inserted char',
          [72, 73, 37, 65, 162, END_KEY_CODE], 'hai'
        ],
        [
          'with left arrow and backspace', [72, 73, 37, 8, 162, END_KEY_CODE],
          'i'
        ],
        ['with noop left arrow', [39, 72, 73, 162, END_KEY_CODE], 'hi'],
        ['with noop right arrow', [72, 73, 39, 162, END_KEY_CODE], 'hi'],
        [
          'with left & right arrow, inserted chars',
          [72, 73, 37, 65, 39, 65, 162, END_KEY_CODE], 'haia'
        ],
        ['home key', [72, 73, 188, 32, 36, 65, 66, 162, END_KEY_CODE], 'abhi,'],
        [
          'home key and end key',
          [72, 73, 188, 32, 36, 65, 35, 66, 162, END_KEY_CODE], 'ahi, b'
        ],
        [
          'new line and home key',
          [72, 73, 188, 13, 87, 36, 65, 162, END_KEY_CODE], 'hi,\naw'
        ],
        [
          'new line, home and end key',
          [72, 73, 188, 13, 87, 36, 35, 65, 162, END_KEY_CODE], 'hi,\nwa'
        ],
        ['with noop home key', [36, 72, 73, 162, END_KEY_CODE], 'hi'],
        ['with noop end key', [72, 73, 35, 162, END_KEY_CODE], 'hi'],
        ['home and delete key', [72, 73, 188, 36, 46, 162, END_KEY_CODE], 'i,'],
        [
          '1 left arrow and 1 delete key',
          [72, 73, 188, 37, 46, 162, END_KEY_CODE], 'hi'
        ],
        [
          '2 left arrows and 1 delete key',
          [72, 73, 188, 37, 37, 46, 162, END_KEY_CODE], 'h,'
        ],
        ['with apostrophe', [65, 222, 66, 162, END_KEY_CODE], 'a\'b'],
        [
          'LCtrl+Back word delete: to a single word',
          [65, 66, 32, 72, 73, 162, 8, 162, END_KEY_CODE], 'ab'
        ],
        [
          'LCtrl+Back word delete: with ending space',
          [65, 66, 32, 72, 73, 32, 162, 8, 162, END_KEY_CODE], 'ab'
        ],
        [
          'LCtrl+Back word delete: with ending spaces',
          [65, 66, 32, 72, 73, 32, 32, 162, 8, 162, END_KEY_CODE], 'ab'
        ],
        [
          'LCtrl+Back word delete: with newline',
          [65, 66, 13, 72, 73, 13, 162, 8, 162, END_KEY_CODE], 'ab'
        ],
        [
          'LCtrl+Back word delete: with newline',
          [65, 66, 13, 72, 73, 13, 162, 8, 162, END_KEY_CODE], 'ab'
        ],
        [
          'LCtrl+Back word delete: delete twice',
          [67, 32, 65, 66, 32, 72, 73, 13, 162, 8, 162, 8, 162, END_KEY_CODE],
          'c',
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

  for (const keyCodes
           of [[65, 162, 8],
               [65, 162, 8, 162, 8],
               [65, 66, 162, 8],
               [65, 66, 32, 162, 8],
               [65, 66, 13, 162, 8],
               [65, 66, 13, 32, 162, 8],
  ] as number[][]) {
    it(`LCtrl+Back word delete: all the way to empty: keys = ` +
           JSON.stringify(keyCodes),
       () => {
         keyCodes.forEach(keyCode => component.externalKeypressHook(keyCode));

         expect(component.externalText).toEqual('');
       });
  }

  it('reconstructs text based on sentence-end period and space', () => {
    const vkCodes = [72, 73, 190, 32];
    for (const vkCode of vkCodes) {
      component.externalKeypressHook(vkCode);
    }
    expect(beginEvents.length).toEqual(1);
    expect(endEvents.length).toEqual(1);
    expect(endEvents[0].text).toEqual('hi.');
    expect(endEvents[0].isFinal).toBeTrue();
  });

  it('whitespace-only text does not trigger end event', () => {
    const vkCodes = [32, 32, 13, 162, END_KEY_CODE];
    for (const vkCode of vkCodes) {
      component.externalKeypressHook(vkCode);
    }
    expect(beginEvents.length).toEqual(1);
    expect(endEvents.length).toEqual(0);
  });

  it('Period and space from internal source doesn\'t trigger end event', () => {
    const vkCodes = [72, 73, 190, 32];
    for (const vkCode of vkCodes) {
      component.externalKeypressHook(vkCode, /* isExternal= */ false);
    }
    expect(beginEvents.length).toEqual(1);
    expect(endEvents.length).toEqual(0);
  });

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
    component.externalKeypressHook(
        getVirtualkeyCode('w')[0]);  // Human-entered.
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
    component.externalKeypressHook(getVirtualkeyCode(
        LCTRL_KEY_HEAD_FOR_TTS_TRIGGER)[0]);  // Human-entered.
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
    component.externalKeypressHook(getVirtualkeyCode(
        LCTRL_KEY_HEAD_FOR_TTS_TRIGGER)[0]);  // Human-entered.
    expect(beginEvents.length).toEqual(2);
    expect(endEvents.length).toEqual(2);
    expect(endEvents[0].text).toEqual('a');
    expect(endEvents[0].numHumanKeypresses).toEqual(3);
    expect(endEvents[1].text).toEqual('abc');
    expect(endEvents[1].numHumanKeypresses).toEqual(4);
  });

  it('registerIgnoreKeySequence ignores machine sequence', () => {
    const keySequences: string[][] = [];
    const reconstructedTexts: string[] = [];
    ExternalEventsComponent.registerKeypressListener(
        (keySequence: string[], reconstructedText: string) => {
          keySequences.push(keySequence.slice());
          reconstructedTexts.push(reconstructedText);
        });
    ExternalEventsComponent.registerIgnoreKeySequence({
      keySequence: [VIRTUAL_KEY.COMMA, VIRTUAL_KEY.SPACE],
      ignoreStartIndex: 1,
    });
    spyOn(Date, 'now').and.returnValue(0);
    component.externalKeypressHook(65, /* isExternal= */ false);
    spyOn(Date, 'now').and.returnValue(100);
    component.externalKeypressHook(32, /* isExternal= */ false);  // Space.
    spyOn(Date, 'now').and.returnValue(1000);
    component.externalKeypressHook(188, /* isExternal= */ false);  // Comma.
    spyOn(Date, 'now').and.returnValue(1100);
    component.externalKeypressHook(
        32, /* isExternal= */ false);  // Space. Gap < 200 ms;

    expect(keySequences).toEqual([
      ['a'], ['a', ' '], ['a', ' ', ','], ['a', ' ', ',']
    ]);
    expect(reconstructedTexts).toEqual(['a', 'a ', 'a ,', 'a ,']);
  });

  it('registerIgnoreKeySequence does not ignores human sequence', () => {
    const keySequences: string[][] = [];
    const reconstructedTexts: string[] = [];
    ExternalEventsComponent.registerKeypressListener(
        (keySequence: string[], reconstructedText: string) => {
          keySequences.push(keySequence.slice());
          reconstructedTexts.push(reconstructedText);
        });
    ExternalEventsComponent.registerIgnoreKeySequence({
      keySequence: [VIRTUAL_KEY.COMMA, VIRTUAL_KEY.SPACE],
      ignoreStartIndex: 1,
    });
    spyOn(Date, 'now').and.returnValue(0);
    component.externalKeypressHook(65, /* isExternal= */ false);
    spyOn(Date, 'now').and.returnValue(100);
    component.externalKeypressHook(32, /* isExternal= */ false);  // Space.
    spyOn(Date, 'now').and.returnValue(1000);
    component.externalKeypressHook(188, /* isExternal= */ false);  // Comma.
    spyOn(Date, 'now').and.returnValue(1201);
    component.externalKeypressHook(
        32, /* isExternal= */ false);  // Space. Gap > 200 ms;

    expect(keySequences).toEqual([
      ['a'], ['a', ' '], ['a', ' ', ','], ['a', ' ', ',', ' ']
    ]);
    expect(reconstructedTexts).toEqual(['a', 'a ', 'a ,', 'a , ']);
  });

  it('unregisterIgnoreKeySequence allows machine sequence', () => {
    const keySequences: string[][] = [];
    const reconstructedTexts: string[] = [];
    ExternalEventsComponent.registerKeypressListener(
        (keySequence: string[], reconstructedText: string) => {
          keySequences.push(keySequence.slice());
          reconstructedTexts.push(reconstructedText);
        });
    ExternalEventsComponent.registerIgnoreKeySequence({
      keySequence: [VIRTUAL_KEY.COMMA, VIRTUAL_KEY.SPACE],
      ignoreStartIndex: 1,
    });
    ExternalEventsComponent.unregisterIgnoreKeySequence({
      keySequence: [VIRTUAL_KEY.COMMA, VIRTUAL_KEY.SPACE],
      ignoreStartIndex: 1,
    });
    spyOn(Date, 'now').and.returnValue(0);
    component.externalKeypressHook(65, /* isExternal= */ false);
    spyOn(Date, 'now').and.returnValue(100);
    component.externalKeypressHook(32, /* isExternal= */ false);  // Space.
    spyOn(Date, 'now').and.returnValue(1000);
    component.externalKeypressHook(188, /* isExternal= */ false);  // Comma.
    spyOn(Date, 'now').and.returnValue(1100);
    component.externalKeypressHook(
        32, /* isExternal= */ false);  // Space. Gap < 200 ms;

    expect(keySequences).toEqual([
      ['a'], ['a', ' '], ['a', ' ', ','], ['a', ' ', ',', ' ']
    ]);
    expect(reconstructedTexts).toEqual(['a', 'a ', 'a ,', 'a , ']);
  });

  it('registering an existing ignore sequence leads to error', () => {
    ExternalEventsComponent.registerIgnoreKeySequence({
      keySequence: [VIRTUAL_KEY.COMMA, VIRTUAL_KEY.SPACE],
      ignoreStartIndex: 1,
    });

    expect(() => ExternalEventsComponent.registerIgnoreKeySequence({
      keySequence: [VIRTUAL_KEY.COMMA, VIRTUAL_KEY.SPACE],
      ignoreStartIndex: 1,
    })).toThrowError();
  });

  it('registering two different ignore sequences works', () => {
    const keySequences: string[][] = [];
    const reconstructedTexts: string[] = [];
    ExternalEventsComponent.registerKeypressListener(
        (keySequence: string[], reconstructedText: string) => {
          keySequences.push(keySequence.slice());
          reconstructedTexts.push(reconstructedText);
        });
    ExternalEventsComponent.registerIgnoreKeySequence({
      keySequence: [VIRTUAL_KEY.COMMA, VIRTUAL_KEY.SPACE],
      ignoreStartIndex: 1,
    });
    ExternalEventsComponent.registerIgnoreKeySequence({
      keySequence: ['z', VIRTUAL_KEY.SPACE],
      ignoreStartIndex: 1,
    });
    spyOn(Date, 'now').and.returnValue(0);
    component.externalKeypressHook(65, /* isExternal= */ false);
    spyOn(Date, 'now').and.returnValue(100);
    component.externalKeypressHook(32, /* isExternal= */ false);  // Space.
    spyOn(Date, 'now').and.returnValue(1000);
    component.externalKeypressHook(90, /* isExternal= */ false);  // 'z'.
    spyOn(Date, 'now').and.returnValue(1100);
    component.externalKeypressHook(
        32, /* isExternal= */ false);  // Space. Gap < 200 ms;

    expect(keySequences).toEqual([
      ['a'], ['a', ' '], ['a', ' ', 'z'], ['a', ' ', 'z']
    ]);
    expect(reconstructedTexts).toEqual(['a', 'a ', 'a z', 'a z']);
  });

  it('unregistering nonexistent ignore sequence leads to error', () => {
    ExternalEventsComponent.registerIgnoreKeySequence({
      keySequence: [VIRTUAL_KEY.COMMA, VIRTUAL_KEY.SPACE],
      ignoreStartIndex: 1,
    });
    expect(() => ExternalEventsComponent.unregisterIgnoreKeySequence({
      keySequence: ['z', VIRTUAL_KEY.SPACE],
      ignoreStartIndex: 1,
    })).toThrowError(/Ignore config is not found/);
  });

  it('registering invalid ignore sequence leads to error', () => {
    expect(() => ExternalEventsComponent.registerIgnoreKeySequence({
      keySequence: [VIRTUAL_KEY.COMMA],
      ignoreStartIndex: 0,
    })).toThrowError(/length/);
    expect(() => ExternalEventsComponent.registerIgnoreKeySequence({
      keySequence: [VIRTUAL_KEY.COMMA, VIRTUAL_KEY.SPACE],
      ignoreStartIndex: -1,
    })).toThrowError(/Invalid ignore start index/);
    expect(() => ExternalEventsComponent.registerIgnoreKeySequence({
      keySequence: [VIRTUAL_KEY.COMMA, VIRTUAL_KEY.SPACE],
      ignoreStartIndex: 2,
    })).toThrowError(/Invalid ignore start index/);
  });
});
