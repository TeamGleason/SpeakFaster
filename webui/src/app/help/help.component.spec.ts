/** Unit test for HelpComponent. */

import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';

import {HelpComponent} from './help.component';
import {HelpModule} from './help.module';

describe('HelpComponent', () => {
  let fixture: ComponentFixture<HelpComponent>;

  beforeEach(async () => {
    await TestBed
        .configureTestingModule({
          imports: [HelpModule],
          declarations: [HelpComponent],
        })
        .compileComponents();
    fixture = TestBed.createComponent(HelpComponent);
    fixture.detectChanges();
  });

  it('shows correct abbreviation length limit', async () => {
    const listItems = fixture.debugElement.queryAll(By.css('li'));

    expect(listItems[1].nativeElement.innerText).toEqual('Maximum allowed length of abbreviation: 12 characters')
  });
});
