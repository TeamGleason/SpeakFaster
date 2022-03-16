/** Unit test for SettingsComponent. */

import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';

import {BOUND_LISTENER_NAME} from '../../utils/cefsharp';
import {HttpEventLogger} from '../event-logger/event-logger-impl';

import {clearSettings, getAppSettings, LOCAL_STORAGE_ITEM_NAME, setTtsVolume} from './settings';
import {SettingsComponent} from './settings.component';
import {SettingsModule} from './settings.module';

fdescribe('SettingsComponent', () => {
  let fixture: ComponentFixture<SettingsComponent>;

  beforeEach(async () => {
    (window as any)[BOUND_LISTENER_NAME] = undefined;
    clearSettings();
    localStorage.removeItem(LOCAL_STORAGE_ITEM_NAME);
    await TestBed
        .configureTestingModule({
          imports: [SettingsModule],
          declarations: [SettingsComponent],
          providers:
              [{provide: HttpEventLogger, useValue: new HttpEventLogger(null)}],
        })
        .compileComponents();
    fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
  });

  it('Shows default TTS voice setting when loaded', async () => {
    await fixture.whenStable();
    const ttsVolumeSection =
        fixture.debugElement.query(By.css('.tts-voice-section'));
    expect(ttsVolumeSection).not.toBeNull();
    const buttons = ttsVolumeSection.queryAll(By.css('.option-button'));
    expect(buttons.length).toEqual(2);
    expect(buttons[0].nativeElement.innerText).toEqual('Personalized');
    expect(buttons[1].nativeElement.innerText).toEqual('Generic');
    const selectedButtons = ttsVolumeSection.queryAll(By.css('.active-button'));
    expect(selectedButtons.length).toEqual(1);
    expect(selectedButtons[0].nativeElement.innerText).toEqual('Generic');
  });

  it('Shows default TTS volume setting when loaded', async () => {
    await fixture.whenStable();
    const ttsVolumeSection =
        fixture.debugElement.query(By.css('.tts-volume-section'));
    expect(ttsVolumeSection).not.toBeNull();
    const buttons = ttsVolumeSection.queryAll(By.css('.option-button'));
    expect(buttons.length).toEqual(5);
    expect(buttons[0].nativeElement.innerText).toEqual('Quiet');
    expect(buttons[1].nativeElement.innerText).toEqual('Medium Quiet');
    expect(buttons[2].nativeElement.innerText).toEqual('Medium');
    expect(buttons[3].nativeElement.innerText).toEqual('Medium Loud');
    expect(buttons[4].nativeElement.innerText).toEqual('Loud');
    const selectedButtons = ttsVolumeSection.queryAll(By.css('.active-button'));
    expect(selectedButtons.length).toEqual(1);
    expect(selectedButtons[0].nativeElement.innerText).toEqual('Medium');
  });

  it('Changing TTS voice saves new settings', async () => {
    await fixture.whenStable();
    const ttsVoiceSection =
        fixture.debugElement.query(By.css('.tts-voice-section'));
    const buttons = ttsVoiceSection.queryAll(By.css('.option-button'));
    buttons[1].nativeElement.click();
    await fixture.whenStable();

    const selectedButtons = ttsVoiceSection.queryAll(By.css('.active-button'));
    expect(selectedButtons.length).toEqual(1);
    expect(selectedButtons[0].nativeElement.innerText).toEqual('Generic');
    expect((await getAppSettings()).ttsVoiceType).toEqual('GENERIC');
  });

  it('Chaging TTS volume saves new settings', async () => {
    await fixture.whenStable();
    const ttsVolumeSection =
        fixture.debugElement.query(By.css('.tts-volume-section'));
    const buttons = ttsVolumeSection.queryAll(By.css('.option-button'));
    buttons[4].nativeElement.click();
    await fixture.whenStable();

    const selectedButtons = ttsVolumeSection.queryAll(By.css('.active-button'));
    expect(selectedButtons.length).toEqual(1);
    expect(selectedButtons[0].nativeElement.innerText).toEqual('Loud');
    expect((await getAppSettings()).ttsVolume).toEqual('LOUD');
  });

  it('Changing TTS speaking rate saves new settings', async () => {
    await fixture.whenStable();
    const ttsSpeakingRateSection =
        fixture.debugElement.query(By.css('.tts-speaking-rate-section'));
    const buttons = ttsSpeakingRateSection.queryAll(By.css('.option-button'));
    buttons[1].nativeElement.click();
    await fixture.whenStable();

    const selectedButtons =
        ttsSpeakingRateSection.queryAll(By.css('.active-button'));
    expect(selectedButtons.length).toEqual(1);
    expect(selectedButtons[0].nativeElement.innerText).toEqual('0.9');
    expect((await getAppSettings()).ttsSpeakingRate).toEqual(0.9);
  });

  it('Clicking help button emits helpButtonClicked', () => {
    let numEmittedEvents = 0;
    fixture.componentInstance.helpButtonClicked.subscribe((event) => {
      numEmittedEvents++;
    });
    const helpButton = fixture.debugElement.query(By.css('.help-button'));
    helpButton.nativeElement.click();

    expect(numEmittedEvents).toEqual(1);
  });

  it('Help button has state independent of settings', () => {
    setTtsVolume('QUIET');
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.help-button'))
               .classes['active-button'])
        .toBeUndefined();

    setTtsVolume('MEDIUM');
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.help-button'))
               .classes['active-button'])
        .toBeUndefined();

    setTtsVolume('LOUD');
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.help-button'))
               .classes['active-button'])
        .toBeUndefined();
  });

  it('shows user ID when user email and given name are unavailable', () => {
    fixture.componentInstance.userId = 'testuser2';
    fixture.detectChanges();

    const userIdSpan = fixture.debugElement.query(By.css('.user-id'));
    expect(userIdSpan.nativeElement.innerText.trim())
        .toEqual('(ID: testuser2)');
  });
});
