/** Test cefsharp listner. */
import {AppSettings, getDefaultAppSettings, ShowGazeTracker, tryLoadSettings} from '../settings/settings';

/** Fake cefsharp listener implementation for testing. */
export class TestListener {
  private readonly buttonBoxesCalls: Array<[string, number[][]]> = [];
  private readonly injectedKeys: Array<number[]> = [];
  private readonly injectedTexts: string[] = [];
  private _numRequestSoftKeyboardResetCalls = 0;
  private readonly resizeWindowValues: Array<[number, number]> = [];
  private readonly _setEyeGazeOptionsCalls: Array<[boolean, number, number]> =
      [];

  public updateButtonBoxes(componentName: string, boxes: number[][]) {
    this.buttonBoxesCalls.push([componentName, boxes]);
  }

  get updateButtonBoxesCalls() {
    return this.buttonBoxesCalls;
  }

  public injectKeys(virtualKeys: number[], text: string) {
    this.injectedKeys.push(virtualKeys);
    this.injectedTexts.push(text);
  }

  public requestSoftKeyboardReset() {
    this._numRequestSoftKeyboardResetCalls++;
  }

  public bringWindowToForeground() {}

  get injectedKeysCalls(): Array<number[]> {
    return this.injectedKeys.slice();
  }

  get injectedTextCalls(): string[] {
    return this.injectedTexts.slice();
  }

  get numRequestSoftkeyboardResetCalls(): number {
    return this._numRequestSoftKeyboardResetCalls;
  }

  public resizeWindow(height: number, width: number) {
    this.resizeWindowValues.push([height, width]);
  }

  get resizeWindowCalls(): Array<[number, number]> {
    return this.resizeWindowValues;
  }

  public async saveSettings(appSettings: AppSettings): Promise<boolean> {
    // NOTE: This method of the test class doesn't do anything currently.
    return true;
  }

  public async loadSettings(): Promise<AppSettings|null> {
    return getDefaultAppSettings();
  }

  public setEyeGazeOptions(
      showGazeTracker: boolean, gazeFuzzyRadius: number,
      dwellDelayMillis: number) {
    this._setEyeGazeOptionsCalls.push(
        [showGazeTracker, gazeFuzzyRadius, dwellDelayMillis]);
  }

  get setEyeGazeOptionsCalls() {
    return this._setEyeGazeOptionsCalls;
  }
}
