/** Unit tests for SpeakButtonComponent. */
import {ComponentFixture, fakeAsync, TestBed, tick} from '@angular/core/testing';
import {By} from '@angular/platform-browser';

import {SpeakButtonComponent} from './speak-button.component';
import {SpeakButtonModule} from './speak-button.module';

describe('SpeakButton', () => {
  let fixture: ComponentFixture<SpeakButtonComponent>;

  beforeEach(async () => {
    await TestBed
        .configureTestingModule({
          imports: [SpeakButtonModule],
          declarations: [SpeakButtonComponent],
        })
        .compileComponents();
    fixture = TestBed.createComponent(SpeakButtonComponent);
    fixture.detectChanges();
  });

  it('initially shows the speak button', () => {
    const button = fixture.debugElement.query(By.css('.speak-button'));
    const img = button.query(By.css('.button-image'));

    expect(img.nativeElement.src.indexOf('/assets/images/speak.png'))
        .toBeGreaterThanOrEqual(0);
    expect(button.query(By.css('.mat-progress-spinner'))).toBeNull();
  });

  it('shows spinner during TTS request', () => {
    fixture.componentInstance.onTextToSpeechEvent({state: 'REQUESTING'});
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.mat-progress-spinner')))
        .not.toBeNull();
    const button = fixture.debugElement.query(By.css('.speak-button'));
    expect(button.query(By.css('.button-image'))).toBeNull();
  });

  it('shows playing gif image during playing state', () => {
    fixture.componentInstance.onTextToSpeechEvent({state: 'PLAY'});
    fixture.detectChanges();

    const button = fixture.debugElement.query(By.css('.speak-button'));
    const img = button.query(By.css('.button-image'));
    expect(img.nativeElement.src.indexOf('/assets/images/speak-animation.gif'))
        .toBeGreaterThanOrEqual(0);
    expect(button.query(By.css('.mat-progress-spinner'))).toBeNull();
  });

  it('shows speak button after playing ends', () => {
    fixture.componentInstance.onTextToSpeechEvent({state: 'PLAY'});
    fixture.detectChanges();
    fixture.componentInstance.onTextToSpeechEvent({state: 'END'});
    fixture.detectChanges();

    const button = fixture.debugElement.query(By.css('.speak-button'));
    const img = button.query(By.css('.button-image'));
    expect(img.nativeElement.src.indexOf('/assets/images/speak.png'))
        .toBeGreaterThanOrEqual(0);
    expect(button.query(By.css('.mat-progress-spinner'))).toBeNull();
  });

  it('shows error image if is error', () => {
    fixture.componentInstance.onTextToSpeechEvent({state: 'ERROR'});
    fixture.detectChanges();

    const button = fixture.debugElement.query(By.css('.speak-button'));
    const img = button.query(By.css('.button-image'));
    expect(img.nativeElement.src.indexOf('/assets/images/error-circle.png'))
        .toBeGreaterThanOrEqual(0);
    expect(button.query(By.css('.mat-progress-spinner'))).toBeNull();
  });

  it('after error, reverts to ready state after delay', fakeAsync(() => {
       fixture.componentInstance.onTextToSpeechEvent({state: 'ERROR'});
       fixture.detectChanges();
       tick(5000);

       const button = fixture.debugElement.query(By.css('.speak-button'));
       const img = button.query(By.css('.button-image'));
       expect(img.nativeElement.src.indexOf('/assets/images/speak.png'))
           .toBeGreaterThanOrEqual(0);
       expect(button.query(By.css('.mat-progress-spinner'))).toBeNull();
     }));

  it('clicking the button emits event', () => {
    const recordedEvents: Event[] = [];
    fixture.componentInstance.speakButtonClicked.subscribe(event => {
      recordedEvents.push(event);
    });
    const button = fixture.debugElement.query(By.css('.speak-button'));
    button.nativeElement.click();

    expect(recordedEvents.length).toEqual(1);
  });
});
