/** Unit tests for InputBarComponent. */
import {ElementRef, Injectable} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Subject} from 'rxjs';

import {VIRTUAL_KEY} from '../external/external-events.component';
import {SpeakFasterService} from '../speakfaster-service';
import {InputAbbreviationChangedEvent} from '../types/abbreviation';
import {TextEntryEndEvent} from '../types/text-entry';

import {InputBarComponent, InputBarControlEvent} from './input-bar.component';
import {InputBarModule} from './input-bar.module';

@Injectable()
class SpeakFasterServiceForTest {
}

fdescribe('InputBarComponent', () => {
  let textEntryEndSubject: Subject<TextEntryEndEvent>;
  let inputBarControlSubject: Subject<InputBarControlEvent>;
  let abbreviationExpansionTriggers: Subject<InputAbbreviationChangedEvent>;
  let fixture: ComponentFixture<InputBarComponent>;
  let speakFasterServiceForTest: SpeakFasterServiceForTest;

  beforeEach(async () => {
    speakFasterServiceForTest = new SpeakFasterServiceForTest();
    await TestBed
        .configureTestingModule({
          imports: [InputBarModule],
          declarations: [InputBarComponent],
          providers: [
            {provide: SpeakFasterService, useValue: speakFasterServiceForTest}
          ],
        })
        .compileComponents();
    textEntryEndSubject = new Subject();
    inputBarControlSubject = new Subject();
    abbreviationExpansionTriggers = new Subject();
    fixture = TestBed.createComponent(InputBarComponent);
    fixture.componentInstance.userId = 'testuser';
    fixture.componentInstance.contextStrings = ['How are you'];
    fixture.componentInstance.supportsAbbrevationExpansion = true;
    fixture.componentInstance.textEntryEndSubject = textEntryEndSubject;
    fixture.componentInstance.inputBarControlSubject = inputBarControlSubject;
    fixture.componentInstance.abbreviationExpansionTriggers =
        abbreviationExpansionTriggers;
    fixture.detectChanges();
  });

  it('input box is initially empty', () => {
    const inputText = fixture.debugElement.query(By.css('.input-text'));
    expect(inputText.nativeElement.innerText).toEqual('');
    expect(fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'))
               .length)
        .toEqual(0);
    expect(fixture.debugElement.query(By.css('.expand-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.spell-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.abort-button'))).toBeNull();
  });

  it('initially displays cursor', () => {
    expect(fixture.debugElement.query(By.css('.simullated-cursor')))
        .not.toBeNull();
  });

  for (const [keySequence, reconstructedText, expectedText] of [
           [['b'], 'b', 'b'],
           [['b', 'a'], 'ba', 'ba'],
           [['b', 'a', VIRTUAL_KEY.BACKSPACE], 'b', 'b'],
           [['b', 'a', VIRTUAL_KEY.BACKSPACE, 'c'], 'bc', 'bc'],
           [['b', VIRTUAL_KEY.SPACE], 'b ', 'b '],
           [[VIRTUAL_KEY.SPACE, 'b'], ' b', 'b'],
           [[VIRTUAL_KEY.ENTER, 'b'], ' b', 'b'],
           [[VIRTUAL_KEY.SPACE, VIRTUAL_KEY.ENTER, 'b'], ' b', 'b'],
  ] as Array<[string[], string, string]>) {
    fit(`entering keys cause text and buttons to be displayed: ` +
            `key sequence = ${JSON.stringify(keySequence)}`,
        () => {
          for (let i = 0; i < keySequence.length; ++i) {
            fixture.componentInstance.listenToKeypress(
                keySequence.slice(0, i + 1), reconstructedText.slice(0, i + 1));
            fixture.detectChanges();
          }

          const inputText = fixture.debugElement.query(By.css('.input-text'));
          expect(inputText.nativeElement.innerText).toEqual(expectedText);
          expect(fixture.debugElement.query(By.css('.expand-button')))
              .not.toBeNull();
          expect(fixture.debugElement.query(By.css('.spell-button')))
              .not.toBeNull();
          expect(fixture.debugElement.query(By.css('.abort-button')))
              .not.toBeNull();
          expect(fixture.debugElement.query(By.css('.simulated-cursor')))
              .not.toBeNull();
        });
  }

  it('clicking abort button clears state', () => {
    fixture.componentInstance.listenToKeypress(['a', 'b'], 'ab');
    fixture.detectChanges();
    const abortButton = fixture.debugElement.query(By.css('.abort-button'));
    abortButton.nativeElement.click();
    fixture.detectChanges();

    const inputText = fixture.debugElement.query(By.css('.input-text'));
    expect(inputText.nativeElement.innerText).toEqual('');
    expect(fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'))
               .length)
        .toEqual(0);
    expect(fixture.debugElement.query(By.css('.expand-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.spell-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.abort-button'))).toBeNull();
  });

  for (const [keySequence, reconstructedText, expectedAbbreviationString] of [
           [['x', 'y', VIRTUAL_KEY.SPACE, VIRTUAL_KEY.SPACE], 'xy  ', 'xy'],
           [['x', 'y', VIRTUAL_KEY.ENTER], 'xy\n', 'xy'],
           [['x', 'y', VIRTUAL_KEY.SPACE, VIRTUAL_KEY.ENTER], 'xy \n', 'xy'],
  ] as Array<[string[], string, string]>) {
    it(`key sequence triggers AE: ` +
           `key sequence: ${JSON.stringify(keySequence)}`,
       () => {
         const events: InputAbbreviationChangedEvent[] = [];
         abbreviationExpansionTriggers.subscribe(
             (event: InputAbbreviationChangedEvent) => {
               events.push(event);
             });
         for (let i = 0; i < keySequence.length; ++i) {
           fixture.componentInstance.listenToKeypress(
               keySequence.slice(0, i + 1), reconstructedText.slice(0, i + 1));
           fixture.detectChanges();
         }

         expect(events.length).toEqual(1);
         expect(events[0].abbreviationSpec.readableString)
             .toEqual(expectedAbbreviationString);
         expect(events[0].requestExpansion).toEqual(true);
       });
  }

  // TODO(cais): Test clicking Expand button.
  // TODO(Cais): Test clicking Spell button.
  // TODO(cais): Test hiding spell and expand button when space is present.
  // TODO(cais): Test spelling.
  // TODO(Cais): Test chip state.
  //    Chip injection.
  // TODO(cais): Test speak button.
  // TODO(cais): Test TTS button.



  // it('non-final text entry event updates input box value', () => {
  //   textEntryEndSubject.next({
  //     text: 'foo ',
  //     timestampMillis: new Date().getTime(),
  //     isFinal: false,
  //   });
  //   fixture.detectChanges();

  //   const input = fixture.debugElement.query(By.css('.input-box')) as
  //       ElementRef<HTMLInputElement>;
  //   expect(input.nativeElement.value).toEqual('foo ');
  // });

  // for (const isAborted of [false, true]) {
  //   it(`final text entry event updates input box: isAborted=${isAborted}`,
  //      () => {
  //        textEntryEndSubject.next({
  //          text: 'it is',
  //          timestampMillis: new Date().getTime(),
  //          isFinal: false,
  //        });
  //        textEntryEndSubject.next({
  //          text: 'it is done',
  //          timestampMillis: new Date().getTime(),
  //          isFinal: true,
  //          isAborted,
  //        });
  //        fixture.detectChanges();

  //        const input = fixture.debugElement.query(By.css('.input-box')) as
  //            ElementRef<HTMLInputElement>;
  //        expect(input.nativeElement.value).toEqual('');
  //      });
  // }

  // it('listening to keypress updates input box value', () => {
  //   fixture.componentInstance.listenToKeypress(['h', 'e'], 'he');
  //   fixture.detectChanges();

  //   const input = fixture.debugElement.query(By.css('.input-box')) as
  //       ElementRef<HTMLInputElement>;
  //   expect(input.nativeElement.value).toEqual('he');
  // });

  // it('clicking speak button with non-empty text triggers TTS', () => {
  //   fixture.componentInstance.listenToKeypress(['h', 'i'], 'hi');
  //   fixture.detectChanges();
  //   const events: TextEntryEndEvent[] = [];
  //   textEntryEndSubject.subscribe(event => {
  //     events.push(event);
  //   });
  //   const speakButton = fixture.debugElement.query(By.css('.speak-button'));
  //   speakButton.nativeElement.click();

  //   expect(events.length).toEqual(1);
  //   expect(events[0].text).toEqual('hi');
  //   expect(events[0].isFinal).toEqual(true);
  //   expect(events[0].isAborted).toBeUndefined();
  //   expect(events[0].inAppTextToSpeechAudioConfig).toEqual({});
  // });

  // for (const textValue of ['', ' ', '\t']) {
  //   it(`'clicking speak button with empty text has no effect: ` +
  //          `value=${JSON.stringify(textValue)}`,
  //      () => {
  //        fixture.componentInstance.inputString = textValue;
  //        fixture.detectChanges();
  //        const events: TextEntryEndEvent[] = [];
  //        textEntryEndSubject.subscribe(event => {
  //          events.push(event);
  //        });
  //        const speakButton =
  //            fixture.debugElement.query(By.css('.speak-button'));
  //        speakButton.nativeElement.click();

  //        expect(events).toEqual([]);
  //      });
  // }
});
