/** Unit test for SettingsEyeGazeComponent. */

import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';

import {BOUND_LISTENER_NAME} from '../../utils/cefsharp';
import {HttpEventLogger} from '../event-logger/event-logger-impl';
import {clearSettings, getAppSettings, LOCAL_STORAGE_ITEM_NAME} from '../settings/settings';
import {TestListener} from '../test-utils/test-cefsharp-listener';

import {SettingsEyeGazeComponent} from './settings-eye-gaze.component';
import {SettingsEyeGazeModule} from './settings-eye-gaze.module';

describe('SettingsEyeGazeComponent', () => {
  let fixture: ComponentFixture<SettingsEyeGazeComponent>;
  let testListener: TestListener;

  beforeEach(async () => {
    testListener = new TestListener();
    (window as any)[BOUND_LISTENER_NAME] = testListener;
    clearSettings();
    localStorage.removeItem(LOCAL_STORAGE_ITEM_NAME);
    await TestBed
        .configureTestingModule({
          imports: [SettingsEyeGazeModule],
          declarations: [SettingsEyeGazeComponent],
          providers:
              [{provide: HttpEventLogger, useValue: new HttpEventLogger(null)}],
        })
        .compileComponents();
    fixture = TestBed.createComponent(SettingsEyeGazeComponent);
    fixture.detectChanges();
    clearSettings();
  });

  it('Shows default showGazeTracker setting when loaded', async () => {
    await fixture.whenStable();
    const showGazeTrackerSection =
        fixture.debugElement.query(By.css('.show-gaze-tracker-section'));
    expect(showGazeTrackerSection).not.toBeNull();
    const buttons = showGazeTrackerSection.queryAll(By.css('.option-button'));
    expect(buttons.length).toEqual(2);
    expect(buttons[0].nativeElement.innerText).toEqual('Yes');
    expect(buttons[1].nativeElement.innerText).toEqual('No');
    const selectedButtons =
        showGazeTrackerSection.queryAll(By.css('.active-button'));
    expect(selectedButtons.length).toEqual(1);
    expect(selectedButtons[0].nativeElement.innerText).toEqual('Yes');
  });

  it('Shows default gazeFuzzyRadius setting when loaded', async () => {
    await fixture.whenStable();
    const gazeFuzzyRadiusSection =
        fixture.debugElement.query(By.css('.gaze-fuzzy-radius-section'));
    expect(gazeFuzzyRadiusSection).not.toBeNull();
    const buttons = gazeFuzzyRadiusSection.queryAll(By.css('.option-button'));
    expect(buttons.length).toEqual(5);
    expect(buttons[0].nativeElement.innerText).toEqual('0');
    expect(buttons[1].nativeElement.innerText).toEqual('10');
    expect(buttons[2].nativeElement.innerText).toEqual('20');
    expect(buttons[3].nativeElement.innerText).toEqual('30');
    expect(buttons[4].nativeElement.innerText).toEqual('40');
    const selectedButtons =
        gazeFuzzyRadiusSection.queryAll(By.css('.active-button'));
    expect(selectedButtons.length).toEqual(1);
    expect(selectedButtons[0].nativeElement.innerText).toEqual('20');
  });

  it('Changing showGazeTracker saves new settings', async () => {
    await fixture.whenStable();
    const showGazeTrackerSection =
        fixture.debugElement.query(By.css('.show-gaze-tracker-section'));
    const buttons = showGazeTrackerSection.queryAll(By.css('.option-button'));
    buttons[1].nativeElement.click();
    await fixture.whenStable();

    const selectedButtons =
        showGazeTrackerSection.queryAll(By.css('.active-button'));
    expect(selectedButtons.length).toEqual(1);
    expect(selectedButtons[0].nativeElement.innerText).toEqual('No');
    expect((await getAppSettings()).showGazeTracker).toEqual('NO');
    expect(testListener.setEyeGazeOptionsCalls.length).toEqual(1);
    expect(testListener.setEyeGazeOptionsCalls[0][0]).toEqual(false);
  });

  it('Changing gazeFuzzyRadius saves new settings', async () => {
    await fixture.whenStable();
    const gazeFuzzyRadiusSection =
        fixture.debugElement.query(By.css('.gaze-fuzzy-radius-section'));
    const buttons = gazeFuzzyRadiusSection.queryAll(By.css('.option-button'));
    buttons[4].nativeElement.click();
    await fixture.whenStable();

    const selectedButtons =
        gazeFuzzyRadiusSection.queryAll(By.css('.active-button'));
    expect(selectedButtons.length).toEqual(1);
    expect(selectedButtons[0].nativeElement.innerText).toEqual('40');
    expect((await getAppSettings()).gazeFuzzyRadius).toEqual(40);
    expect(testListener.setEyeGazeOptionsCalls.length).toEqual(1);
    expect(testListener.setEyeGazeOptionsCalls[0][1]).toEqual(40);
  });

  it('Changing dwell delay saves new settings', async () => {
    await fixture.whenStable();
    const dwellDelaySection =
        fixture.debugElement.query(By.css('.dwell-delay-section'));
    const buttons = dwellDelaySection.queryAll(By.css('.option-button'));
    buttons[3].nativeElement.click();
    await fixture.whenStable();

    const selectedButtons =
        dwellDelaySection.queryAll(By.css('.active-button'));
    expect(selectedButtons.length).toEqual(1);
    expect(selectedButtons[0].nativeElement.innerText).toEqual('600');
    expect((await getAppSettings()).dwellDelayMillis).toEqual(600);
    expect(testListener.setEyeGazeOptionsCalls.length).toEqual(1);
    expect(testListener.setEyeGazeOptionsCalls[0][2]).toEqual(600);
  });

  it('title section shows no version string when engine version is missing',
      async () => {
        await fixture.whenStable();

        const appTitle = fixture.debugElement.query(By.css('.app-title'));
        expect(appTitle.nativeElement.innerText).toEqual('Eye-gaze settings');
      });

  it('title section shows version string when engine version is available',
      async () => {
        (fixture.componentInstance as any)._engineVersion = '1.2.3.4';
        await fixture.whenStable();

        const appTitle = fixture.debugElement.query(By.css('.app-title'));
        const text = (appTitle.nativeElement.innerText as string).trim();
        expect(text.startsWith('Eye-gaze settings')).toBeTrue();
        expect(text.endsWith('(Engine version: 1.2.3.4)')).toBeTrue();
      });
});
