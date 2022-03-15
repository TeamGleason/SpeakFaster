/** Quick phrase list for direct selection. */
import {AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, QueryList, ViewChildren} from '@angular/core';
import {requestQuitApp, setHostEyeGazeOptions, updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {HttpEventLogger} from '../event-logger/event-logger-impl';
import {AppSettings, getAppSettings, setGazeFuzzyRadius, setShowGazeTracker, ShowGazeTracker} from '../settings/settings';

@Component({
  selector: 'app-settings-eye-gaze-component',
  templateUrl: './settings-eye-gaze.component.html',
})
export class SettingsEyeGazeComponent implements AfterViewInit, OnInit,
                                                 OnDestroy {
  private static readonly _NAME = 'SettingsEyeGazeComponent';

  private readonly instanceId =
      SettingsEyeGazeComponent._NAME + '_' + createUuid();
  appSettings: AppSettings|null = null;

  constructor(
      private cdr: ChangeDetectorRef, private eventLogger: HttpEventLogger) {}

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

  setShowGazeTracker(showGazeTracker: ShowGazeTracker) {
    setShowGazeTracker(showGazeTracker);
    this.eventLogger.logSettingsChange('ShowGazeTracker');
    this.refreshSettings();
    setHostEyeGazeOptions();
  }

  setGazeFuzzyRadius(gazeFuzzyRadius: number) {
    setGazeFuzzyRadius(gazeFuzzyRadius);
    this.eventLogger.logSettingsChange('GazeFuzzyRadius');
    this.refreshSettings();
    setHostEyeGazeOptions();
  }
}
