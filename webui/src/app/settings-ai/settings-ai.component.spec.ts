/** Unit test for SettingsAiComponent. */

import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';

import {BOUND_LISTENER_NAME} from '../../utils/cefsharp';
import {HttpEventLogger} from '../event-logger/event-logger-impl';
import {clearSettings, getAppSettings, LOCAL_STORAGE_ITEM_NAME} from '../settings/settings';
import {TestListener} from '../test-utils/test-cefsharp-listener';

import {SettingsAiComponent} from './settings-ai.component';
import {SettingsAiModule} from './settings-ai.module';

describe('SettingsAiComponent', () => {
  let fixture: ComponentFixture<SettingsAiComponent>;
  let testListener: TestListener;

  beforeEach(async () => {
    testListener = new TestListener();
    (window as any)[BOUND_LISTENER_NAME] = testListener;
    clearSettings();
    localStorage.removeItem(LOCAL_STORAGE_ITEM_NAME);
    await TestBed
        .configureTestingModule({
          imports: [SettingsAiModule],
          declarations: [SettingsAiComponent],
          providers:
              [{provide: HttpEventLogger, useValue: new HttpEventLogger(null)}],
        })
        .compileComponents();
    fixture = TestBed.createComponent(SettingsAiComponent);
    fixture.detectChanges();
    clearSettings();
  });

  it('Shows default num word suggestions setting when loaded', async () => {
    await fixture.whenStable();
    const numWordSuggestionsSection =
        fixture.debugElement.query(By.css('.num-word-suggestions-section'));
    expect(numWordSuggestionsSection).not.toBeNull();
    const buttons =
        numWordSuggestionsSection.queryAll(By.css('.option-button'));
    expect(buttons.length).toEqual(3);
    expect(buttons[0].nativeElement.innerText).toEqual('3');
    expect(buttons[1].nativeElement.innerText).toEqual('4');
    expect(buttons[2].nativeElement.innerText).toEqual('5');
    const selectedButtons =
        numWordSuggestionsSection.queryAll(By.css('.active-button'));
    expect(selectedButtons.length).toEqual(1);
    expect(selectedButtons[0].nativeElement.innerText).toEqual('4');
  });

  it('Shows default enable inckw setting when loaded', async () => {
    await fixture.whenStable();
    const enableInckwSection =
        fixture.debugElement.query(By.css('.enable-inckw-section'));
    expect(enableInckwSection).not.toBeNull();
    const buttons = enableInckwSection.queryAll(By.css('.option-button'));
    expect(buttons.length).toEqual(2);
    expect(buttons[0].nativeElement.innerText).toEqual('Yes');
    expect(buttons[1].nativeElement.innerText).toEqual('No');
    const selectedButtons =
        enableInckwSection.queryAll(By.css('.active-button'));
    expect(selectedButtons.length).toEqual(1);
    expect(selectedButtons[0].nativeElement.innerText).toEqual('No');
  });

  it('Shows default enable AE auto fire setting when loaded', async () => {
    await fixture.whenStable();
    const enableAeAutoFireSection =
        fixture.debugElement.query(By.css('.enable-ae-auto-fire-section'));
    expect(enableAeAutoFireSection).not.toBeNull();
    const buttons = enableAeAutoFireSection.queryAll(By.css('.option-button'));
    expect(buttons.length).toEqual(2);
    expect(buttons[0].nativeElement.innerText).toEqual('Yes');
    expect(buttons[1].nativeElement.innerText).toEqual('No');
    const selectedButtons =
        enableAeAutoFireSection.queryAll(By.css('.active-button'));
    expect(selectedButtons.length).toEqual(1);
    expect(selectedButtons[0].nativeElement.innerText).toEqual('No');
  });

  it('Changing num word suggestions saves new settings', async () => {
    await fixture.whenStable();
    const showGazeTrackerSection =
        fixture.debugElement.query(By.css('.num-word-suggestions-section'));
    const buttons = showGazeTrackerSection.queryAll(By.css('.option-button'));
    buttons[2].nativeElement.click();
    await fixture.whenStable();

    const selectedButtons =
        showGazeTrackerSection.queryAll(By.css('.active-button'));
    expect(selectedButtons.length).toEqual(1);
    expect(selectedButtons[0].nativeElement.innerText).toEqual('5');
    expect((await getAppSettings()).numWordSuggestions).toEqual(5);
  });

  it('Changing enable inckw saves new settings', async () => {
    await fixture.whenStable();
    const enableInckwSection =
        fixture.debugElement.query(By.css('.enable-inckw-section'));
    const buttons = enableInckwSection.queryAll(By.css('.option-button'));
    buttons[0].nativeElement.click();
    await fixture.whenStable();

    const selectedButtons =
        enableInckwSection.queryAll(By.css('.active-button'));
    expect(selectedButtons.length).toEqual(1);
    expect(selectedButtons[0].nativeElement.innerText).toEqual('Yes');
    expect((await getAppSettings()).enableInckw).toBeTrue();
  });

  it('Changing enable AE auto fire saves new settings', async () => {
    await fixture.whenStable();
    const enableAeAutoFireSection =
        fixture.debugElement.query(By.css('.enable-ae-auto-fire-section'));
    const buttons = enableAeAutoFireSection.queryAll(By.css('.option-button'));
    buttons[0].nativeElement.click();
    await fixture.whenStable();

    const selectedButtons =
        enableAeAutoFireSection.queryAll(By.css('.active-button'));
    expect(selectedButtons.length).toEqual(1);
    expect(selectedButtons[0].nativeElement.innerText).toEqual('Yes');
    expect((await getAppSettings()).enableAbbrevExpansionAutoFire).toBeTrue();
  });
});
