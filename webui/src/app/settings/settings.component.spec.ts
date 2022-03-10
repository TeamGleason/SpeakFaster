/** Unit test for SettingsComponent. */

/** Unit tests for QuickPhrasesComponent. */
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';

import {BOUND_LISTENER_NAME} from '../../utils/cefsharp';
import {HttpEventLogger} from '../event-logger/event-logger-impl';

import {clearSettings, getAppSettings, LOCAL_STORAGE_ITEM_NAME} from './settings';
import {SettingsComponent} from './settings.component';
import {SettingsModule} from './settings.module';

describe('SettingsComponent', () => {
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
    expect(selectedButtons[0].nativeElement.innerText).toEqual('Personalized');
  });

  it('Shows default TTS volume setting when loaded', async () => {
    await fixture.whenStable();
    const ttsVolumeSection =
        fixture.debugElement.query(By.css('.tts-volume-section'));
    expect(ttsVolumeSection).not.toBeNull();
    const buttons = ttsVolumeSection.queryAll(By.css('.option-button'));
    expect(buttons.length).toEqual(3);
    expect(buttons[0].nativeElement.innerText).toEqual('Quiet');
    expect(buttons[1].nativeElement.innerText).toEqual('Medium');
    expect(buttons[2].nativeElement.innerText).toEqual('Loud');
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
    buttons[2].nativeElement.click();
    await fixture.whenStable();

    const selectedButtons = ttsVolumeSection.queryAll(By.css('.active-button'));
    expect(selectedButtons.length).toEqual(1);
    expect(selectedButtons[0].nativeElement.innerText).toEqual('Loud');
    expect((await getAppSettings()).ttsVolume).toEqual('LOUD');
  });

  it('Clicking help button emits helpButtonClicked', () => {
    let numEmittedEvents = 0;
    fixture.componentInstance.helpButtonClicked.subscribe((event) => {
      numEmittedEvents++;
    });
    const helpButton = fixture.debugElement.query(By.css('.help-button'));
    helpButton.nativeElement.cick();

    expect(numEmittedEvents).toEqual(1);
  });
});
