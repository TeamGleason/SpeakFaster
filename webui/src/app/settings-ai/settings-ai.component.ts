/** Quick phrase list for direct selection. */
import {AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, QueryList, ViewChildren} from '@angular/core';
import {getHostInfo, setHostEyeGazeOptions, updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {HttpEventLogger} from '../event-logger/event-logger-impl';
import {AppSettings, getAppSettings, setEnableAbbrevExpansionAutoFire, setEnableInckw, setNumWordSuggestions} from '../settings/settings';

@Component({
  selector: 'app-settings-ai-component',
  templateUrl: './settings-ai.component.html',
})
export class SettingsAiComponent implements AfterViewInit, OnInit, OnDestroy {
  private static readonly _NAME = 'SettingsAiComponent';

  private readonly instanceId = SettingsAiComponent._NAME + '_' + createUuid();
  appSettings: AppSettings|null = null;

  constructor(
      private cdr: ChangeDetectorRef, private eventLogger: HttpEventLogger) {}

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

  ngOnInit() {
    this.refreshSettings();
    this.cdr.detectChanges();
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

  setNumWordSuggestions(numWordSuggestions: number) {
    setNumWordSuggestions(numWordSuggestions);
    this.eventLogger.logSettingsChange('NumWordSuggestions');
    this.refreshSettings();
  }

  setEnableInckw(enableInckw: boolean) {
    setEnableInckw(enableInckw);
    this.eventLogger.logSettingsChange('EnableInckw');
    this.refreshSettings();
  }

  setEnableAbbrevExpansionAutoFire(enableAbbrevExpansionAutoFire: boolean) {
    setEnableAbbrevExpansionAutoFire(enableAbbrevExpansionAutoFire);
    this.eventLogger.logSettingsChange('EnableAbbrevExpansionAutoFire');
    this.refreshSettings();
  }
}
