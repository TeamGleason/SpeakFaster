/** Test cefsharp listner. */

/** Fake cefsharp listener implementation for testing. */
export class TestListener {
  private readonly buttonBoxesCalls: Array<[string, number[][]]> = [];
  private readonly injectedKeys: Array<number[]> = [];
  private _numRequestSoftKeyboardResetCalls = 0;
  private readonly resizeWindowValues: Array<[number, number]> = [];

  public updateButtonBoxes(componentName: string, boxes: number[][]) {
    this.buttonBoxesCalls.push([componentName, boxes]);
  }

  get updateButtonBoxesCalls() {
    return this.buttonBoxesCalls;
  }

  public injectKeys(virtualKeys: number[]) {
    this.injectedKeys.push(virtualKeys);
  }

  public requestSoftKeyboardReset() {
    this._numRequestSoftKeyboardResetCalls++;
  }

  get injectedKeysCalls(): Array<number[]> {
    return this.injectedKeys.slice();
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
}
