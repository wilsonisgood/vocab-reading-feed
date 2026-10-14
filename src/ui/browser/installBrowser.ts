// Registers the browser side-panel view, its command and ribbon icon (V1-3).
import type { Plugin, WorkspaceLeaf } from "obsidian";
import type { ReadingFeedSettings } from "../../core/types";
import type { TedClient } from "../../services/ted/TedClient";
import { BROWSER_VIEW_TYPE, BrowserView, type BrowserDeps } from "./BrowserView";

export function installBrowser(
  plugin: Plugin,
  client: TedClient,
  getSettings: () => ReadingFeedSettings,
  saveSettings: () => Promise<void> = () => Promise.resolve(),
  player: Pick<BrowserDeps, "nowPlaying" | "onPlayerChange"> = {},
): void {
  plugin.registerView(BROWSER_VIEW_TYPE, (leaf) => new BrowserView(leaf, { client, getSettings, saveSettings, ...player }));

  const open = async () => {
    const { workspace } = plugin.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(BROWSER_VIEW_TYPE)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) return;
      await leaf.setViewState({ type: BROWSER_VIEW_TYPE, active: true });
    }
    await workspace.revealLeaf(leaf);
  };

  plugin.addCommand({ id: "open-browser", name: "開啟 Reading Feed", callback: () => void open() });
  plugin.addRibbonIcon("newspaper", "開啟 Reading Feed", () => void open());
}
