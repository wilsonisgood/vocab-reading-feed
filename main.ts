import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, type ReadingFeedSettings } from "./src/core/types";
import { ObsidianHttp } from "./src/platform/ObsidianHttp";
import { createPlayer, installReading } from "./src/ui/reading/installReading";

export default class ReadingFeedPlugin extends Plugin {
  settings: ReadingFeedSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    await this.loadSettings();
    const http = new ObsidianHttp();
    const player = createPlayer(this, http, () => this.settings);
    installReading(this, player, () => this.settings);
  }

  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<ReadingFeedSettings> | null) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
