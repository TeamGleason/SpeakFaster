/** Unit tests for TextToSpeechComponent. */
import {HttpClientModule} from '@angular/common/http';
import {ComponentFixture, fakeAsync, TestBed, tick} from '@angular/core/testing';
import {of, Subject, throwError} from 'rxjs';
import {BOUND_LISTENER_NAME} from 'src/utils/cefsharp';

import {clearSettings, getAppSettings, setTtsVoiceType} from '../settings/settings';
import {TextEntryEndEvent} from '../types/text-entry';

import {getCloudTextToSpeechVolumeGainDb, getLocalTextToSpeechVolume, TextToSpeechComponent, TextToSpeechEvent, TextToSpeechListener} from './text-to-speech.component';
import {TextToSpeechModule} from './text-to-speech.module';

describe('TextToSpeechCmponent', () => {
  let fixture: ComponentFixture<TextToSpeechComponent>;
  let component: TextToSpeechComponent;
  let textEntryEndSubject: Subject<TextEntryEndEvent>;

  beforeEach(async () => {
    (window as any)[BOUND_LISTENER_NAME] = undefined;
    textEntryEndSubject = new Subject();
    TextToSpeechComponent.clearTextToSpeechListener();
    await TestBed
        .configureTestingModule({
          imports: [TextToSpeechModule, HttpClientModule],
          declarations: [TextToSpeechComponent],
        })
        .compileComponents();
    fixture = TestBed.createComponent(TextToSpeechComponent);
    component = fixture.componentInstance;
    component.textEntryEndSubject = textEntryEndSubject;
    component.accessToken = 'test_token';
    component.disableAudioElementPlayForTest();
    fixture.detectChanges();
    jasmine.getEnv().allowRespy(true);
    clearSettings();
  });

  afterEach(async () => {
    clearSettings();
  });

  it('registerTextToSpeechListener registers listeners and gets TTS events',
     fakeAsync(() => {
       setTtsVoiceType('PERSONALIZED');
       spyOn(component.textToSpeechService, 'synthesizeSpeech')
           .and.returnValue(of({
             audio_content: '0123abcd',
             audio_config: {
               audio_encoding: 'LINEAR16',
               speaking_rate: 1.0,
               volume_gain_db: 0.0,
             }
           }));
       const recordedEvents: TextToSpeechEvent[] = [];
       const listener: TextToSpeechListener = (event: TextToSpeechEvent) => {
         recordedEvents.push(event);
       };
       TextToSpeechComponent.registerTextToSpeechListener(listener);
       textEntryEndSubject.next({
         text: 'Hi',
         timestampMillis: new Date().getTime(),
         isFinal: true,
         inAppTextToSpeechAudioConfig: {}
       });
       tick();

       expect(recordedEvents.length).toEqual(1);
       expect(recordedEvents[0])
           .toEqual({state: 'REQUESTING', errorMessage: undefined});
       expect(component.audioPlayCallCount).toEqual(1);
       expect(component.ttsAudioElements.first.nativeElement.src)
           .toEqual('data:audio/wav;base64,0123abcd');
     }));

  it('unregisterTextToSpeechListener unregisters listener', fakeAsync(() => {
       spyOn(component.textToSpeechService, 'synthesizeSpeech')
           .and.returnValue(of({
             audio_content: '0123abcd',
             audio_config: {
               audio_encoding: 'LINEAR16',
               speaking_rate: 1.0,
               volume_gain_db: 0.0,
             }
           }));
       const recordedEvents: TextToSpeechEvent[] = [];
       const listener: TextToSpeechListener = (event: TextToSpeechEvent) => {
         recordedEvents.push(event);
       };
       TextToSpeechComponent.registerTextToSpeechListener(listener);
       TextToSpeechComponent.unregisterTextToSpeechListener(listener);
       textEntryEndSubject.next({
         text: 'Hi',
         timestampMillis: new Date().getTime(),
         isFinal: true,
         inAppTextToSpeechAudioConfig: {}
       });
       tick();

       expect(recordedEvents.length).toEqual(0);
     }));

  it('listener is notified of audio data empty error', fakeAsync(() => {
       setTtsVoiceType('PERSONALIZED');
       spyOn(component.textToSpeechService, 'synthesizeSpeech')
           .and.returnValue(of({
             audio_content: '',
             audio_config: {
               audio_encoding: 'LINEAR16',
               speaking_rate: 1.0,
               volume_gain_db: 0.0,
             }
           }));
       const recordedEvents: TextToSpeechEvent[] = [];
       const listener: TextToSpeechListener = (event: TextToSpeechEvent) => {
         recordedEvents.push(event);
       };
       TextToSpeechComponent.registerTextToSpeechListener(listener);
       textEntryEndSubject.next({
         text: 'Hi',
         timestampMillis: new Date().getTime(),
         isFinal: true,
         inAppTextToSpeechAudioConfig: {}
       });
       tick();

       expect(recordedEvents.length).toEqual(2);
       expect(recordedEvents[0])
           .toEqual({state: 'REQUESTING', errorMessage: undefined});
       expect(recordedEvents[1])
           .toEqual({state: 'ERROR', errorMessage: 'Audio is empty'});
     }));

  it('listener is notified of error from service', fakeAsync(() => {
       setTtsVoiceType('PERSONALIZED');
       spyOn(component.textToSpeechService, 'synthesizeSpeech')
           .and.returnValue(
               throwError({error: {error_message: 'foo audio error'}}));
       const recordedEvents: TextToSpeechEvent[] = [];
       const listener: TextToSpeechListener = (event: TextToSpeechEvent) => {
         recordedEvents.push(event);
       };
       TextToSpeechComponent.registerTextToSpeechListener(listener);
       textEntryEndSubject.next({
         text: 'Hello there',
         timestampMillis: new Date().getTime(),
         isFinal: true,
         inAppTextToSpeechAudioConfig: {}
       });
       tick();

       expect(recordedEvents.length).toEqual(2);
       expect(recordedEvents[0])
           .toEqual({state: 'REQUESTING', errorMessage: undefined});
       expect(recordedEvents[1])
           .toEqual({state: 'ERROR', errorMessage: 'foo audio error'});
     }));

  for (const [ttsVolume, expectedGainDb] of [
           ['QUIET', -6], ['MEDIUM_QUIET', -3], ['MEDIUM', 0],
           ['MEDIUM_LOUD', 3], ['LOUD', 6]] as
       Array<['QUIET' | 'MEDIUM' | 'LOUD', number]>) {
    it('getCloudTextToSpeechVolumeGainDb returns correct values: ' + ttsVolume,
       () => {
         expect(getCloudTextToSpeechVolumeGainDb({
           ttsVoiceType: 'PERSONALIZED',
           ttsVolume: ttsVolume,
         })).toEqual(expectedGainDb);
       });
  }

  for (const [ttsVolume, expectedGainDb] of [
           ['QUIET', 0.251], ['MEDIUM', 0.5], ['LOUD', 1.0]] as
       Array<['QUIET' | 'MEDIUM' | 'LOUD', number]>) {
    it('getLocalTextToSpeechVolume returns correct values: ' + ttsVolume,
       () => {
         expect(getLocalTextToSpeechVolume({
           ttsVoiceType: 'GENERIC',
           ttsVolume: ttsVolume,
         })).toBeCloseTo(expectedGainDb);
       });
  }

  it('event with empty text and repeat request speaks out loud spoken phrase',
     fakeAsync(() => {
       setTtsVoiceType('PERSONALIZED');
       spyOn(component.textToSpeechService, 'synthesizeSpeech')
           .and.returnValue(of({
             audio_content: '0123abcd',
             audio_config: {
               audio_encoding: 'LINEAR16',
               speaking_rate: 1.0,
               volume_gain_db: 0.0,
             }
           }));
       const recordedEvents: TextToSpeechEvent[] = [];
       const listener: TextToSpeechListener = (event: TextToSpeechEvent) => {
         recordedEvents.push(event);
       };
       TextToSpeechComponent.registerTextToSpeechListener(listener);
       textEntryEndSubject.next({
         text: 'hi',
         timestampMillis: new Date().getTime(),
         isFinal: true,
         inAppTextToSpeechAudioConfig: {},
       });
       tick();

       textEntryEndSubject.next({
         text: '',
         repeatLastNonEmpty: true,
         timestampMillis: new Date().getTime(),
         isFinal: true,
         inAppTextToSpeechAudioConfig: {},
       });
       tick();
       expect(recordedEvents.length).toEqual(2);
       expect(recordedEvents[0])
           .toEqual({state: 'REQUESTING', errorMessage: undefined});
       expect(component.audioPlayCallCount).toEqual(2);
       expect(component.ttsAudioElements.first.nativeElement.src)
           .toEqual('data:audio/wav;base64,0123abcd');
     }));

  it('event with empty text and repeat request speaks out loud last injected phrase',
     fakeAsync(() => {
       setTtsVoiceType('PERSONALIZED');
       spyOn(component.textToSpeechService, 'synthesizeSpeech')
           .and.returnValue(of({
             audio_content: '0123abcd',
             audio_config: {
               audio_encoding: 'LINEAR16',
               speaking_rate: 1.0,
               volume_gain_db: 0.0,
             }
           }));
       const recordedEvents: TextToSpeechEvent[] = [];
       const listener: TextToSpeechListener = (event: TextToSpeechEvent) => {
         recordedEvents.push(event);
       };
       TextToSpeechComponent.registerTextToSpeechListener(listener);
       textEntryEndSubject.next({
         text: 'hi',
         timestampMillis: new Date().getTime(),
         isFinal: true,
         injectedKeys: ['h', 'i'],
         inAppTextToSpeechAudioConfig: undefined,
       });
       tick();

       textEntryEndSubject.next({
         text: '',
         repeatLastNonEmpty: true,
         timestampMillis: new Date().getTime(),
         isFinal: true,
         inAppTextToSpeechAudioConfig: {},
       });
       tick();
       expect(recordedEvents.length).toEqual(1);
       expect(recordedEvents[0])
           .toEqual({state: 'REQUESTING', errorMessage: undefined});
       expect(component.audioPlayCallCount).toEqual(1);
       expect(component.ttsAudioElements.first.nativeElement.src)
           .toEqual('data:audio/wav;base64,0123abcd');
     }));

  it('Initializes to cloud (personalized) TTS if speechSynthesis is unavailable',
      async () => {
        setTtsVoiceType('GENERIC');
        spyOn(fixture.componentInstance, 'getSpeechSynthesis')
            .and.returnValue(undefined);
        fixture.componentInstance.ngOnInit();
        await fixture.whenStable();
        expect((await getAppSettings()).ttsVoiceType).toEqual('PERSONALIZED');
      });
});
