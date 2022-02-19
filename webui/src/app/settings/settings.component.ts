/** Quick phrase list for direct selection. */
import {AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, OnInit, QueryList, ViewChildren} from '@angular/core';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {AppSettings, getAppSettings, setTtsVoiceType, setTtsVolume, TtsVoiceType, TtsVolume, updateSettings} from './settings';
import {VERSION} from './version';

@Component({
  selector: 'app-settings-component',
  templateUrl: './settings.component.html',
})
export class SettingsComponent implements AfterViewInit, OnInit, OnDestroy {
  private static readonly _NAME = 'SettingsComponent';
  private static readonly LOCAL_STORAGE_ITEM_NAME =
      `GoogleSpeakFasterWebUiSettings.json`;

  private readonly instanceId = SettingsComponent._NAME + '_' + createUuid();

  @Input() userId!: string;

  constructor(private cdr: ChangeDetectorRef) {}

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

  ngOnInit() {
    const loadedSettings = this.loadSettings();
    if (loadedSettings !== null) {
      updateSettings(loadedSettings)
    }
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

  get appSettings(): AppSettings {
    return getAppSettings();
  }

  setTtsVoiceType(ttsVoiceType: TtsVoiceType) {
    setTtsVoiceType(ttsVoiceType);
    this.saveSettings();
    this.cdr.detectChanges();
  }

  setTtsVolume(ttsVolume: TtsVolume) {
    setTtsVolume(ttsVolume);
    this.saveSettings();
    this.cdr.detectChanges();
  }

  onReloadAppButtonClicked(event: Event) {
    // Force reload.
    window.location.reload(true);
  }

  private saveSettings() {
    const settingsObject = {
      ...getAppSettings(),
      appVersion: VERSION,
    };
    localStorage.setItem(
        SettingsComponent.LOCAL_STORAGE_ITEM_NAME,
        JSON.stringify(settingsObject));
    console.log(`Saved app settings at local storage: ${
        SettingsComponent.LOCAL_STORAGE_ITEM_NAME}`);
  }

  private loadSettings(): AppSettings|null {
    const serializedSettings: string|null =
        localStorage.getItem(SettingsComponent.LOCAL_STORAGE_ITEM_NAME);
    if (serializedSettings === null) {
      return null;
    }
    console.log(`Loaded app settings from local storage: ${
        SettingsComponent.LOCAL_STORAGE_ITEM_NAME}`);
    return JSON.parse(serializedSettings);
  }

  get versionString(): string {
    return VERSION;
  }
}
