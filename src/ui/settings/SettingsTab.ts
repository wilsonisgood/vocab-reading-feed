// Settings tab (V1-3): folder, default speed, default ▶ mode, follow-scroll.
import { PluginSettingTab, Setting, type App, type Plugin } from "obsidian";
import type { AfterEnd, PlayMode, ReadingFeedSettings } from "../../core/types";
import { BOOKS_SUBFOLDER, normalizeLibraryUrl } from "../../core/library/logic";

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

    const lib = new Setting(containerEl)
      .setName("書庫網址（我的書）")
      .setDesc(
        `你自己的私人書庫網址（結尾是 /，或 …/library.json）。插件只連你填的這個網址，本身不提供任何書庫；` +
          `書會下載到「存放資料夾/${BOOKS_SUBFOLDER}/書名/」。網址含私密金鑰，不要分享。`,
      );
    lib.addText((t) => {
      t.inputEl.type = "password";
      t.setPlaceholder("https://…/<金鑰>/").setValue(s.libraryUrl).onChange(async (v) => {
        const n = v.trim() === "" ? "" : normalizeLibraryUrl(v);
        lib.descEl.toggleClass("rf-error", n === null);
        if (n === null) return;
        s.libraryUrl = n;
        await this.host.saveSettings();
      });
    });

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

    new Setting(containerEl)
      .setName("播完一篇後")
      .setDesc("鎖定畫面時也照這個設定接著播。")
      .addDropdown((d) => {
        d.addOption("next", "播下一篇")
          .addOption("loopAll", "播下一篇，最後一篇播完回到第一篇")
          .addOption("repeatOne", "重播這篇")
          .addOption("stop", "停止");
        d.setValue(s.afterEnd).onChange(async (v) => {
          s.afterEnd = v as AfterEnd;
          await this.host.saveSettings();
        });
      });

    new Setting(containerEl).setName("跟隨捲動").addToggle((t) =>
      t.setValue(s.followScroll).onChange(async (v) => {
        s.followScroll = v;
        await this.host.saveSettings();
      }),
    );

    new Setting(containerEl)
      .setName("開啟 rf 筆記時自動切到閱讀模式")
      .addToggle((t) =>
        t.setValue(s.autoReadingMode).onChange(async (v) => {
          s.autoReadingMode = v;
          await this.host.saveSettings();
        }),
      );
  }
}
