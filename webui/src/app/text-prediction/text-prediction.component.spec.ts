/** Unit tests for TextPredictionComponent. */

import {ComponentFixture, TestBed} from '@angular/core/testing';

import {SpeakFasterService} from '../speakfaster-service';

import {TextPredictionComponent} from './text-prediction.component';
import {TextPredictionModule} from './text-prediction.module';

// TODO(cais): Remove fdescribe. DO NOT SUBMIT.
fdescribe('TextPredictionCmponent', () => {
  let fixture: ComponentFixture<TextPredictionComponent>;
  let component: TextPredictionComponent;

  beforeEach(async () => {
    await TestBed
        .configureTestingModule({
          imports: [TextPredictionModule],
          declarations: [TextPredictionComponent, SpeakFasterService],
        })
        .compileComponents();
    fixture = TestBed.createComponent(TextPredictionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    jasmine.getEnv().allowRespy(true);
  });

  it('Initial prediction buttons invoke updateButtonBoxesForElements',
     () => {

     });
});
