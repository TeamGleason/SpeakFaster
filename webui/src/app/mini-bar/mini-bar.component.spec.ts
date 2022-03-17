/** Unit tests for MiniBarComponent. */
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';

import * as cefSharp from '../../utils/cefsharp';
import {TestListener} from '../test-utils/test-cefsharp-listener';

import {MiniBarComponent} from './mini-bar.component';
import {MiniBarModule} from './mini-bar.module';

describe('MiniBarComponent', () => {
  let fixture: ComponentFixture<MiniBarComponent>;
  let testListener: TestListener;

  beforeEach(async () => {
    testListener = new TestListener();
    (window as any)[cefSharp.BOUND_LISTENER_NAME] = testListener;
    await TestBed
        .configureTestingModule({
          imports: [MiniBarModule],
          declarations: [MiniBarComponent],
          providers: [],
        })
        .compileComponents();
    fixture = TestBed.createComponent(MiniBarComponent);
    fixture.detectChanges();
  });

  it('shows phrase text', () => {
    let eventCount = 0;
    fixture.componentInstance.appStateDeminimized.subscribe(() => {
      eventCount++;
    });
    const button = fixture.debugElement.query(By.css('.main-button'));
    button.nativeElement.click();

    expect(eventCount).toEqual(1);
  });

  it('registers button box', async () => {
    await fixture.whenStable();

    expect(testListener.updateButtonBoxesCalls.length).toBeGreaterThan(0);
    const lastCall =
        testListener
            .updateButtonBoxesCalls[testListener.updateButtonBoxesCalls.length - 1];
    expect(lastCall[0].startsWith('MiniBarComponent_')).toBeTrue();
    expect(lastCall[1].length).toEqual(1);
    expect(lastCall[1][0].length).toEqual(4);
  });

  it('deregisters button boxes on destroy', async () => {
    await fixture.whenStable();
    fixture.componentInstance.ngOnDestroy();

    const lastCall =
        testListener
            .updateButtonBoxesCalls[testListener.updateButtonBoxesCalls.length - 1];
    expect(lastCall[0].startsWith('MiniBarComponent_')).toBeTrue();
    expect(lastCall[1].length).toEqual(0);
  });
});
