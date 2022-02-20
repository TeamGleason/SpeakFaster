/** Quick phrase list for direct selection. */
import {AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, OnInit, QueryList, ViewChildren} from '@angular/core';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {AppSettings, getAppSettings, setTtsVoiceType, setTtsVolume, TtsVoiceType, TtsVolume} from './settings';
import {VERSION} from './version';

@Component({
  selector: 'app-settings-component',
  templateUrl: './settings.component.html',
})
export class SettingsComponent implements AfterViewInit, OnInit, OnDestroy {
  private static readonly _NAME = 'SettingsComponent';

  private readonly instanceId = SettingsComponent._NAME + '_' + createUuid();
  appSettings: AppSettings|null = null;

  @Input() userId!: string;

  constructor(private cdr: ChangeDetectorRef) {}

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

  ngOnInit() {
    this.refreshSettings();
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
    this.refreshSettings();
  }

  setTtsVolume(ttsVolume: TtsVolume) {
    setTtsVolume(ttsVolume);
    this.refreshSettings();
  }

  onReloadAppButtonClicked(event: Event) {
    // Force reload.
    window.location.reload(true);
  }

  get versionString(): string {
    return VERSION;
  }
}
