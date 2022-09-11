import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {RouterTestingModule} from '@angular/router/testing';

import * as cefSharp from '../utils/cefsharp';

import {AppComponent} from './app.component';
import {AuthModule} from './auth/auth.module';
import {HttpEventLogger} from './event-logger/event-logger-impl';
import {ExternalEventsModule} from './external/external-events.module';
import {InputBarControlEvent} from './input-bar/input-bar.component';
import {MetricsModule} from './metrics/metrics.module';
import {MiniBarModule} from './mini-bar/mini-bar.module';
import {clearSettings} from './settings/settings';
import {StudyManager} from './study/study-manager';
import {TestListener} from './test-utils/test-cefsharp-listener';
import {AppState, getAppState, resetStatesForTest, setAppState} from './types/app-state';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let testListener: TestListener;
  let inputBarControlEvents: InputBarControlEvent[];
  let studyManager: StudyManager;

  beforeEach(async () => {
    testListener = new TestListener();
    (window as any)[cefSharp.BOUND_LISTENER_NAME] = testListener;
    studyManager = new StudyManager(null, null);
    inputBarControlEvents = [];
    await TestBed
        .configureTestingModule({
          imports: [
            AuthModule,
            ExternalEventsModule,
            MetricsModule,
            MiniBarModule,
            RouterTestingModule,
          ],
          declarations: [AppComponent],
          providers: [
            {provide: HttpEventLogger, useValue: new HttpEventLogger(null)},
          ]
        })
        .compileComponents();
    fixture = TestBed.createComponent(AppComponent);
    fixture.componentInstance.studyManager = studyManager;
    fixture.componentInstance.inputBarControlSubject.subscribe(event => {
      inputBarControlEvents.push(event);
    });
    fixture.detectChanges();
    AppComponent.clearAppResizeCallback();
    clearSettings();
  });

  afterEach(async () => {
    resetStatesForTest();
  });

  it('should create the app', () => {
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have as title 'SpeakFasterApp'`, () => {
    const app = fixture.componentInstance;
    expect(app.title).toEqual('SpeakFasterApp');
  });

  it('should render app-auth-component initially', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-auth-component')).toBeTruthy();
  });

  it('finds content wrapper ElementRef', () => {
    expect(fixture.componentInstance.contentWrapper).not.toBeUndefined();
  });

  it('shows mini-bar component when AppState is MINIBAR', async () => {
    fixture.componentInstance.onNewAccessToken('foo-access-token');
    setAppState(AppState.MINIBAR);
    fixture.detectChanges();
    await fixture.whenStable();

    const miniBar =
        fixture.debugElement.query(By.css('app-mini-bar-component'));
    expect(miniBar).not.toBeNull();
  });

  it('hides mini-bar component when AppState is AE', async () => {
    fixture.componentInstance.onNewAccessToken('foo-access-token');
    setAppState(AppState.ABBREVIATION_EXPANSION);
    fixture.detectChanges();
    await fixture.whenStable();

    const miniBar =
        fixture.debugElement.query(By.css('app-mini-bar-component'));
    expect(miniBar).toBeNull();
    const abbreviationExpansionComponent =
        fixture.debugElement.query(By.css('app-abbreviation-component'));
    expect(abbreviationExpansionComponent).not.toBeNull();
    const leftNavButtons =
        fixture.debugElement.queryAll(By.css('.side-pane-button'));
    expect(leftNavButtons.length).toEqual(5);
  });

  it('registers button boxes with AppState is AE', async () => {
    fixture.componentInstance.onNewAccessToken('foo-access-token');
    setAppState(AppState.ABBREVIATION_EXPANSION);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(testListener.updateButtonBoxesCalls.length).toBeGreaterThan(0);
    const lastCall =
        testListener
            .updateButtonBoxesCalls[testListener.updateButtonBoxesCalls.length - 1];
    expect(lastCall[0].startsWith('AppComponent_')).toBeTrue();
    // Hardcoding he number of expected buttons.
    expect(lastCall[1].length).toEqual(5);
    lastCall[1].forEach(buttonBox => {
      expect(buttonBox.length).toEqual(4);
    });
  });

  it('calls setEyeGazeOptions with defaults on init', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    expect(testListener.setEyeGazeOptionsCalls.length).toEqual(1);
    const [call] = testListener.setEyeGazeOptionsCalls;
    expect(call[0]).toEqual(true);
    expect(call[1]).toEqual(20);
  });

  for (const appState
           of [AppState.QUICK_PHRASES_FAVORITE,
               AppState.QUICK_PHRASES_PARTNERS]) {
    it(`shows QuickPhrasesComponent when AppState is ${appState}`, async () => {
      fixture.componentInstance.onNewAccessToken('foo-access-token');
      setAppState(AppState.QUICK_PHRASES_FAVORITE);
      fixture.detectChanges();
      await fixture.whenStable();

      const miniBar =
          fixture.debugElement.query(By.css('app-mini-bar-component'));
      expect(miniBar).toBeNull();
      const abbreviationExpansionComponent =
          fixture.debugElement.query(By.css('app-abbreviation-component'));
      expect(abbreviationExpansionComponent).toBeNull();
      const quickPhraseComponents =
          fixture.debugElement.queryAll(By.css('app-quick-phrases-component'));
      expect(quickPhraseComponents.length).toEqual(1);
    });
  }

  it('clicking mini-bar button goes back to non-minized state', async () => {
    fixture.componentInstance.onNewAccessToken('foo-access-token');
    setAppState(AppState.MINIBAR);
    fixture.detectChanges();
    await fixture.whenStable();
    const miniBar =
        fixture.debugElement.query(By.css('app-mini-bar-component'));
    const button = miniBar.query(By.css('.main-button'));
    button.nativeElement.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.appState)
        .toEqual(AppState.ABBREVIATION_EXPANSION);
  });

  it('clicking left nav button minimizes app', async () => {
    fixture.componentInstance.onNewAccessToken('foo-access-token');
    setAppState(AppState.ABBREVIATION_EXPANSION);
    fixture.detectChanges();
    await fixture.whenStable();
    const leftNavButtons =
        fixture.debugElement.queryAll(By.css('.minimize-button'));
    leftNavButtons[leftNavButtons.length - 1].nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.appState).toEqual(AppState.MINIBAR);
    const miniBar =
        fixture.debugElement.query(By.css('app-mini-bar-component'));
    expect(miniBar).not.toBeNull();
  });

  it('clicking left nav button navigates to quick phrases', async () => {
    fixture.componentInstance.onNewAccessToken('foo-access-token');
    setAppState(AppState.ABBREVIATION_EXPANSION);
    fixture.detectChanges();
    await fixture.whenStable();
    const leftNavButtons =
        fixture.debugElement.queryAll(By.css('.side-pane-button'));
    leftNavButtons[1].nativeElement.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.appState)
        .toEqual(AppState.QUICK_PHRASES_PARTNERS);
    const miniBar =
        fixture.debugElement.query(By.css('app-mini-bar-component'));
    expect(miniBar).toBeNull();
  });

  it('de-minimizing remembers previous non-minimized state', async () => {
    fixture.componentInstance.onNewAccessToken('foo-access-token');
    setAppState(AppState.ABBREVIATION_EXPANSION);
    fixture.detectChanges();
    await fixture.whenStable();
    const leftNavButtons =
        fixture.debugElement.queryAll(By.css('.side-pane-button'));
    leftNavButtons[1].nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const minimizeButton =
        fixture.debugElement.query(By.css('.minimize-button'));
    minimizeButton.nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const miniBar =
        fixture.debugElement.query(By.css('app-mini-bar-component'));
    const button = miniBar.query(By.css('.main-button'));
    button.nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.appState)
        .toEqual(AppState.QUICK_PHRASES_PARTNERS);
  });

  it('under minimized state, the main area exists but is hidden', async () => {
    fixture.componentInstance.onNewAccessToken('foo-access-token');
    setAppState(AppState.MINIBAR);
    fixture.detectChanges();
    await fixture.whenStable();

    const mainArea = fixture.debugElement.query(By.css('.main-area'));
    expect(mainArea).not.toBeNull();
    expect(mainArea.classes['main-area-hidden']).toBeTrue();
    expect(mainArea.classes['study-mode']).toBeUndefined();
    expect(mainArea.query(By.css('app-input-bar-component'))).not.toBeNull();
    expect(mainArea.query(By.css('app-abbreviation-component'))).not.toBeNull();
    expect(mainArea.query(By.css('app-context-component'))).not.toBeNull();
  });

  it('under non-minimized state, the main area is not hidden', async () => {
    fixture.componentInstance.onNewAccessToken('foo-access-token');
    setAppState(AppState.ABBREVIATION_EXPANSION);
    fixture.detectChanges();
    await fixture.whenStable();

    const mainArea = fixture.debugElement.query(By.css('.main-area'));
    expect(mainArea).not.toBeNull();
    expect(mainArea.classes['main-area-hidden']).toBeUndefined();
    expect(mainArea.query(By.css('app-input-bar-component'))).not.toBeNull();
    expect(mainArea.query(By.css('app-abbreviation-component'))).not.toBeNull();
    expect(mainArea.query(By.css('app-context-component'))).not.toBeNull();
  });

  it('under quick phrase state, context component exists and is hidden', () => {
    fixture.componentInstance.onNewAccessToken('foo-access-token');
    setAppState(AppState.QUICK_PHRASES_FAVORITE);
    fixture.detectChanges();

    const appContextComponent =
        fixture.debugElement.query(By.css('app-context-component'));
    expect(appContextComponent).not.toBeNull();
    expect(appContextComponent.classes['app-context-component-area-hidden'])
        .toEqual(true);
  });

  it('under abbreviaton expansion state, context component is shown', () => {
    fixture.componentInstance.onNewAccessToken('foo-access-token');
    setAppState(AppState.ABBREVIATION_EXPANSION);
    fixture.detectChanges();

    const appContextComponent =
        fixture.debugElement.query(By.css('app-context-component'));
    expect(appContextComponent).not.toBeNull();
    expect(appContextComponent.classes['app-context-component-area-hidden'])
        .toBeUndefined();
  });

  it('isFocused is initially true', () => {
    expect(fixture.componentInstance.isFocused).toBeTrue();
  });

  it('calling setHostWindowFocus(false) sets isFocus to false', () => {
    (window as any).setHostWindowFocus(false);
    expect(fixture.componentInstance.isFocused).toBeFalse();
  });

  it('calling setHostWindowFocus() false then true sets isFocus to true',
     () => {
       (window as any).setHostWindowFocus(false);
       (window as any).setHostWindowFocus(true);
       expect(fixture.componentInstance.isFocused).toBeTrue();
     });

  it('switches to HELP app state on event', () => {
    fixture.componentInstance.onHelpButtonClicked(null as any);

    expect(fixture.componentInstance.appState).toEqual(AppState.HELP);
  });

  it('notification for input bar is initially undefined', () => {
    expect(fixture.componentInstance.inputBarNotification).toBeUndefined();
  });

  it('changing app state issues refocus input-bar event', () => {
    setAppState(AppState.MINIBAR);
    fixture.componentInstance.onAppStateDeminimized();

    expect(inputBarControlEvents.length).toEqual(1);
  });

  it('nonMinimizedStatesAppStates includes correct items: study off', () => {
    expect(fixture.componentInstance.nonMinimizedStatesAppStates).toEqual([
      AppState.QUICK_PHRASES_PARTNERS,
      AppState.QUICK_PHRASES_FAVORITE,
      AppState.ABBREVIATION_EXPANSION,
    ]);
  });

  it('special states are set after study on', async () => {
    fixture.componentInstance.onNewAccessToken('foo-access-token');
    setAppState(AppState.ABBREVIATION_EXPANSION);
    studyManager.maybeHandleRemoteControlCommand('study on');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.isStudyOn).toBeTrue();
    expect(fixture.componentInstance.nonMinimizedStatesAppStates).toEqual([
      AppState.ABBREVIATION_EXPANSION,
    ]);
    const mainArea = fixture.debugElement.query(By.css('.main-area'));
    expect(mainArea).not.toBeNull();
    expect(mainArea.classes['study-mode']).toBeTrue();
  });

  it('isStudyOn reflects off state after on', async () => {
    studyManager.maybeHandleRemoteControlCommand('study on');
    studyManager.maybeHandleRemoteControlCommand('study off');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.isStudyOn).toBeFalse();
  });

  it('isStudyOn sets compact context component', () => {
    fixture.componentInstance.onNewAccessToken('foo-access-token');
    setAppState(AppState.ABBREVIATION_EXPANSION);
    studyManager.maybeHandleRemoteControlCommand('study on');
    fixture.detectChanges();

    const mainArea = fixture.debugElement.query(By.css('.main-area'));
    expect(mainArea.query(By.css('.app-context-compact'))).not.toBeNull();
  });

  it('supportsAbbrevationExpansion reflects study manager full mode',
     async () => {
       setAppState(AppState.ABBREVIATION_EXPANSION);
       fixture.detectChanges();
       studyManager.maybeHandleRemoteControlCommand('start full dummy1');
       fixture.detectChanges();
       await fixture.whenStable();

       expect(fixture.componentInstance.supportsAbbrevationExpansion)
           .toBeFalse();
     });

  it('supportsAbbrevationExpansion reflects study manager abbrev mode',
     async () => {
       setAppState(AppState.ABBREVIATION_EXPANSION);
       fixture.detectChanges();
       studyManager.maybeHandleRemoteControlCommand('start abbrev dummy1');
       fixture.detectChanges();
       await fixture.whenStable();

       expect(fixture.componentInstance.supportsAbbrevationExpansion)
           .toBeTrue();
     });

  it('supportsAbbrevationExpansion reflects non-study mode', async () => {
    setAppState(AppState.ABBREVIATION_EXPANSION);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.supportsAbbrevationExpansion).toBeTrue();
  });

  it('eye tracker disconnection updates input-bar notification', () => {
    (window as any).eyeTrackerStatusHook('disconnected');

    expect(fixture.componentInstance.inputBarNotification)
        .toMatch(/.* disconnected\..* reconnect/);
    const lastEvent = inputBarControlEvents[inputBarControlEvents.length - 1];
    expect(lastEvent).toEqual({refocus: true});
  });

  it('eye tracker reconnection updates input-bar notification', () => {
    (window as any).eyeTrackerStatusHook('disconnected');
    (window as any).eyeTrackerStatusHook('connected');

    expect(fixture.componentInstance.inputBarNotification).toBeUndefined();
    const lastEvent = inputBarControlEvents[inputBarControlEvents.length - 1];
    expect(lastEvent).toEqual({refocus: true});
  });

  it('onContextStringsSelected orders input bar refocus', () => {
    fixture.componentInstance.onContextStringsSelected([{
      speakerId: 'Speaker001',
      speechContent: 'hello',
      startTimestamp: new Date(),
    }]);

    expect(inputBarControlEvents).toEqual([{refocus: true}]);
  });

  it('onEyeGazeSettingsButtonClicked triggers app state change', () => {
    fixture.componentInstance.onEyeGazeSettingsButtonClicked(
        new MouseEvent('click'));
    expect(getAppState()).toEqual(AppState.EYE_GAZE_SETTINGS);
  });

  it('onAiSettingsButtonClicked triggers app state change', () => {
    fixture.componentInstance.onAiSettingsButtonClicked(
        new MouseEvent('click'));
    expect(getAppState()).toEqual(AppState.AI_SETTINGS);
  });

  it('Initially does not show error message', () => {
    setAppState(AppState.ABBREVIATION_EXPANSION);
    expect(fixture.componentInstance.errorMessage).toBeUndefined();
    expect(fixture.debugElement.query(By.css('.error-message'))).toBeNull();
  });

  it('Shows error message when set to non-empty', () => {
    setAppState(AppState.ABBREVIATION_EXPANSION);
    (fixture.componentInstance as any)._errorMessage = 'Error: Foo';
    fixture.detectChanges();
    expect(fixture.componentInstance.errorMessage).toEqual('Error: Foo');
    const errorMessage = fixture.debugElement.query(By.css('.error-message'));
    expect(errorMessage.nativeElement.innerText).toEqual('Error: Foo');
  });

  it('hasAccessToken initially returns false', () => {
    expect(fixture.componentInstance.hasAccessToken).toBeFalse();
  });

  it('hasAccessToken returns true if access_token is provided', () => {
    fixture.componentInstance.onNewAccessToken('foo_access_token');
    expect(fixture.componentInstance.hasAccessToken).toBeTrue();
  });

});
