/** Unit tests for AbbreviationComponent. */

import {HttpClientModule} from '@angular/common/http';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {of, Subject} from 'rxjs';

import {AbbreviationSpec, InputAbbreviationChangedEvent} from '../types/abbreviation';
import {TextEntryEndEvent} from '../types/text-entry';

import {AbbreviationComponent} from './abbreviation.component';
import {AbbreviationModule} from './abbreviation.module';

// TODO(cais): Remove fdescribe. DO NOT SUBMIT.
fdescribe('AbbreviationComponent', () => {
  let abbreviationExpansionTriggers: Subject<InputAbbreviationChangedEvent>;
  let textEntryEndSubject: Subject<TextEntryEndEvent>;
  let fixture: ComponentFixture<AbbreviationComponent>;

  beforeEach(async () => {
    await TestBed
        .configureTestingModule({
          imports: [AbbreviationModule, HttpClientModule],
          declarations: [AbbreviationComponent],
        })
        .compileComponents();
    abbreviationExpansionTriggers = new Subject();
    textEntryEndSubject = new Subject();
    fixture = TestBed.createComponent(AbbreviationComponent);
    fixture.componentInstance.abbreviationExpansionTriggers =
        abbreviationExpansionTriggers;
    fixture.componentInstance.textEntryEndSubject = textEntryEndSubject;
    fixture.detectChanges();
  });

  it('initially displays no abbreviation options', () => {
    const abbreviationOptions =
        fixture.debugElement.queryAll(By.css('.abbreviation-option'));
    expect(abbreviationOptions.length).toEqual(0);
  });

  it('sends http request on trigger', () => {
    fixture.componentInstance.contextStrings = ['hello'];
    const spy =
        spyOn(
            fixture.componentInstance.speakFasterService, 'expandAbbreviation')
            .and.returnValue(of({
              exactMatches: ['how are you', 'how about you'],
            }));
    const abbreviationSpec: AbbreviationSpec = {
      tokens: [
        {
          value: 'h',
          isKeyword: false,
        },
        {
          value: 'a',
          isKeyword: false,
        },
        {
          value: 'y',
          isKeyword: false,
        }
      ],
      readableString: 'ace',
    };
    abbreviationExpansionTriggers.next({
      abbreviationSpec,
      requestExpansion: true,
    });
    fixture.detectChanges();
    expect(spy).toHaveBeenCalledOnceWith('hello', abbreviationSpec, 128);
    expect(fixture.componentInstance.abbreviationOptions).toEqual([
      'how are you', 'how about you'
    ]);
  });

  it('displays expansion options when available', () => {
    fixture.componentInstance.abbreviationOptions =
        ['what time is it', 'we took it in'];
    fixture.detectChanges();
    const expansions =
        fixture.debugElement.queryAll(By.css('.abbreviation-expansion'));
    expect(expansions.length).toEqual(2);
    expect(expansions[0].nativeElement.innerText).toEqual('what time is it');
    expect(expansions[1].nativeElement.innerText).toEqual('we took it in');
    const selectButtons =
        fixture.debugElement.queryAll(By.css('.select-button'));
    expect(selectButtons.length).toEqual(2);
    const speakButtons = fixture.debugElement.queryAll(By.css('.speak-button'));
    expect(speakButtons.length).toEqual(2);
  });

  it('clicking select-button publishes to textEntryEndSubject', () => {
    const events: TextEntryEndEvent[] = [];
    textEntryEndSubject.subscribe(event => {
      events.push(event);
    });
    fixture.componentInstance.abbreviationOptions =
        ['what time is it', 'we took it in'];
    fixture.detectChanges();
    const selectButtons =
        fixture.debugElement.queryAll(By.css('.select-button'));
    (selectButtons[1].nativeElement as HTMLButtonElement).click();
    expect(events.length).toEqual(1);
    expect(events[0].text).toEqual('we took it in');
    expect(events[0].isFinal).toBeTrue();
    expect(events[0].timestampMillis).toBeGreaterThan(0);
  });

  // TODO(cais): Test registration of button boxes.
});
