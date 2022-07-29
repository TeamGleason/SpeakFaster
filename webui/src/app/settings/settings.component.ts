/** Settings component. */
import {AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, QueryList, ViewChildren} from '@angular/core';
import {getHostInfo, removeAllButtonBoxes, requestQuitApp, updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {HttpEventLogger} from '../event-logger/event-logger-impl';

import {HostInfo} from './hostinfo';
import {AppSettings, getAppSettings, setTtsSpeakingRate, setTtsVoiceType, setTtsVolume, TtsVoiceType, TtsVolume} from './settings';
import {VERSION} from './version';

@Component({
  selector: 'app-settings-component',
  templateUrl: './settings.component.html',
})
export class SettingsComponent implements AfterViewInit, OnInit, OnDestroy {
  private static readonly _NAME = 'SettingsComponent';

  private readonly instanceId = SettingsComponent._NAME + '_' + createUuid();
  appSettings: AppSettings|null = null;
  private hostInfo: HostInfo|null = null;

  @Input() userId!: string;
  @Input() userEmail!: string|null;
  @Input() userGivenName!: string|null;
  @Output()
  ttsVoiceSelectionButtonClicked: EventEmitter<Event> = new EventEmitter();
  @Output() helpButtonClicked: EventEmitter<Event> = new EventEmitter();
  @Output()
  eyeGazeSettingsButtonClicked: EventEmitter<Event> = new EventEmitter();
  @Output()
  aiSettingsButtonClicked: EventEmitter<Event> = new EventEmitter();

  constructor(
      private cdr: ChangeDetectorRef, private eventLogger: HttpEventLogger) {}

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

  ngOnInit() {
    this.refreshSettings();
    getHostInfo().then(hostInfo => {
      this.hostInfo = hostInfo;
      this.cdr.detectChanges();
      updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    });
  }

  private async refreshSettings() {
    const appSettings = await getAppSettings();
    this.appSettings = {...appSettings};
    this.cdr.detectChanges();
  }

  ngAfterViewInit() {
    updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    this.clickableButtons.changes.subscribe(
        (queryList: QueryList<ElementRef>) => {
          updateButtonBoxesForElements(this.instanceId, queryList);
        });
  }

  ngOnDestroy() {
    updateButtonBoxesToEmpty(this.instanceId);
  }

  setTtsVoiceType(ttsVoiceType: TtsVoiceType) {
    setTtsVoiceType(ttsVoiceType);
    this.eventLogger.logSettingsChange('TtsVoiceType');
    this.refreshSettings();
  }

  setTtsVolume(ttsVolume: TtsVolume) {
    setTtsVolume(ttsVolume);
    this.eventLogger.logSettingsChange('TtsVolume');
    this.refreshSettings();
  }

  setTtsSpeakingRate(ttsSpeakingRate: number) {
    setTtsSpeakingRate(ttsSpeakingRate);
    this.eventLogger.logSettingsChange('TtsSpeakingRate');
    this.refreshSettings();
  }

  onReloadAppButtonClicked(event: Event) {
    // Remove all registered gaze buttons before reloading the entire page.
    removeAllButtonBoxes();
    setTimeout(() => {
      // Force reload.
      this.windowReload();
    }, 100);
  }

  public windowReload = () => {
    window.location.reload(true);
  }

  onQuitAppButtonClicked(event: Event) {
    requestQuitApp();
  }

  onTtsVoiceSelectionButtonClicked(event: Event) {
    this.ttsVoiceSelectionButtonClicked.emit(event);
  }

  onHelpButtonClicked(event: Event) {
    this.helpButtonClicked.emit(event);
  }

  onEyeGazeSettingsButtonClicked(event: Event) {
    this.eyeGazeSettingsButtonClicked.emit(event);
  }

  onAiSettingsButtonClicked(event: Event) {
    this.aiSettingsButtonClicked.emit(event);
  }

  get versionString(): string {
    return VERSION;
  }

  get hostAppVersionString(): string|null {
    return this.hostInfo === null ? null : this.hostInfo.hostAppVersion;
  }

  get isFullLogging(): boolean {
    return HttpEventLogger.isFullLogging();
  }
}
