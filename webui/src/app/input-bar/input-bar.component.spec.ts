/** Unit tests for InputBarComponent. */
import {ElementRef, Injectable} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Subject} from 'rxjs';

import {SpeakFasterService} from '../speakfaster-service';
import {TextEntryEndEvent} from '../types/text-entry';

import {InputBarComponent} from './input-bar.component';
import {InputBarModule} from './input-bar.module';

@Injectable()
class SpeakFasterServiceForTest {
}

describe('InputBarComponent', () => {
  let textEntryEndSubject: Subject<TextEntryEndEvent>;
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
    fixture = TestBed.createComponent(InputBarComponent);
    fixture.componentInstance.textEntryEndSubject = textEntryEndSubject;
    fixture.detectChanges();
  });

  it('input box is initially empty', () => {
    const input = fixture.debugElement.query(By.css('.input-box')) as
        ElementRef<HTMLInputElement>;

    expect(input.nativeElement.value).toEqual('');
  });

  it('non-final text entry event updates input box value', () => {
    textEntryEndSubject.next({
      text: 'foo ',
      timestampMillis: new Date().getTime(),
      isFinal: false,
    });
    fixture.detectChanges();

    const input = fixture.debugElement.query(By.css('.input-box')) as
        ElementRef<HTMLInputElement>;
    expect(input.nativeElement.value).toEqual('foo ');
  });

  for (const isAborted of [false, true]) {
    it(`final text entry event updates input box: isAborted=${isAborted}`,
       () => {
         textEntryEndSubject.next({
           text: 'it is',
           timestampMillis: new Date().getTime(),
           isFinal: false,
         });
         textEntryEndSubject.next({
           text: 'it is done',
           timestampMillis: new Date().getTime(),
           isFinal: true,
           isAborted,
         });
         fixture.detectChanges();

         const input = fixture.debugElement.query(By.css('.input-box')) as
             ElementRef<HTMLInputElement>;
         expect(input.nativeElement.value).toEqual('');
       });
  }

  it('listening to keypress updates input box value', () => {
    fixture.componentInstance.listenToKeypress(['h', 'e'], 'he');
    fixture.detectChanges();

    const input = fixture.debugElement.query(By.css('.input-box')) as
        ElementRef<HTMLInputElement>;
    expect(input.nativeElement.value).toEqual('he');
  });

  it('clicking speak button with non-empty text triggers TTS', () => {
    fixture.componentInstance.listenToKeypress(['h', 'i'], 'hi');
    fixture.detectChanges();
    const events: TextEntryEndEvent[] = [];
    textEntryEndSubject.subscribe(event => {
      events.push(event);
    });
    const speakButton = fixture.debugElement.query(By.css('.speak-button'));
    speakButton.nativeElement.click();

    expect(events.length).toEqual(1);
    expect(events[0].text).toEqual('hi');
    expect(events[0].isFinal).toEqual(true);
    expect(events[0].isAborted).toBeUndefined();
    expect(events[0].inAppTextToSpeechAudioConfig).toEqual({volume_gain_db: 0});
  });

  for (const textValue of ['', ' ', '\t']) {
    it(`'clicking speak button with empty text has no effect: ` +
           `value=${JSON.stringify(textValue)}`,
       () => {
         fixture.componentInstance.inputString = textValue;
         fixture.detectChanges();
         const events: TextEntryEndEvent[] = [];
         textEntryEndSubject.subscribe(event => {
           events.push(event);
         });
         const speakButton =
             fixture.debugElement.query(By.css('.speak-button'));
         speakButton.nativeElement.click();

         expect(events).toEqual([]);
       });
  }
});
