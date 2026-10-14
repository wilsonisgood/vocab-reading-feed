import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, type ReadingFeedSettings } from "./src/core/types";
import { ObsidianHttp } from "./src/platform/ObsidianHttp";
import { TedClient } from "./src/services/ted/TedClient";
import { installBrowser } from "./src/ui/browser/installBrowser";
import { ReadingFeedSettingTab } from "./src/ui/settings/SettingsTab";
import { createPlayer, installReading, nowPlaying } from "./src/ui/reading/installReading";

export default class ReadingFeedPlugin extends Plugin {
  settings: ReadingFeedSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    await this.loadSettings();
    const http = new ObsidianHttp();
    const player = createPlayer(this, http, () => this.settings);
    installReading(this, player, () => this.settings, () => this.saveSettings());
    installBrowser(this, new TedClient(http), () => this.settings, () => this.saveSettings(), {
      nowPlaying: () => nowPlaying(this.app, player),
      onPlayerChange: (cb) => {
        const offs = [player.on("state", cb), player.on("index", cb)];
        return () => offs.forEach((off) => off());
      },
    });
    this.addSettingTab(new ReadingFeedSettingTab(this.app, this));
  }

  async loadSettings() {
    const saved = (await this.loadData()) as Partial<ReadingFeedSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...saved };
    // Arrays are mutated in place by the panel; never share DEFAULT_SETTINGS' instances.
    this.settings.favorites = [...this.settings.favorites];
    this.settings.noTranscript = [...this.settings.noTranscript];
    this.settings.dockPos = { ...DEFAULT_SETTINGS.dockPos, ...this.settings.dockPos };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
