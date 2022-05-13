import {HttpClientModule} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Observable, of, Subject} from 'rxjs';

import {HttpEventLogger} from '../event-logger/event-logger-impl';
import {RetrieveContextResponse, SpeakFasterService} from '../speakfaster-service';
import {setDelaysForTesting, StudyManager} from '../study/study-manager';
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
  let studyManager: StudyManager;

  beforeEach(async () => {
    studyManager = new StudyManager(null, null);
    setDelaysForTesting(10, 30);
    await TestBed
        .configureTestingModule({
          imports: [ContextModule, HttpClientModule],
          declarations: [ContextComponent],
          providers: [
            {
              provide: SpeakFasterService,
              useValue: new SpeakFasterServiceForTest()
            },
            {
              provide: StudyManager,
              useValue: studyManager,
            }
          ],
        })
        .compileComponents();
    textEntryEndSubject = new Subject();
    fixture = TestBed.createComponent(ContextComponent);
    fixture.componentInstance.disableContinuousContextRetrieval();
    fixture.componentInstance.textEntryEndSubject = textEntryEndSubject;
    fixture.componentInstance.userId = 'testuser';
    fixture.detectChanges();
  });

  afterEach(async () => {
    HttpEventLogger.setFullLogging(false);
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

  it('displays the latest three elements if there are more than three', () => {
    for (let i = 0; i < 5; ++i) {
      textEntryEndSubject.next({
        text: `Hello, #${i + 1}`,
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
        .toEqual('Hello, #3');
    expect(turnComponents[1]
               .query(By.css('.turn-content'))
               .nativeElement.innerText)
        .toEqual('Hello, #4');
    expect(turnComponents[2]
               .query(By.css('.turn-content'))
               .nativeElement.innerText)
        .toEqual('Hello, #5');
  });

  it('text entry event increments study dialog turn count', async () => {
    await studyManager.maybeHandleRemoteControlCommand('start abbrev dummy1');
    textEntryEndSubject.next({
      text: 'Shall we go to the movies today',
      timestampMillis: new Date().getTime(),
      isFinal: true,
    });

    expect(studyManager.getDialogId()).toEqual('dummy1');
    expect(studyManager.getDialogTurnIndex()).toEqual(1);
    const prevTurns = studyManager.getPreviousDialogTurns()!;
    expect(prevTurns.length).toEqual(1);
    expect(prevTurns[0].text).toEqual('Shall we go to the movies today');
    expect(prevTurns[0].partnerId).toBeNull();
    expect(prevTurns[0].timestamp).toBeGreaterThan(0);
  });
});
