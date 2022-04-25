/** Unit tests for TtsVoiceSelectionComponent. */

import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';

import {BOUND_LISTENER_NAME} from '../../utils/cefsharp';
import {HttpEventLogger} from '../event-logger/event-logger-impl';
import {clearSettings, getAppSettings, LOCAL_STORAGE_ITEM_NAME, setGenericTtsVoiceName, setTtsVolume} from '../settings/settings';

import {TtsVoiceSelectionComponent} from './tts-voice-selection.component';
import {TtsVoiceSelectionModule} from './tts-voice-selection.module';

describe('TtsVoiceSelectionComponent', () => {
  let fixture: ComponentFixture<TtsVoiceSelectionComponent>;

  beforeEach(async () => {
    (window as any)[BOUND_LISTENER_NAME] = undefined;
    clearSettings();
    spyOn(window.speechSynthesis, 'getVoices').and.returnValue([
      {
        default: false,
        name: 'English Voice 1',
        lang: 'en-US',
        voiceURI: '',
        localService: true,
      },
      {
        default: false,
        name: 'French Voice 1',
        lang: 'fr-CA',
        voiceURI: '',
        localService: true,
      },
      {
        default: false,
        name: 'English Voice 2',
        lang: 'en-US',
        voiceURI: '',
        localService: true,
      }
    ]);
    localStorage.removeItem(LOCAL_STORAGE_ITEM_NAME);
    await TestBed
        .configureTestingModule({
          imports: [TtsVoiceSelectionModule],
          declarations: [TtsVoiceSelectionComponent],
          providers:
              [{provide: HttpEventLogger, useValue: new HttpEventLogger(null)}],
        })
        .compileComponents();
    fixture = TestBed.createComponent(TtsVoiceSelectionComponent);
    fixture.detectChanges();
  });

  afterEach(async () => {
    HttpEventLogger.setFullLogging(false);
  });

  it('Shows first voice when voice name is not set', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    const displayedVoiceName =
        fixture.debugElement.query(By.css('.displayed-voice-name'));
    expect(displayedVoiceName.nativeElement.innerText)
        .toEqual('English Voice 1');
  });

  it('Shows selected non-first voice name', async () => {
    setGenericTtsVoiceName('English Voice 2');
    fixture.componentInstance.ngOnInit();
    await fixture.whenStable();
    fixture.detectChanges();

    const displayedVoiceName =
        fixture.debugElement.query(By.css('.displayed-voice-name'));
    expect(displayedVoiceName.nativeElement.innerText)
        .toEqual('English Voice 2');
  });

  it('With two voices, prev button is initially disabled', async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    const prevButton = fixture.debugElement.query(By.css('.prev-button'));

    expect(prevButton.nativeElement.disabled).toBeTrue();
  });

  it('With two voices, next button is initially enabled', async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    const prevButton = fixture.debugElement.query(By.css('.next-button'));

    expect(prevButton.nativeElement.disabled).toBeFalse();
  });

  it('numAvailableTtsVoices returns correct value', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.numAvailableTtsVoices).toEqual(2);
  });

  it('Clicking next button updates selected voice', async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    const nextButton = fixture.debugElement.query(By.css('.next-button'));
    nextButton.nativeElement.click();
    fixture.detectChanges();

    const displayedVoiceName =
        fixture.debugElement.query(By.css('.displayed-voice-name'));
    expect(displayedVoiceName.nativeElement.innerText)
        .toEqual('English Voice 2');
    expect((await getAppSettings()).genericTtsVoiceName)
        .toEqual('English Voice 2');
    expect(nextButton.nativeElement.disabled).toBeTrue();
  });

  it('Clicking next then prev button re-selects first voice', async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    const nextButton = fixture.debugElement.query(By.css('.next-button'));
    const prevButton = fixture.debugElement.query(By.css('.prev-button'));
    nextButton.nativeElement.click();
    fixture.detectChanges();
    prevButton.nativeElement.click();
    fixture.detectChanges();

    const displayedVoiceName =
        fixture.debugElement.query(By.css('.displayed-voice-name'));
    expect(displayedVoiceName.nativeElement.innerText)
        .toEqual('English Voice 1');
    expect((await getAppSettings()).genericTtsVoiceName)
        .toEqual('English Voice 1');
    expect(nextButton.nativeElement.disabled).toBeFalse();
    expect(prevButton.nativeElement.disabled).toBeTrue();
  });
});
