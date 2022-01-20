import {Injectable} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Observable, of, Subject} from 'rxjs';

import {RetrieveContextResponse, SpeakFasterService} from '../speakfaster-service';
import {TextEntryEndEvent} from '../types/text-entry';

import {ContextComponent} from './context.component';
import {ContextModule} from './context.module';

@Injectable()
class SpeakFasterServiceForTest {
  retrieveContext(userId: string): Observable<RetrieveContextResponse> {
    return of({
      result: 'SUCCESS',
      contextSignals: [],
    });
  }
}

describe('ContextComponent', () => {
  let fixture: ComponentFixture<ContextComponent>;
  let textEntryEndSubject: Subject<TextEntryEndEvent>;

  beforeEach(async () => {
    await TestBed
        .configureTestingModule({
          imports: [ContextModule],
          declarations: [ContextComponent],
          providers: [{
            provide: SpeakFasterService,
            useValue: new SpeakFasterServiceForTest()
          }],
        })
        .compileComponents();
    textEntryEndSubject = new Subject();
    fixture = TestBed.createComponent(ContextComponent);
    fixture.componentInstance.disableContinuousContextRetrieval();
    fixture.componentInstance.textEntryEndSubject = textEntryEndSubject;
    fixture.detectChanges();
  });

  it('displays empty context signals when there is none', () => {
    const turnComponents = fixture.debugElement.queryAll(
        By.css('app-conversation-turn-component'));
    expect(turnComponents.length).toEqual(0);
  });

  it('displays single context signal on final text-entry-end event', () => {
    textEntryEndSubject.next({
      text: 'Hello, world',
      timestampMillis: new Date().getTime(),
      isFinal: true,
    });
    fixture.detectChanges();
    const turnComponents = fixture.debugElement.queryAll(
        By.css('app-conversation-turn-component'));
    expect(turnComponents.length).toEqual(1);
    const turnComponent = turnComponents[0];
    expect(turnComponent.query(By.css('.turn-content')).nativeElement.innerText)
        .toEqual('Hello, world');
    expect(turnComponent.query(By.css('.tts-tag'))).not.toBeNull();
  });

  it('displays no context signal if text-entry-end event is not final', () => {
    textEntryEndSubject.next({
      text: 'Hello, world',
      timestampMillis: new Date().getTime(),
      isFinal: false,
    });
    fixture.detectChanges();
    const turnComponents = fixture.debugElement.queryAll(
        By.css('app-conversation-turn-component'));
    expect(turnComponents.length).toEqual(0);
  });

  it('displays the latest four elements if there are more than four', () => {
    for (let i = 0; i < 5; ++i) {
      textEntryEndSubject.next({
        text: `Hello, #${i}`,
        timestampMillis: i * 1000,
        isFinal: true,
      });
      fixture.detectChanges();
    }
    const turnComponents = fixture.debugElement.queryAll(
        By.css('app-conversation-turn-component'));
    expect(turnComponents.length).toEqual(3);
    expect(turnComponents[0]
               .query(By.css('.turn-content'))
               .nativeElement.innerText)
        .toEqual('Hello, #2');
    expect(turnComponents[1]
               .query(By.css('.turn-content'))
               .nativeElement.innerText)
        .toEqual('Hello, #3');
    expect(turnComponents[2]
               .query(By.css('.turn-content'))
               .nativeElement.innerText)
        .toEqual('Hello, #4');
  });
});
