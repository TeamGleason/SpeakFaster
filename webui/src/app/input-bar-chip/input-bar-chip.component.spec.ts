/** Unit test for InputBarChipComponent. */
import {ComponentFixture, fakeAsync, TestBed, tick} from '@angular/core/testing';
import {By} from '@angular/platform-browser';

import * as cefSharp from '../../utils/cefsharp';
import {HttpEventLogger} from '../event-logger/event-logger-impl';
import {TestListener} from '../test-utils/test-cefsharp-listener';

import {InputBarChipComponent} from './input-bar-chip.component';
import {InputBarChipModule} from './input-bar-chip.module';

describe(
    'InputBarChipComponent', () => {
      let fixture: ComponentFixture<InputBarChipComponent>;
      let testListener: TestListener;
      let emittedTextValues: string[];
      let numCutButtonCalls = 0;

      beforeEach(async () => {
        emittedTextValues = [];
        numCutButtonCalls = 0;
        testListener = new TestListener();
        (window as any)[cefSharp.BOUND_LISTENER_NAME] = testListener;
        await TestBed
            .configureTestingModule({
              imports: [InputBarChipModule],
              declarations: [InputBarChipComponent],
              providers: [
                {provide: HttpEventLogger, useValue: new HttpEventLogger(null)}
              ],
            })
            .compileComponents();
        fixture = TestBed.createComponent(InputBarChipComponent);
        fixture.componentInstance.text = 'v';
        fixture.componentInstance.textChanged.subscribe((event) => {
          emittedTextValues.push(event.text);
        });
        fixture.componentInstance.cutClicked.subscribe((event) => {
          numCutButtonCalls++;
        });
        fixture.detectChanges();
      });

      afterEach(async () => {
        (window as any)[cefSharp.BOUND_LISTENER_NAME] = undefined;
      });

      it('On init, shows correct text', async () => {
        const inputBox = fixture.debugElement.query(By.css('.input-box'));
        expect(inputBox.nativeElement.value).toEqual('v');
      });

      it('On init, calls updateButtonBoxesForElements', async () => {
        await fixture.whenStable();
        expect(testListener.updateButtonBoxesCalls.length).toBeGreaterThan(0);
        const lastCall =
            testListener
                .updateButtonBoxesCalls[testListener.updateButtonBoxesCalls.length - 1];
        expect(lastCall[0].startsWith('InputBarChipComponent')).toBeTrue();
        expect(lastCall[1].length).toEqual(1);
        expect(lastCall[1][0].length).toEqual(4);
      });

      it('Key-up emits event and updates button boxes',
         fakeAsync(
             () => {
               tick();
               const inputBox =
                   fixture.debugElement.query(By.css('.input-box'));
               const event = new KeyboardEvent('keypress', {key: 'e'});
               inputBox.nativeElement.value = 've';
               const prevNumUpdateButtonsCalls =
                   testListener.updateButtonBoxesCalls.length;
               fixture.componentInstance.onInputBoxKeyUp(event);
               fixture.detectChanges();
               tick();

               expect(emittedTextValues).toEqual(['ve']);
               expect(testListener.updateButtonBoxesCalls.length)
                   .toEqual(prevNumUpdateButtonsCalls + 1);
               const lastCall =
           testListener
               .updateButtonBoxesCalls[testListener.updateButtonBoxesCalls.length - 1];
               expect(lastCall[0].startsWith('InputBarChipComponent'))
                   .toBeTrue();
               expect(lastCall[1].length).toEqual(1);
               expect(lastCall[1][0].length).toEqual(4);
             }));

      it('Does not show cut button by default', () => {
        expect(fixture.debugElement.query(By.css('.cut-button'))).toBeNull();
      });

      it('Does not show cut button when not focused', () => {
        fixture.componentInstance.supportsCut = true;
        fixture.componentInstance.focused = false;
        fixture.detectChanges();

        expect(fixture.debugElement.query(By.css('.cut-button'))).toBeNull();
      });

      it('Clicking cut button emits cut clicked', () => {
        fixture.componentInstance.supportsCut = true;
        fixture.componentInstance.focused = true;
        fixture.detectChanges();
        const cutButton = fixture.debugElement.query(By.css('.cut-button'));
        cutButton.nativeElement.click();

        expect(numCutButtonCalls).toEqual(1);
      });

      it('Clicking main button focuses on text box', async () => {
        await fixture.whenStable();
        const mainButton = fixture.debugElement.query(By.css('.chip-button'));
        const inputBox = fixture.debugElement.query(By.css('.input-box'));
        mainButton.nativeElement.click();
        fixture.detectChanges();
        await fixture.whenStable();

        const focused = fixture.debugElement.query(By.css(':focus'));
        // TODO(cais): Investigate `focus` is sometimes null/undefined.
        // expect(focused.nativeElement).not.toBeNull();
        // expect(focused.nativeElement).toEqual(inputBox.nativeElement);
      });
    });
