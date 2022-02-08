import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {RouterTestingModule} from '@angular/router/testing';

import * as cefSharp from '../utils/cefsharp';

import {AppComponent} from './app.component';
import {AuthModule} from './auth/auth.module';
import {ExternalEventsModule} from './external/external-events.module';
import {MetricsModule} from './metrics/metrics.module';
import {MiniBarModule} from './mini-bar/mini-bar.module';
import {TestListener} from './test-utils/test-cefsharp-listener';
import {AppState} from './types/app-state';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let testListener: TestListener;

  beforeEach(async () => {
    testListener = new TestListener();
    (window as any)[cefSharp.BOUND_LISTENER_NAME] = testListener;
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
        })
        .compileComponents();
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    AppComponent.clearAppResizeCallback();
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
    fixture.componentInstance.appState = AppState.MINIBAR;
    fixture.detectChanges();
    await fixture.whenStable();

    const miniBar =
        fixture.debugElement.query(By.css('app-mini-bar-component'));
    expect(miniBar).not.toBeNull();
  });

  it('hides mini-bar component when AppState is AE', async () => {
    fixture.componentInstance.onNewAccessToken('foo-access-token');
    fixture.componentInstance.appState = AppState.ABBREVIATION_EXPANSION;
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
    expect(leftNavButtons.length).toEqual(6);
  });

  it('registers button boxes with AppState is AE', async () => {
    fixture.componentInstance.onNewAccessToken('foo-access-token');
    fixture.componentInstance.appState = AppState.ABBREVIATION_EXPANSION;
    fixture.detectChanges();
    await fixture.whenStable();

    expect(testListener.updateButtonBoxesCalls.length).toBeGreaterThan(0);
    const lastCall =
        testListener
            .updateButtonBoxesCalls[testListener.updateButtonBoxesCalls.length - 1];
    expect(lastCall[0].startsWith('AppComponent_')).toBeTrue();
    expect(lastCall[1].length)
        .toEqual(6);  // Harcoding he number of expected buttons.
    lastCall[1].forEach(buttonBox => {
      expect(buttonBox.length).toEqual(4);
    });
  });

  for (const appState
           of [AppState.QUICK_PHRASES_CARE, AppState.QUICK_PHRASES_FAVORITE,
               AppState.QUICK_PHRASES_PARTNERS,
               AppState.QUICK_PHRASES_TEMPORAL]) {
    it(`shows QuickPhrasesComponent when AppState is ${appState}`, async () => {
      fixture.componentInstance.onNewAccessToken('foo-access-token');
      fixture.componentInstance.appState = AppState.QUICK_PHRASES_CARE;
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
    fixture.componentInstance.appState = AppState.MINIBAR;
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
    fixture.componentInstance.appState = AppState.ABBREVIATION_EXPANSION;
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
    fixture.componentInstance.appState = AppState.ABBREVIATION_EXPANSION;
    fixture.detectChanges();
    await fixture.whenStable();
    const leftNavButtons =
        fixture.debugElement.queryAll(By.css('.side-pane-button'));
    leftNavButtons[0].nativeElement.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.appState)
        .toEqual(AppState.QUICK_PHRASES_FAVORITE);
    const miniBar =
        fixture.debugElement.query(By.css('app-mini-bar-component'));
    expect(miniBar).toBeNull();
  });

  it('de-minimizing remembers previous non-minimized state', async () => {
    fixture.componentInstance.onNewAccessToken('foo-access-token');
    fixture.componentInstance.appState = AppState.ABBREVIATION_EXPANSION;
    fixture.detectChanges();
    await fixture.whenStable();
    const leftNavButtons =
        fixture.debugElement.queryAll(By.css('.side-pane-button'));
    leftNavButtons[0].nativeElement.click();
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
        .toEqual(AppState.QUICK_PHRASES_FAVORITE);
  });
});
