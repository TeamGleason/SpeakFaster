# SpeakFaster Web UI

The Web UI is designed to be a plugin to the
[Talk37](https://github.com/TeamGleason/Talk37) on-screen eye-gaze keyboard.

It is written in the [Angular framework](https://angular.io/)

## Developer workflow

### Getting started

1. Install node 14+. See https://nodejs.org/en/download/
2. Add node and npm to your path.
3. Install the Angular CLI: `npm instal -g @angular/cli`
   - Make sure that the Angular CLI binary (`ng`) available on your path.

It is recommended to use VSCode as the code editor for this project.

### Serving app locally

```sh
cd webui
npm install
ng serve
```

Then open your browser and navigate to

http://localhost:4200/?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&endpoint=${SPEAKFASTER_ENDPOINT}

where `CLIENT_ID` and `CLIENT_SECRET` are the Google OAuth2 credentials, and
`SPEAKFASTER_ENDPOINT` is the HTTPS endpoint for the SpeakFaster server.

### Running unit tests

```sh
ng test
```

### Running lint

```sh
ng lint
```

### Auto-formatting TypeScript code.

In VSCode, you can auto format the .ts file by using the shortcut key
`Ctrl + Shift + I` (or the equivalent shortcut key on operatings systems
other than Linux).

## Interface between WebUI and hosting app

The API between the JavaScript/TypeScript code in the WebUI and the hosting Windows
app allows the WebUI to listen to keystrokes outside the WebUI (e.g., in Balabolka)
and to inject keystrokes programmatically into the external applications. It is
also an abstraction that allows the WebUI to potentiall talk to a different hosting
environment (e.g., a container web app).

### 1. Keystroke listening API

The WebUI provides a function attached to the global `window` object, namely
`window.externalKeypressHook()`, which has the following signature:

```typescript
function externalKeypressHook(virualKeyCode: number): void;
```

wherein the `virtualKeyCode` argument obeys the
[Win32 Virtual Key Codes standard](https://docs.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes).
This allows the WebUI to be informed of all alphanumeric and functional keypresses.

The function `getVirtualkeyCode()` in `external-events-component.ts` can
translate strings into virtual key code values.

### 2. Bound listner for WebUI-to-host information flow

The WebUI looks for the global `window.boundListener` object and expects
it to have the following interface.

```typescript
interface BoundObject {
  function injectKey(virtualKeys: number[]): void;

  function resizeWindow(height: number, width: number);

  function updateButtonBoxes(componentName: string,
                             boxes: Array<[number, number, number, number]>);


}
```

The three interface methods, `injectKey()`, `updateButtonBoxes()`, and
`resizeWindow()` allow the WebUI to send different types of information to the
host. Below we describe their use respectively.

#### 2.1. Keystroke injection API

The contract of the `injectKeys()` function is it will issue the keys in `virtualKeys`
programmatically in the specified order.

#### 2.2. Window resizing

The contract of the `resizedWindow()` function is that it will request the host
app to resize the window that contains the WebView to the specified height and
width.

### 2.3. Registeration of gaze-clickable areas

The WebUI is meant to be used with an eye tracker. The hosting app provides
two methods in the `window.boundListener` object to allow the WebUI to register
and update its clickable regions such as buttons.

As mentioed above, the `updateButtonBoxes()` method has the following signature:

```typescript
function updateButtonBoxes(
  componentName: string,
  boxes: Array<[number, number, number, number]>
);
```

The argument `componentName` specifies the (Agnular) component that the
clickable regions belong to. The argument `boxes` contain the
`[left, top, right, bottom]` coordinates of all clickable regions that belong
to the component. The host app keeps track of the coordinates, so that
repeated calls to `updateButtonBoxes()` with the same component name will erase
clickable regions that have disappeared since the last call and create
new clickable regions that have appeared since the last call.
Calling `updateButtonBoxes()` n times with n different `componentName`s will
cause n sets of clickable regions to be registered.

