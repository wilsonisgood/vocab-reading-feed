// Settings tab (V1-3): folder, default speed, default ▶ mode, follow-scroll.
import { PluginSettingTab, Setting, type App, type Plugin } from "obsidian";
import type { PlayMode, ReadingFeedSettings } from "../../core/types";

type Host = Plugin & { settings: ReadingFeedSettings; saveSettings(): Promise<void> };

export class ReadingFeedSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly host: Host) {
    super(app, host);
  }

  display(): void {
    const { containerEl } = this;
    const s = this.host.settings;
    containerEl.empty();

    new Setting(containerEl)
      .setName("存放資料夾")
      .setDesc("載入的文章會放在這個資料夾底下的 TED 子資料夾。")
      .addText((t) =>
        t.setValue(s.folder).onChange(async (v) => {
          s.folder = v.trim();
          await this.host.saveSettings();
        }),
      );

    new Setting(containerEl).setName("預設速度").addDropdown((d) => {
      for (const v of [0.75, 1, 1.25, 1.5]) d.addOption(String(v), `${v}x`);
      d.setValue(String(s.defaultSpeed)).onChange(async (v) => {
        s.defaultSpeed = Number(v);
        await this.host.saveSettings();
      });
    });

    new Setting(containerEl).setName("▶ 預設行為").addDropdown((d) => {
      d.addOption("toEnd", "播到結束").addOption("paragraph", "只播這段");
      d.setValue(s.playMode).onChange(async (v) => {
        s.playMode = v as PlayMode;
        await this.host.saveSettings();
      });
    });

    new Setting(containerEl).setName("跟隨捲動").addToggle((t) =>
      t.setValue(s.followScroll).onChange(async (v) => {
        s.followScroll = v;
        await this.host.saveSettings();
      }),
    );
  }
}
