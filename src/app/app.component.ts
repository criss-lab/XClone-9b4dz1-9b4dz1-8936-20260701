import { Component } from '@angular/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
})
export class AppComponent {

  constructor() {
    this.initializeApp();
  }

  async initializeApp() {
    // 1. Tell Capgo the app is ready
    await CapacitorUpdater.notifyAppReady();

    // 2. Listen for updates
    CapacitorUpdater.addListener('updateAvailable', async (info) => {
      console.log('Update found:', info);

      await CapacitorUpdater.download();
      await CapacitorUpdater.set();
    });
  }
}
