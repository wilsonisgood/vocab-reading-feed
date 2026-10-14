import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, type ReadingFeedSettings } from "./src/core/types";
import { ObsidianHttp } from "./src/platform/ObsidianHttp";
import { TedClient } from "./src/services/ted/TedClient";
import { installBrowser } from "./src/ui/browser/installBrowser";
import { ReadingFeedSettingTab } from "./src/ui/settings/SettingsTab";
import { createPlayer, installReading } from "./src/ui/reading/installReading";

export default class ReadingFeedPlugin extends Plugin {
  settings: ReadingFeedSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    await this.loadSettings();
    const http = new ObsidianHttp();
    const player = createPlayer(this, http, () => this.settings);
    installReading(this, player, () => this.settings);
    installBrowser(this, new TedClient(http), () => this.settings);
    this.addSettingTab(new ReadingFeedSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<ReadingFeedSettings> | null) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
