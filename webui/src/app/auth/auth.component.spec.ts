import {Injectable} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {ActivatedRoute} from '@angular/router';
import {RouterTestingModule} from '@angular/router/testing';
import {BehaviorSubject, Observable, of} from 'rxjs';

import {AuthComponent} from './auth.component';
import {AuthModule} from './auth.module';
import {GoogleDeviceAuthService, GoogleDeviceAuthServiceStub} from './google-device-auth-service';

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

@Injectable()
class GoogleDeviceAuthServiceForTest implements GoogleDeviceAuthServiceStub {
  getDeviceCode(client_id: string) {
    console.log('getDeviceCode(): A100:', client_id);  // DEBUG
    return of({
      user_code: 'test_user_code',
      verification_url: 'https://www.google.com/device',
      interval: 5,
      device_code: 'test_device_Code',
    });
  }

  pollForAccessToken(
      client_id: string, client_secret: string, device_code: string) {
    return of({
      access_token: 'test_access_token',
      refresh_token: 'test_refresh_token',
    });  // TODO(cais): DO NOT SUBMIT.
  }

  applyRefreshToken(
      client_id: string, client_secret: string, refresh_token: string) {
    return of({
      access_token: 'test_new_access_token',
      refresh_token: 'test_refresh_token',
    });  // TODO(cais): DO NOT SUBMIT
  }
}

describe('AuthComponent', () => {
  let fixture: ComponentFixture<AuthComponent>;
  let compiled: HTMLElement;
  let mockActivatedRoute: ActivatedRouteForTest;
  let mockGoogleDeviceAuthService: GoogleDeviceAuthServiceStub;

  beforeEach(() => {
    mockActivatedRoute = new ActivatedRouteForTest();
    mockGoogleDeviceAuthService = new GoogleDeviceAuthServiceForTest();
    TestBed.configureTestingModule({
      imports: [RouterTestingModule, AuthModule],
      declarations: [AuthComponent],
      providers: [
        // {
        //   provide: GoogleDeviceAuthService,
        //   useValue: mockGoogleDeviceAuthService
        // },
        {provide: ActivatedRoute, useValue: mockActivatedRoute}
      ]
    });
    fixture = TestBed.createComponent(AuthComponent);
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

  it('clicking authenticaton button should call device code route and display url and user code',
     () => {
       mockActivatedRoute.testParams = {
         client_id: 'foo_client_id',
         client_secret: 'bar_client_secret'
       };
       fixture.detectChanges();

       const spy =
           spyOn(fixture.componentRef.instance.authService, 'getDeviceCode')
               .and.returnValue(of({
                 user_code: 'test_user_code',
                 verification_url: 'https://www.google.com/device',
                 interval: -1,
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
});
