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
cd webuiz
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
