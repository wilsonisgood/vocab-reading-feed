import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, type ReadingFeedSettings } from "./src/core/types";

export default class ReadingFeedPlugin extends Plugin {
  settings: ReadingFeedSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    await this.loadSettings();
  }

  async loadSettings() {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<ReadingFeedSettings> | null) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
