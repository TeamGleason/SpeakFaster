/** Unit tests for TextPredictionComponent. */
import {Injectable} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';

import * as cefSharp from '../../utils/cefsharp';
import {SpeakFasterService} from '../speakfaster-service';
import {TestListener} from '../test-utils/test-cefsharp-listener';

import {TextPredictionComponent} from './text-prediction.component';
import {TextPredictionModule} from './text-prediction.module';

@Injectable()
class SpeakFasterServiceForTest {
  // TODO(cais): Flesh out test implementations.
}

// TODO(cais): Remove fdescribe. DO NOT SUBMIT.
fdescribe('TextPredictionCmponent', () => {
  let fixture: ComponentFixture<TextPredictionComponent>;
  let component: TextPredictionComponent;
  let testListener: TestListener;

  beforeEach(async () => {
    testListener = new TestListener();
    (window as any)[cefSharp.BOUND_LISTENER_NAME] = testListener;
    await TestBed
        .configureTestingModule({
          imports: [TextPredictionModule],
          declarations: [TextPredictionComponent],
          providers: [
            {provide: SpeakFasterService, useValue: SpeakFasterServiceForTest}
          ]
        })
        .compileComponents();
    fixture = TestBed.createComponent(TextPredictionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    jasmine.getEnv().allowRespy(true);
  });

  afterAll(async () => {
    delete (window as any)[cefSharp.BOUND_LISTENER_NAME];
  });

  it('Initial prediction buttons invoke updateButtonBoxesForElements',
     async () => {
       await fixture.whenStable();
       const calls = testListener.updateButtonBoxesCalls;
       expect(calls.length).toEqual(1);
       expect(calls[0][0].indexOf('TextPredictionComponent')).toEqual(0);
       expect(calls[0][1].length).toEqual(2);
     });

  it('Changing predictions updates the button boxes', async () => {
    await fixture.whenStable();
    component.predictions.splice(0);
    component.predictions.push('ahoy');
    fixture.detectChanges();
    await fixture.whenStable();
    const calls = testListener.updateButtonBoxesCalls;
    expect(calls.length).toEqual(2);
    const lastCall = calls[1];
    expect(lastCall[0].indexOf('TextPredictionComponent')).toEqual(0);
    expect(lastCall[1].length).toEqual(1);
  });

  it('ngOnDestroy empties the button boxes', async () => {
    await fixture.whenStable();
    component.ngOnDestroy();
    const calls = testListener.updateButtonBoxesCalls;
    expect(calls.length).toEqual(2);
    const lastCall = calls[1];
    expect(lastCall[0].indexOf('TextPredictionComponent')).toEqual(0);
    expect(lastCall[1]).toEqual([]);
  });

  it('Clicking prediction button injects virtual key codes', async () => {
    await fixture.whenStable();
    const buttons = Array.from(
        fixture.nativeElement.querySelectorAll('.prediction-option'));
    expect(buttons.length).toEqual(2);
    const button = buttons[1] as HTMLButtonElement;
    expect(button.innerText.trim()).toEqual('Thank you!');
    button.click();
    const injectedKeysCalls = testListener.injectedKeysCalls;
    expect(injectedKeysCalls).toEqual([
      [84, 72, 65, 78, 75, 32, 89, 79, 85, 160, 49]
    ]);
  });
});
