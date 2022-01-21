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
`window.registerExternalKeypress()`, which has the following signature:

```typescript
function registerExternalKeypress(virualKeyCode: number): void;
```

wherein the `virtualKeyCode` argument obeys the
[Win32 Virtual Key Codes standard](https://docs.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes).
This allows the WebUI to be informed of all alphanumeric and functional keypresses.

The function `getVirtualkeyCode()` in `external-events-component.ts` can
translate strings into virtual key code values.

### 2. Keystroke injection API

The WebUI assumes that the global object `window.boundListener` exists and has
the following interface:

```typescript
interface BoundObject {
   function injectKey(virtualKeys: number[]);
}
```

The contract of the `injectKeys()` function is it will issue the keys in `virtualKeys`
programmatically in the specified order.
