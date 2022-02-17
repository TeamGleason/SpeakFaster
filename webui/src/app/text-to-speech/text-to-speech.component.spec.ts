/** Unit tests for TextToSpeechComponent. */
import {HttpClientModule} from '@angular/common/http';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {of, Subject, throwError} from 'rxjs';

import {TextEntryEndEvent} from '../types/text-entry';

import {TextToSpeechComponent} from './text-to-speech.component';
import {TextToSpeechModule} from './text-to-speech.module';

describe('TextToSpeechCmponent', () => {
  let fixture: ComponentFixture<TextToSpeechComponent>;
  let component: TextToSpeechComponent;
  let textEntryEndSubject: Subject<TextEntryEndEvent>;

  beforeEach(async () => {
    textEntryEndSubject = new Subject();
    // textToSpeechServiceForTest = new TextToSpeechServiceForTest();
    await TestBed
        .configureTestingModule({
          imports: [TextToSpeechModule, HttpClientModule],
          declarations: [TextToSpeechComponent],
        })
        .compileComponents();
    fixture = TestBed.createComponent(TextToSpeechComponent);
    component = fixture.componentInstance;
    component.textEntryEndSubject = textEntryEndSubject;
    fixture.detectChanges();
    component.accessToken = 'test_token';
    jasmine.getEnv().allowRespy(true);
  });

  it('Initially shows no error message', () => {
    const errorMessage = fixture.nativeElement.querySelector('.error-message');
    expect(errorMessage).toBeNull();
  });

  it('Initially audio element src is empty string', () => {
    const audioElement =
        fixture.nativeElement.querySelector('audio') as HTMLAudioElement;
    expect(audioElement.src).toEqual('');
  });

  it('On textEntryEndEvent with TTS audio config, sets audio element src',
     async () => {
       const audioElement =
           fixture.nativeElement.querySelector('audio') as HTMLAudioElement;
       spyOn(component.textToSpeechService, 'synthesizeSpeech')
           .and.returnValue(of({
             audio_content: '0123abcd',
             audio_config: {
               audio_encoding: 'LINEAR16',
               speaking_rate: 1.0,
               volume_gain_db: 0,
             }
           }));
       textEntryEndSubject.next({
         text: 'hi, there',
         timestampMillis: new Date().getTime(),
         isFinal: true,
         inAppTextToSpeechAudioConfig: {
           volume_gain_db: 0,
         }
       });
       await fixture.whenStable();
       expect(audioElement.src).toEqual('data:audio/wav;base64,0123abcd');
     });

  it('Empty audio content: shows error message', async () => {
    const audioElement =
        fixture.nativeElement.querySelector('audio') as HTMLAudioElement;
    spyOn(component.textToSpeechService, 'synthesizeSpeech')
        .and.returnValue(of({
          audio_content: '',
          audio_config: {
            audio_encoding: 'LINEAR16',
            speaking_rate: 1.0,
            volume_gain_db: 0,
          }
        }));
    textEntryEndSubject.next({
      text: 'hi, there',
      timestampMillis: new Date().getTime(),
      isFinal: true,
      inAppTextToSpeechAudioConfig: {
        volume_gain_db: 0,
      }
    });
    await fixture.whenStable();
    fixture.detectChanges();
    const errorMessage =
        fixture.nativeElement.querySelector('.error-message') as HTMLDivElement;
    expect(errorMessage.innerText).toEqual('TTS error: audio is empty');
  });

  it('textEntryEndEvent without audio config does not set audio element',
     async () => {
       const audioElement =
           fixture.nativeElement.querySelector('audio') as HTMLAudioElement;
       textEntryEndSubject.next({
         text: 'hi, there',
         timestampMillis: new Date().getTime(),
         isFinal: true,
       });
       await fixture.whenStable();
       expect(audioElement.src).toEqual('');
     });

  it('textEntryEndEvent with audio config without access token sets error message',
     async () => {
       component.accessToken = '';
       textEntryEndSubject.next({
         text: 'hi, there',
         timestampMillis: new Date().getTime(),
         isFinal: true,
         inAppTextToSpeechAudioConfig: {volume_gain_db: 0}
       });
       await fixture.whenStable();
       fixture.detectChanges();
       const errorMessage = fixture.nativeElement.querySelector(
                                '.error-message') as HTMLDivElement;
       expect(errorMessage.innerText).toEqual('TTS error: no access token');
     });

  for (const [errorObject, expectedErrorText] of [
           [{error: {error_message: 'foo error'}}, 'TTS error: foo error'],
           [{statusText: 'bar error'}, 'TTS error: bar error']] as
       Array<[any, string]>) {
    it(`synthesizeSpeech call error shows error message: ${expectedErrorText}`,
       async () => {
         const audioElement =
             fixture.nativeElement.querySelector('audio') as HTMLAudioElement;
         spyOn(component.textToSpeechService, 'synthesizeSpeech')
             .and.callFake(() => {
               return throwError(errorObject);
             });
         textEntryEndSubject.next({
           text: 'hi, there',
           timestampMillis: new Date().getTime(),
           isFinal: true,
           inAppTextToSpeechAudioConfig: {}
         });
         await fixture.whenStable();
         fixture.detectChanges();
         expect(audioElement.src).toEqual('');
         const errorMessage = fixture.nativeElement.querySelector(
                                  '.error-message') as HTMLDivElement;
         expect(errorMessage.innerText).toEqual(expectedErrorText);
       });
  }
});
