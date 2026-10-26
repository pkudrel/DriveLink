/**
 * Minimal runtime stub of the 'obsidian' module for unit tests.
 * Only what the plugin touches at import time or in tested code paths.
 */

export class App {}
export class TAbstractFile {}
export class TFile extends TAbstractFile {}
export class Notice {
    constructor(_message?: string) {}
}
export class PluginSettingTab {
    constructor(_app: App, _plugin: unknown) {}
}
export class Setting {
    constructor(_containerEl: unknown) {}
}
export const Platform = { isDesktop: true, isMobile: false };

/**
 * Plugin whose data.json lives in memory. loadData/saveData are async and
 * round-trip through JSON, like the real disk-backed implementation.
 */
export class Plugin {
    app: App;
    manifest: unknown;
    storedJson: string | null = null;
    saveCount = 0;

    constructor(app: App, manifest: unknown) {
        this.app = app;
        this.manifest = manifest;
    }

    async loadData(): Promise<any> {
        await new Promise(resolve => setImmediate(resolve));
        return this.storedJson === null ? null : JSON.parse(this.storedJson);
    }

    async saveData(data: any): Promise<void> {
        await new Promise(resolve => setImmediate(resolve));
        this.storedJson = JSON.stringify(data);
        this.saveCount++;
    }

    addCommand(_command: unknown): void {}
    addSettingTab(_tab: unknown): void {}
}
