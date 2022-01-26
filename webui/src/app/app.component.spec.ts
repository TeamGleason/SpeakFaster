import {ComponentFixture, TestBed} from '@angular/core/testing';
import {RouterTestingModule} from '@angular/router/testing';

import {AppComponent} from './app.component';
import {AuthModule} from './auth/auth.module';
import {ExternalEventsModule} from './external/external-events.module';
import {MetricsModule} from './metrics/metrics.module';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;

  beforeEach(async () => {
    await TestBed
        .configureTestingModule({
          imports: [
            AuthModule,
            ExternalEventsModule,
            MetricsModule,
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
});
