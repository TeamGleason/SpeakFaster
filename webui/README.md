# SpeakFaster Web UI

The Web UI is designed to be a plugin to the
[Talk37](https://github.com/TeamGleason/Talk37) on-screen eye-gaze keyboard.

It is written in the [Angular framework](https://angular.io/)

## Developer workflow

### Getting started

1. Install node 14+ (e.g., 20.10.0). See https://nodejs.org/en/download/
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

If you see an error of the code `ERR_OSSL_EVP_UNSUPPORTED` while running
`ng serve`, you can get past it by setting the environment variable
`NODE_OPTIONS=--openssl-legacy-provider`.

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

## WebUI URL parameters

The WebUI can operate under two different modes:

1. AAC user mode, this is the default mode that serves an AAC user
2. Partner (companion) mode, this is the mode that should
   be used by a conversation partner of the the AAC user

The set of required URL parameters vary between the two modes.

### 1. AAC user mode

Under the AAC user mode, the following URL parameters must be provided:

1. `access_token`: This is the Google OAuth2 access token that can be provided
   by a native layer (e.g., C# .NET) that manages the user sign-in and refresh token
   logic. See https://github.com/googlesamples/oauth-apps-for-windows for
   examples.
2. `user_given_name`: This is the given name of the user. It can be obtained
   during Google OAuth2 authentication with a proper scope and provided to
   the WebUI.
3. `user_id`: The integer user ID from Google OAuth2.
4. `user_email`: The email address the user used to sign in, obtained from
   Google OAuth2.
5. `endpoint`: This is the URL to the API endpoint that serves features such as
   abbreviation expansion and text prediction.
6. `dev`: This boolean URL parameter controls whether developer-oriented features
   are shown (e.g., `dev=true` or `dev=1`). Default value: `false`.

Optional URL parameters include:

- `showMetrics`: Controls whether text-entry metrics such as words-per minute
  (WPM) and keystroke-saving rate (KSR) are visible in the UI. Default: false.

### 2. Partner (companion) mode

The partner mode can be activated with the URL parameter:

```
partner=1
```

Under the partner mode, the same `endpoint` URL parameter as described above is
required.

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
function externalKeypressHook(virualKeyCode: number, isExternal: boolean): void;
```

wherein the `virtualKeyCode` argument obeys the
[Win32 Virtual Key Codes standard](https://docs.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes).
This allows the WebUI to be informed of all alphanumeric and functional keypresses.

The function `getVirtualkeyCode()` in `external-events-component.ts` can
translate strings into virtual key code values.

### 2. Listening for the foreground (activated) state of the host window

The global function `window.setHostWindowFocus(isFocused: boolean)` provides the
WebUI with the foreground (activated) state of the host window.

### 3. Listening for eye tracker device status

The global function `window.eyeTrackerStatusHook(status: 'disconnected'|'connected')`
provides the WebUI with updates when the eye tracking device is disconnected or
reconnected.

### 4. Bound listner for WebUI-to-host information flow

The WebUI looks for the global `window.boundListener` object and expects
it to have the following interface.

```typescript
interface BoundObject {
  function injectKeys(virtualKeys: number[], text: string): void;

  function requestSoftkeyboardRest(): number;

  function resizeWindow(height: number, width: number);

  function updateButtonBoxes(componentName: string,
                             boxes: Array<[number, number, number, number]>);

  async function bringWindowToForeground();

  async function bringFocusAppToForeground();

  async function toggleGazeButtonsState(): boolean;

  async function setEyeGazeOptions(
      showGazeTracker: boolean, gazeFuzzyRadius: number, dwellDelayMillis: number);

  async function saveSettings(appSettings: AppSettings): boolean;

  async function loadSettings(): AppSettings|null;

  async function getHostInfo(): string;

  function requestAppQuit(): void;
}
```

The three interface methods, `injectKeys()`, `updateButtonBoxes()`, and
`resizeWindow()` allow the WebUI to send different types of information to the
host. Below we describe their use respectively.

#### 3.1. Keystroke injection API

The contract of the `injectKeys()` function is it will issue the keys in `virtualKeys`
programmatically in the specified order.

#### 3.2. Request external soft keyboard to reset state

Occasionally the WebUI needs to request a state reset in the soft keyboard
attached to the host application. For example, when the user starts to spell
a word out after an initial abbreviation-expansion request, such a reset will
allow the user to utilize the external keyboard's word prediction without
its state being confounded by the previously typed abbreviation, which is
usually not a valid word. This can be achieved by using the method
`requestSoftkeybardRest()`.

#### 3.3 Window resizing

The contract of the `resizedWindow()` function is that it will request the host
app to resize the window that contains the WebView to the specified height and
width.

### 3.4. Registeration of gaze-clickable areas

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

### 3.5. Setting eye-gaze tracking options in host app

The `toggleGazeButtonsState()` interface method allows the WebUI to temporarily
pause the gaze buttons and subsequently resume them. The boolean return value
indicates the new enabled state after the function call.

The `setEyeGazeOptions()` interface method allows the WebUI to request
changes in the host app's eye tracking parameters. The settable parameters
include:

1. `showGazeTracker`: whether a UI object such as a dot is shown on the
   screen to indicate the current gaze point of the user.
2. `gazeFuzzyRadius`: the radius of the virtual circle around the gaze point
   that is used to determine whether any of the gaze-clickable buttons are
   hit.
3. `dwellDelayMillis`: the dwell time for gaze clicking, in milliseconds.

### 3.6. Saving WebUI user settings to host and loading the settings from host

The functions `saveSettings()` and `loadSettings()` can be used to serialized
user settings (e.g., TTS voice and volume) to the host and loading the settings
back from the host. Note that WebViews such as CefSharp usually do not persist
data stored in `localStorage` after the instance of WebView is destroyed, which
necessitates settings storage at the host level.

### 3.7 Request info about the host

The function `getHostInfo()` can be called by the WebUI to retrieve
information about the host app and the environment it is running in.

### 3.8. Requesting app quit

To request the host app to close the WebUI and quit as a whole, call
`requestAppQuit()`.

### 3.9. Requesting putting the app or a focus app in foreground

The two functions `bringWindowToForeground()` and `bringFocusAppToForeground()`
can be used to request the host app to bring the app itself or a focus app
(e.g., a text editor) to the foreground, respectively.
