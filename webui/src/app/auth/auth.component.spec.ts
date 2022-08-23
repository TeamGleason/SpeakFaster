import {Injectable} from '@angular/core';
import {ComponentFixture, fakeAsync, TestBed, tick} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {ActivatedRoute} from '@angular/router';
import {RouterTestingModule} from '@angular/router/testing';
import {BehaviorSubject, of} from 'rxjs';

import {AuthComponent} from './auth.component';
import {AuthModule} from './auth.module';

@Injectable()
class ActivatedRouteForTest {
  private subject = new BehaviorSubject(this.testParams);
  params = this.subject.asObservable();

  private _testParams: {} = {};

  get queryParams() {
    return this.subject.asObservable();
  }

  set testParams(params: {}) {
    this._testParams = params;
    this.subject.next(params);
  }
}

describe('AuthComponent', () => {
  let fixture: ComponentFixture<AuthComponent>;
  let component: AuthComponent;
  let compiled: HTMLElement;
  let mockActivatedRoute: ActivatedRouteForTest;

  beforeEach(() => {
    mockActivatedRoute = new ActivatedRouteForTest();
    TestBed.configureTestingModule({
      imports: [RouterTestingModule, AuthModule],
      declarations: [AuthComponent],
      providers: [{provide: ActivatedRoute, useValue: mockActivatedRoute}]
    });
    fixture = TestBed.createComponent(AuthComponent);
    component = fixture.componentInstance;
    compiled = fixture.nativeElement as HTMLElement;
  });

  it('should show authentication button initially', () => {
    fixture.detectChanges();
    const buttons = compiled.querySelectorAll('button');
    expect(buttons.length).toEqual(1);
  });

  it('should hide auth-instructions and authentication-success initially',
     () => {
       fixture.detectChanges();
       expect(compiled.querySelectorAll('.auth-instructions').length)
           .toEqual(0);
       expect(compiled.querySelectorAll('.auth-success').length).toEqual(0);
     });

  it('clicking authenticate button without client_id leads to error snackbar',
     () => {
       fixture.detectChanges();
       const spy = spyOn(component, 'showSnackBar').and.callThrough();
       const button = fixture.debugElement.query(By.css('#authenticate'));
       button.triggerEventHandler('click', null);
       expect(spy).toHaveBeenCalledWith(
           'Cannot authenticate. Missing client ID.', 'error');
     });

  it('clicking authenticate button without client_secret does not call error snackbar',
     () => {
       mockActivatedRoute.testParams = {
         client_id: 'foo_client_id',
         // Notice missing client_secret.
       };
       fixture.detectChanges();
       const spy = spyOn(component, 'showSnackBar').and.callThrough();
       const button = fixture.debugElement.query(By.css('#authenticate'));
       button.triggerEventHandler('click', null);
       expect(spy).not.toHaveBeenCalled();
     });

  it('clicking authenticate button should call device code route and display url and user code',
     () => {
       mockActivatedRoute.testParams = {
         client_id: 'foo_client_id',
         client_secret: 'bar_client_secret'
       };
       fixture.detectChanges();
       const spy =
           spyOn(component.authService, 'getDeviceCode').and.returnValue(of({
             user_code: 'test_user_code',
             verification_url: 'https://www.google.com/device',
             interval: 5,
             device_code: 'test_device_Code',
           }));
       const button = fixture.debugElement.query(By.css('#authenticate'));
       button.triggerEventHandler('click', null);
       fixture.detectChanges();

       expect(spy).toHaveBeenCalledWith('foo_client_id');
       fixture.detectChanges();
       const anchor = fixture.debugElement.query(By.css('#verification-url'))
                          .nativeElement as HTMLAnchorElement;
       expect(anchor.href).toEqual('https://www.google.com/device');
       expect(anchor.innerText).toEqual('https://www.google.com/device');
     });

  it('poll token success hides info and displays auth success', done => {
    mockActivatedRoute.testParams = {
      client_id: 'foo_client_id',
      client_secret: 'bar_client_secret'
    };
    fixture.detectChanges();
    const interval = 0.1;
    let seenAccessToken = '';
    component.newAccessToken.subscribe(accessToken => {
      seenAccessToken = accessToken;
    });
    spyOn(component.authService, 'getDeviceCode').and.returnValue(of({
      user_code: 'test_user_code',
      verification_url: 'https://www.google.com/device',
      interval,
      device_code: 'test_device_Code',
    }));
    spyOn(component.authService, 'pollForAccessToken').and.returnValue(of({
      access_token: 'test_access_token',
      refresh_token: 'test_refresh_token',
    }));
    const button = fixture.debugElement.query(By.css('#authenticate'));
    button.triggerEventHandler('click', null);
    fixture.detectChanges();

    setTimeout(() => {
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('.auth-instruction')))
          .toBeNull();
      const authSuccess =
          fixture.debugElement.query(By.css('.auth-success')).nativeElement as
          HTMLDivElement;
      expect(authSuccess.innerText).toEqual('Authenticated!');
      expect(seenAccessToken).toEqual('test_access_token');
      done();
    }, interval * 1e3);
  });

  it('including access_token parameter in route fires newAccessToken', () => {
    const seenAccessTokens: string[] = [];
    component.newAccessToken.subscribe(accessToken => {
      seenAccessTokens.push(accessToken);
      component.stopRefreshTokenForTest();
    });
    mockActivatedRoute.testParams = {access_token: 'foo-access-token'};
    fixture.detectChanges();

    expect(seenAccessTokens).toEqual(['foo-access-token']);
  });
});
