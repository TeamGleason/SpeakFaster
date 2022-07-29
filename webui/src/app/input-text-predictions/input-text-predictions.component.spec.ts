/** Unit test for InputTextPredictionComponent. */

import {Injectable, SimpleChange} from '@angular/core';
import {ComponentFixture, fakeAsync, TestBed, tick} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Observable, of, Subject} from 'rxjs';

import {BOUND_LISTENER_NAME} from '../../utils/cefsharp';
import {HttpEventLogger} from '../event-logger/event-logger-impl';
import {InputBarControlEvent} from '../input-bar/input-bar.component';
import {clearSettings, setNumWordSuggestions} from '../settings/settings';
import {SpeakFasterService, TextPredictionRequest, TextPredictionResponse} from '../speakfaster-service';
import {TestListener} from '../test-utils/test-cefsharp-listener';

import {InputTextPredictionsComponent} from './input-text-predictions.component';
import {InputTextPredictionsModule} from './input-text-predictions.module';

@Injectable()
class SpeakFasterServiceForTest {
  textPrediction(textPredictionRequest: TextPredictionRequest):
      Observable<TextPredictionResponse> {
    return of({outputs: []})
  }
}

describe(
    'InputTextPredictionComonent', () => {
      let fixture: ComponentFixture<InputTextPredictionsComponent>;
      let testListener: TestListener = new TestListener();
      let speakFasterServiceForTest: SpeakFasterServiceForTest =
          new SpeakFasterServiceForTest();
      let inputBarControlEvents: InputBarControlEvent[] = [];

      beforeEach(async () => {
        (window as any)[BOUND_LISTENER_NAME] = testListener;
        await TestBed
            .configureTestingModule({
              imports: [InputTextPredictionsModule],
              declarations: [InputTextPredictionsComponent],
              providers: [
                {provide: HttpEventLogger, useValue: new HttpEventLogger(null)},
                {
                  provide: SpeakFasterService,
                  useValue: speakFasterServiceForTest
                },
              ],
            })
            .compileComponents();
        fixture = TestBed.createComponent(InputTextPredictionsComponent);
        fixture.componentInstance.inputBarControlSubject = new Subject();
        fixture.componentInstance.inputBarControlSubject.subscribe(
            (event: InputBarControlEvent) => {
              inputBarControlEvents.push(event);
            });
        fixture.detectChanges();
      });

      afterEach(async () => {
        (window as any)[BOUND_LISTENER_NAME] = undefined;
        clearSettings();
      });

      for (const [textPrefix, predCallTextPrefix] of [
               ['a', 'a'],
               ['A', 'a'],
               ['a,', 'a, '],
               ['a,a', 'a, a'],
               ['a, a', 'a, a'],
               ['a,a a,', 'a,a a, '],
      ]) {
        it('gets and shows correct word suggestions: textPrefix=' + textPrefix,
           async () => {
             fixture.componentInstance.userId = 'User0';
             let spy = spyOn(speakFasterServiceForTest, 'textPrediction')
                           .and.returnValues(of({
                             outputs: ['a', 'apple', 'any'],
                           }));
             fixture.componentInstance.inputString = 'a';
             fixture.componentInstance.ngOnChanges(
                 {inputString: new SimpleChange('', textPrefix, true)});
             await fixture.whenStable();
             fixture.detectChanges();

             expect(spy).toHaveBeenCalledOnceWith({
               textPrefix: predCallTextPrefix,
               contextTurns: [],
               userId: 'User0'
             });
             const predictionButtons =
                 fixture.debugElement.queryAll(By.css('.prediction-button'));
             expect(predictionButtons.length).toEqual(3);
             expect(predictionButtons[0].nativeElement.innerText).toEqual('a');
             expect(predictionButtons[1].nativeElement.innerText)
                 .toEqual('apple');
             expect(predictionButtons[2].nativeElement.innerText)
                 .toEqual('any');
           });
      }

      it('obeys numWordSugestions in settings', async () => {
        await setNumWordSuggestions(2);
        fixture.componentInstance.userId = 'User0';
        let spy = spyOn(speakFasterServiceForTest, 'textPrediction')
                      .and.returnValues(of({
                        outputs: ['a', 'apple', 'any'],
                      }));
        fixture.componentInstance.inputString = 'a';
        fixture.componentInstance.ngOnChanges(
            {inputString: new SimpleChange('', 'a', true)});
        await fixture.whenStable();
        fixture.detectChanges();

        const predictionButtons =
            fixture.debugElement.queryAll(By.css('.prediction-button'));
        expect(predictionButtons.length).toEqual(2);
        expect(predictionButtons[0].nativeElement.innerText).toEqual('a');
        expect(predictionButtons[1].nativeElement.innerText).toEqual('apple');
      });

      it('does not display suggestion when input string is empty', () => {
        fixture.componentInstance.userId = 'User0';
        let spy = spyOn(speakFasterServiceForTest, 'textPrediction')
                      .and.returnValues(of({
                        outputs: ['a', 'apple', 'any'],
                      }));
        fixture.componentInstance.inputString = '';
        const textPrefix = 'a';
        fixture.componentInstance.ngOnChanges(
            {inputString: new SimpleChange('', textPrefix, true)});
        fixture.detectChanges();

        const predictionButtons =
            fixture.debugElement.queryAll(By.css('.prediction-button'));
        expect(predictionButtons.length).toEqual(0);
      });

      it('does not get predictions when text is empty', () => {
        fixture.componentInstance.userId = 'User0';
        fixture.componentInstance.inputString = 'a';
        let spy = spyOn(speakFasterServiceForTest, 'textPrediction')
                      .and.returnValues(of({
                        outputs: ['a', 'apple', 'any'],
                      }));
        fixture.componentInstance.ngOnChanges(
            {inputString: new SimpleChange('a', '', false)});
        fixture.detectChanges();

        expect(spy).not.toHaveBeenCalled();
        const predictionButtons =
            fixture.debugElement.queryAll(By.css('.prediction-button'));
        expect(predictionButtons.length).toEqual(0);
      });

      it('clicking word option emits correct event for input bar', async () => {
        fixture.componentInstance.userId = 'User0';
        spyOn(speakFasterServiceForTest, 'textPrediction').and.returnValues(of({
          outputs: ['a', 'apple', 'any'],
        }));
        fixture.componentInstance.inputString = 'a';
        fixture.componentInstance.ngOnChanges(
            {inputString: new SimpleChange('', 'a', true)});
        await fixture.whenStable();
        fixture.detectChanges();

        const predictionButtons =
            fixture.debugElement.queryAll(By.css('.prediction-button'));
        expect(predictionButtons.length).toEqual(3);
        predictionButtons[2].nativeElement.click();
        expect(inputBarControlEvents.length).toEqual(1);
        expect(inputBarControlEvents[0]).toEqual({suggestionSelection: 'any '});
      });

      for (const showExpandButton of [true, false]) {
        it('shows expand button: show flag=' + showExpandButton, () => {
          fixture.componentInstance.showExpandButton = showExpandButton;
          fixture.detectChanges();

          const expandButton =
              fixture.debugElement.query(By.css('.expand-button'));
          expect(expandButton).not.toBeNull();
          expect(expandButton.nativeElement.classList.contains('invisible'))
              .toEqual(!showExpandButton);
        });
      }

      for (const showSpellButton of [true, false]) {
        it('shows spell button: show flag=' + showSpellButton, () => {
          fixture.componentInstance.showSpellButton = showSpellButton;
          fixture.detectChanges();

          const spellButton =
              fixture.debugElement.query(By.css('.spell-button'));
          expect(spellButton).not.toBeNull();
          expect(spellButton.nativeElement.classList.contains('invisible'))
              .toEqual(!showSpellButton);
        });
      }

      for (const showAbortButton of [true, false]) {
        it('shows abort button: show flag=' + showAbortButton, () => {
          fixture.componentInstance.showAbortButton = showAbortButton;
          fixture.detectChanges();

          const abortButton =
              fixture.debugElement.query(By.css('.abort-button'));
          expect(abortButton).not.toBeNull();
          expect(abortButton.nativeElement.classList.contains('invisible'))
              .toEqual(!showAbortButton);
        });
      }

      it('updateButtonBox: 1 button',
         fakeAsync(
             () => {
               fixture.componentInstance.showExpandButton = false;
               fixture.componentInstance.showSpellButton = false;
               fixture.componentInstance.showAbortButton = true;
               fixture.detectChanges();
               fixture.componentInstance.ngAfterViewInit();
               tick();

               const lastCall =
              testListener.updateButtonBoxesCalls[testListener.updateButtonBoxesCalls.length
              - 1];
               expect(lastCall[0].startsWith('InputTextPredictionsComponent_'))
                   .toBeTrue();
               expect(lastCall[1].length).toEqual(1);
               expect(lastCall[1][0].length).toEqual(4);
             }));

      it('updateButtonBox: 2 + 2 buttons: long-dwell value',
         fakeAsync(
             () => {
               fixture.componentInstance.showExpandButton = false;
               fixture.componentInstance.showSpellButton = true;
               fixture.componentInstance.showAbortButton = true;
               (fixture.componentInstance as any)._predictions =
                   ['hi', 'hello'];
               // 2 buttons are fixed (spell and abort); another 2 buttons are
               // dynamic word predictions (long dwell).
               fixture.detectChanges();
               fixture.componentInstance.ngAfterViewInit();
               tick();

               const lastCall =
                  testListener.updateButtonBoxesCalls[testListener.updateButtonBoxesCalls.length
                  - 1];
               expect(lastCall[0].startsWith('InputTextPredictionsComponent_'))
                   .toBeTrue();
               expect(lastCall[1].length).toEqual(4);
               // The long-dwell word predicton buttons are called with
               // length-5 number arrays. The last element of each array is
               // the custom threshold duration in milliseconds.
               expect(lastCall[1][0].length).toEqual(5);
               expect(lastCall[1][0][4]).toEqual(400);
               expect(lastCall[1][1].length).toEqual(5);
               expect(lastCall[1][1][4]).toEqual(400);
               // The remaining buttons are not long-dwell. So they have the
               // usual length-4 arrays as the call args.
               expect(lastCall[1][2].length).toEqual(4);
               expect(lastCall[1][3].length).toEqual(4);
             }));
    });
