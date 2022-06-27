/** Unit test for InputTextPredictionComponent. */

import {Injectable, SimpleChange} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Observable, of, Subject} from 'rxjs';

import * as cefSharp from '../../utils/cefsharp';
import {BOUND_LISTENER_NAME} from '../../utils/cefsharp';
import {HttpEventLogger} from '../event-logger/event-logger-impl';
import {InputBarControlEvent} from '../input-bar/input-bar.component';
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

fdescribe('InputTextPredictionComonent', () => {
  let fixture: ComponentFixture<InputTextPredictionsComponent>;
  let speakFasterServiceForTest: SpeakFasterServiceForTest =
      new SpeakFasterServiceForTest();
  let inputBarControlEvents: InputBarControlEvent[] = [];

  beforeEach(async () => {
    (window as any)[BOUND_LISTENER_NAME] = undefined;
    await TestBed
        .configureTestingModule({
          imports: [InputTextPredictionsModule],
          declarations: [InputTextPredictionsComponent],
          providers: [
            {provide: HttpEventLogger, useValue: new HttpEventLogger(null)},
            {provide: SpeakFasterService, useValue: speakFasterServiceForTest},
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


  for (const textPrefix of ['a', 'A']) {
    it('gets and shows correct word suggestions: textPrefix=' + textPrefix,
       () => {
         fixture.componentInstance.userId = 'User0';
         let spy = spyOn(speakFasterServiceForTest, 'textPrediction')
                       .and.returnValues(of({
                         outputs: ['a', 'apple', 'any'],
                       }));
         fixture.componentInstance.inputString = '';
         fixture.componentInstance.ngOnChanges(
             {inputString: new SimpleChange('', textPrefix, true)});
         fixture.detectChanges();

         expect(spy).toHaveBeenCalledOnceWith(
             {textPrefix: 'a', contextTurns: [], userId: 'User0'});
         const predictionButtons =
             fixture.debugElement.queryAll(By.css('.prediction-button'));
         expect(predictionButtons.length).toEqual(3);
         expect(predictionButtons[0].nativeElement.innerText).toEqual('a');
         expect(predictionButtons[1].nativeElement.innerText).toEqual('apple');
         expect(predictionButtons[2].nativeElement.innerText).toEqual('any');
       });
  }

  it('does not get predictions when text is empty', () => {
    fixture.componentInstance.userId = 'User0';
    fixture.componentInstance.inputString = 'a';
    let spy =
        spyOn(speakFasterServiceForTest, 'textPrediction').and.returnValues(of({
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

  it('clicking word option emits correct event for input bar', () => {
    fixture.componentInstance.userId = 'User0';
    spyOn(speakFasterServiceForTest, 'textPrediction').and.returnValues(of({
      outputs: ['a', 'apple', 'any'],
    }));
    fixture.componentInstance.inputString = '';
    fixture.componentInstance.ngOnChanges(
        {inputString: new SimpleChange('', 'a', true)});
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

      const expandButton = fixture.debugElement.query(By.css('.expand-button'));
      expect(expandButton).not.toBeNull();
      expect(expandButton.nativeElement.classList.contains('invisible'))
          .toEqual(!showExpandButton);
    });
  }

  for (const showSpellButton of [true, false]) {
    it('shows spell button: show flag=' + showSpellButton, () => {
      fixture.componentInstance.showSpellButton = showSpellButton;
      fixture.detectChanges();

      const spellButton = fixture.debugElement.query(By.css('.spell-button'));
      expect(spellButton).not.toBeNull();
      expect(spellButton.nativeElement.classList.contains('invisible'))
          .toEqual(!showSpellButton);
    });
  }

  for (const showAbortButton of [true, false]) {
    it('shows abort button: show flag=' + showAbortButton, () => {
      fixture.componentInstance.showAbortButton = showAbortButton;
      fixture.detectChanges();

      const abortButton = fixture.debugElement.query(By.css('.abort-button'));
      expect(abortButton).not.toBeNull();
      expect(abortButton.nativeElement.classList.contains('invisible'))
          .toEqual(!showAbortButton);
    });
  }
});
