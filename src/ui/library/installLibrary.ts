// Registers the "My books" side panel and its command (METHOD §5).
import type { Plugin, WorkspaceLeaf } from "obsidian";
import type { ReadingFeedSettings } from "../../core/types";
import type { LibraryClient } from "../../services/library/LibraryClient";
import { LIBRARY_VIEW_TYPE, LibraryView } from "./LibraryView";

export function installLibrary(
  plugin: Plugin,
  client: LibraryClient,
  getSettings: () => ReadingFeedSettings,
  saveSettings: () => Promise<void>,
): void {
  plugin.registerView(LIBRARY_VIEW_TYPE, (leaf) => new LibraryView(leaf, { client, getSettings, saveSettings }));

  const open = async () => {
    const { workspace } = plugin.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(LIBRARY_VIEW_TYPE)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) return;
      await leaf.setViewState({ type: LIBRARY_VIEW_TYPE, active: true });
    }
    await workspace.revealLeaf(leaf);
  };

  plugin.addCommand({ id: "open-library", name: "開啟我的書", callback: () => void open() });
}
