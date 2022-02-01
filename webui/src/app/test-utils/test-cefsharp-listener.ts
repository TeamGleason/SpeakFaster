/** Test cefsharp listner. */

/** Fake cefsharp listener implementation for testing. */
export class TestListener {
  private readonly buttonBoxesCalls: Array<[string, number[][]]> = [];
  private readonly injectedKeys: Array<number[]> = [];
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

  get injectedKeysCalls() {
    return this.injectedKeys;
  }


  public resizeWindow(height: number, width: number) {
    this.resizeWindowValues.push([height, width]);
  }

  get resizeWindowCalls(): Array<[number, number]> {
    return this.resizeWindowValues;
  }
}
