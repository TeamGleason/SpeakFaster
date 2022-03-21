/** Unit tests for PartnerComponent. */

import {ElementRef, Injectable} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {RouterTestingModule} from '@angular/router/testing';
import {Observable, of, throwError} from 'rxjs';

import {RegisterContextResponse, SpeakFasterService} from '../speakfaster-service';

import {PartnerComponent, State} from './partner.component';
import {PartnerModule} from './partner.module';

@Injectable()
class SpeakFasterServiceForTest {
  registerContext(
      userId: string, partnerName: string, speechContent: string,
      startTimestamp?: Date,
      timezone?: string): Observable<RegisterContextResponse> {
    throw Error('This should be spied on instead of called directly.')
  }
}

describe('PartnerComopnent', () => {
  let fixture: ComponentFixture<PartnerComponent>;
  const speakFasterServiceForTest = new SpeakFasterServiceForTest();

  beforeEach(async () => {
    await TestBed
        .configureTestingModule({
          imports: [PartnerModule, RouterTestingModule],
          declarations: [PartnerComponent],
          providers: [
            {provide: SpeakFasterService, useValue: speakFasterServiceForTest}
          ],
        })
        .compileComponents();
    fixture = TestBed.createComponent(PartnerComponent);
    fixture.componentInstance.state = State.NOT_SIGNED_IN;
    fixture.detectChanges();
  });

  it('displays only sign-in button when not signed in', () => {
    fixture.componentInstance.state = State.NOT_SIGNED_IN;
    fixture.detectChanges();

    const buttonText =
        fixture.debugElement.query(By.css('.sign-in-out-button-text'));
    expect(buttonText.nativeElement.innerText).toEqual('Partner Sign-In');
    const partnerProfileSection =
        fixture.debugElement.query(By.css('.partner-profile-section'));
    expect(partnerProfileSection).toBeNull();
    const userIdsContainer =
        fixture.debugElement.query(By.css('.user-ids-container'));
    expect(userIdsContainer).toBeNull();
    const turnInputContainer =
        fixture.debugElement.query(By.css('.turn-input-container'))
    expect(turnInputContainer).toBeNull();
    const infoContainer = fixture.debugElement.query(By.css('.info-container'));
    expect(infoContainer).toBeNull();
  });

  it('displays partner profile when signed in', () => {
    fixture.componentInstance.state = State.GETTING_AAC_USER_LIST;
    fixture.detectChanges();

    const buttonText =
        fixture.debugElement.query(By.css('.sign-in-out-button-text'));
    expect(buttonText.nativeElement.innerText).toEqual('Partner Sign-Out');
    const partnerProfileSection =
        fixture.debugElement.query(By.css('.partner-profile-section'));
    expect(partnerProfileSection).not.toBeNull();
  });

  it('clicking clear button clears text', () => {
    fixture.componentInstance.state = State.READY;
    fixture.componentInstance.turnText = ' hi there.\nhow are you? ';
    fixture.detectChanges();
    const turnInput = fixture.debugElement.query(By.css('.turn-input'));
    turnInput.nativeElement.value = fixture.componentInstance.turnText;
    const clearButton =
        fixture.debugElement.query(By.css('.text-clear-button'));
    clearButton.nativeElement.click();
    fixture.detectChanges();

    expect(turnInput.nativeElement.value).toEqual('');
    expect(fixture.componentInstance.turnText).toEqual('');
  });

  it('clicking send button with empty message displays error', () => {
    fixture.componentInstance.state = State.READY;
    fixture.componentInstance.turnText = ' ';
    fixture.detectChanges();
    const turnInput = fixture.debugElement.query(By.css('.turn-input'));
    turnInput.nativeElement.value = fixture.componentInstance.turnText;
    const userIdsSelect = fixture.debugElement.query(By.css('.user-ids')) as
        ElementRef<HTMLSelectElement>;
    const optionElement = document.createElement('option') as HTMLOptionElement;
    optionElement.value = 'testuser1';
    userIdsSelect.nativeElement.appendChild(optionElement);
    userIdsSelect.nativeElement.selectedIndex = 0;
    const sendButton = fixture.debugElement.query(By.css('.text-send-button'));
    sendButton.nativeElement.click();

    const info = fixture.debugElement.query(By.css('.message-info'));
    expect(info).toBeNull();
    const error = fixture.debugElement.query(By.css('.message-error'));
    expect(error.nativeElement.innerText).toEqual('Error: Message is empty!');
    expect(turnInput.nativeElement.value).toEqual(' ');
  });

  it('clicking send button with non-empty text sends context', () => {
    fixture.componentInstance.state = State.READY;
    fixture.componentInstance.turnText = ' hi there.\nhow are you? ';
    fixture.detectChanges();
    const userIdsSelect = fixture.debugElement.query(By.css('.user-ids')) as
        ElementRef<HTMLSelectElement>;
    const optionElement = document.createElement('option') as HTMLOptionElement;
    optionElement.value = 'testuser1';
    userIdsSelect.nativeElement.appendChild(optionElement);
    userIdsSelect.nativeElement.selectedIndex = 0;
    const sendButton = fixture.debugElement.query(By.css('.text-send-button'));
    const registerContextSpy =
        spyOn(fixture.componentInstance.speakFasterService, 'registerContext');
    sendButton.nativeElement.click();
    fixture.detectChanges();

    expect(registerContextSpy)
        .toHaveBeenCalledWith('testuser1', '', 'hi there. how are you?');
    const info = fixture.debugElement.query(By.css('.message-info'));
    expect(info.nativeElement.innerText).toEqual('Sending...');
  });

  it('successful send updates textarea and info message', () => {
    fixture.componentInstance.state = State.READY;
    fixture.componentInstance.turnText = ' hi there.\nhow are you? ';
    fixture.detectChanges();
    const turnInput = fixture.debugElement.query(By.css('.turn-input'));
    turnInput.nativeElement.value = fixture.componentInstance.turnText;
    const userIdsSelect = fixture.debugElement.query(By.css('.user-ids')) as
        ElementRef<HTMLSelectElement>;
    const optionElement = document.createElement('option') as HTMLOptionElement;
    optionElement.value = 'testuser1';
    userIdsSelect.nativeElement.appendChild(optionElement);
    userIdsSelect.nativeElement.selectedIndex = 0;
    spyOn(fixture.componentInstance.speakFasterService, 'registerContext')
        .and.returnValue(of({
          result: 'SUCCESS',
          contextId: 'foobar',
        }));
    const sendButton = fixture.debugElement.query(By.css('.text-send-button'));
    sendButton.nativeElement.click();
    fixture.detectChanges();

    const info = fixture.debugElement.query(By.css('.message-info'));
    expect(info.nativeElement.innerText)
        .toEqual('Sent to testuser1: "hi there. how are you?"');
    expect(turnInput.nativeElement.value).toEqual('');
  });

  it('unsuccessful send displays error', () => {
    fixture.componentInstance.state = State.READY;
    fixture.componentInstance.turnText = ' hi there.\nhow are you? ';
    fixture.detectChanges();
    const turnInput = fixture.debugElement.query(By.css('.turn-input'));
    turnInput.nativeElement.value = fixture.componentInstance.turnText;
    const userIdsSelect = fixture.debugElement.query(By.css('.user-ids')) as
        ElementRef<HTMLSelectElement>;
    const optionElement = document.createElement('option') as HTMLOptionElement;
    optionElement.value = 'testuser1';
    userIdsSelect.nativeElement.appendChild(optionElement);
    userIdsSelect.nativeElement.selectedIndex = 0;
    spyOn(fixture.componentInstance.speakFasterService, 'registerContext')
        .and.returnValue(throwError('Error 1'));
    const sendButton = fixture.debugElement.query(By.css('.text-send-button'));
    sendButton.nativeElement.click();
    fixture.detectChanges();

    const info = fixture.debugElement.query(By.css('.message-info'));
    expect(info).toBeNull();
    const error = fixture.debugElement.query(By.css('.message-error'));
    expect(error.nativeElement.innerText)
        .toEqual('Message not sent. There was an error.');
    expect(turnInput.nativeElement.value).toEqual(' hi there.\nhow are you? ');
  });

  it('under signing-in state, shows spinner', () => {
    fixture.componentInstance.state = State.SIGNING_IN;
    fixture.detectChanges();
    const spinners =
        fixture.debugElement.queryAll(By.css('mat-progress-spinner'));
    expect(spinners.length).toEqual(1);
    const signingInMessage =
        fixture.debugElement.query(By.css('.signing-in-message'));
    expect(signingInMessage.nativeElement.innerText).toEqual('Signing in...');
    expect(fixture.debugElement.query(By.css('.user-ids-container')))
        .toBeNull();
  });
});
