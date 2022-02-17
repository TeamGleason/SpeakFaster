/** Quick phrase list for direct selection. */
import {AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, QueryList, ViewChildren} from '@angular/core';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {AppSettings, getAppSettings, setTtsVoiceType, setTtsVolume, TtsVoiceType, TtsVolume} from './settings';
import {VERSION} from './version';

@Component({
  selector: 'app-settings-component',
  templateUrl: './settings.component.html',
})
export class SettingsComponent implements AfterViewInit, OnDestroy {
  private static readonly _NAME = 'SettingsComponent';

  private readonly instanceId = SettingsComponent._NAME + '_' + createUuid();

  @Input() userId!: string;

  constructor(private cdr: ChangeDetectorRef) {}

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

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
    this.cdr.detectChanges();
  }

  setTtsVolume(ttsVolume: TtsVolume) {
    setTtsVolume(ttsVolume);
    this.cdr.detectChanges();
  }

  onReloadAppButtonClicked(event: Event) {
    window.location.reload(true);
  }

  get versionString(): string {
    return VERSION;
  }
}
