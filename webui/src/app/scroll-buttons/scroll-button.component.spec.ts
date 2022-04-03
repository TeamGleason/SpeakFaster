/** Unit tests for ScrollButtonsComponent. */
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';

import * as cefSharp from '../../utils/cefsharp';
import {ScrollButtonsComponent} from '../scroll-buttons/scroll-button.component';
import {TestListener} from '../test-utils/test-cefsharp-listener';

import {ScrollButtonsModule} from './scroll-buttons.modue';

describe('ScrollButtonsComponent', () => {
  let fixture: ComponentFixture<ScrollButtonsComponent>;
  let targetDiv: HTMLDivElement;
  let testListener: TestListener;
  let emittedScrollEvents: Array<{direction: 'up' | 'down'}>;

  beforeEach(async () => {
    testListener = new TestListener();
    emittedScrollEvents = [];
    (window as any)[cefSharp.BOUND_LISTENER_NAME] = testListener;
    await TestBed
        .configureTestingModule({
          imports: [ScrollButtonsModule],
          declarations: [ScrollButtonsComponent],
          providers: [],
        })
        .compileComponents();
    fixture = TestBed.createComponent(ScrollButtonsComponent);
    fixture.componentInstance.scrollStepPx = 2;
    fixture.componentInstance.scrollButtonClicked.subscribe(event => {
      emittedScrollEvents.push(event);
    });
    fixture.detectChanges();
  });

  afterEach(async () => {
    if (targetDiv) {
      targetDiv.parentElement?.removeChild(targetDiv);
    }
  });

  function createTargetDiv(innerText: string, height: number) {
    targetDiv = document.createElement('div');
    targetDiv.innerText = innerText;
    targetDiv.style.height = `${height}px`;
    targetDiv.style.maxHeight = `${height}px`;
    targetDiv.style.overflowY = `hidden`;
    document.body.appendChild(targetDiv);
    fixture.componentInstance.scrollTarget = targetDiv;
    fixture.detectChanges();
  }

  it('shows scroll buttons when overflow happens', async () => {
    createTargetDiv('foo\bar', 10);
    const scrollButtons =
        fixture.debugElement.queryAll(By.css('.scroll-button'));
    expect(scrollButtons.length).toEqual(2);

    expect(targetDiv.scrollTop).toEqual(0);
  });

  it('does not show scroll buttons when there is no overflow', async () => {
    createTargetDiv('foo\bar', 100);
    const scrollButtons =
        fixture.debugElement.queryAll(By.css('.scroll-button'));

    expect(scrollButtons.length).toEqual(0);
  });

  it('clicking scroll down button updates scrollTop', () => {
    createTargetDiv('foo\bar', 10);
    const scrollButtons =
        fixture.debugElement.queryAll(By.css('.scroll-button'));
    scrollButtons[1].nativeElement.click();

    expect(targetDiv.scrollTop).toEqual(2);
    expect(emittedScrollEvents).toEqual([{direction: 'down'}]);
  });

  it('clicking scroll down then scroll up', () => {
    createTargetDiv('foo\bar', 10);
    const scrollButtons =
        fixture.debugElement.queryAll(By.css('.scroll-button'));
    scrollButtons[1].nativeElement.click();
    scrollButtons[0].nativeElement.click();

    expect(targetDiv.scrollTop).toEqual(0);
    expect(emittedScrollEvents).toEqual([
      {direction: 'down'}, {direction: 'up'}
    ]);
  });

  it('clicking scroll up initially has no effect', () => {
    createTargetDiv('foo\bar', 10);
    const scrollButtons =
        fixture.debugElement.queryAll(By.css('.scroll-button'));
    scrollButtons[0].nativeElement.click();

    expect(targetDiv.scrollTop).toEqual(0);
    expect(emittedScrollEvents).toEqual([{direction: 'up'}]);
  });

  it('initially, scroll-up button is disabled, scroll-down button enabled',
     () => {
       createTargetDiv('foo\bar', 10);
       const scrollButtons =
           fixture.debugElement.queryAll(By.css('.scroll-button'));
       const upButtonImage = scrollButtons[0].query(By.css('.button-image'));
       expect(upButtonImage.nativeElement.src)
           .toMatch('.*\/arrow_up_disabled.png');
       const downButtonImage = scrollButtons[1].query(By.css('.button-image'));
       expect(downButtonImage.nativeElement.src).toMatch('.*\/arrow_down.png');
     });

  it('when scrolled to the bottom, scroll-up button is enabled, scroll-down button disabled',
     () => {
       createTargetDiv('foo\bar', 10);
       const scrollButtons =
           fixture.debugElement.queryAll(By.css('.scroll-button'));
       for (let i = 0; i < 5; ++i) {
         scrollButtons[1].nativeElement.click();
       }
       fixture.detectChanges();

       expect(scrollButtons.length).toEqual(2);
       const upButtonImage = scrollButtons[0].query(By.css('.button-image'));
       expect(upButtonImage.nativeElement.src).toMatch('.*\/arrow_up.png');
       const downButtonImage = scrollButtons[1].query(By.css('.button-image'));
       expect(downButtonImage.nativeElement.src)
           .toMatch('.*\/arrow_down_disabled.png');
     });
});
