import { App, Modal, Notice, Platform } from 'obsidian';
import type DriveLinkPlugin from '../main';
import { Logger } from '../utils/logger';

/**
 * Shows the plugin log with buttons to copy it; works on mobile, where there is no developer console
 */
export class LogModal extends Modal {
    private plugin: DriveLinkPlugin;

    constructor(app: App, plugin: DriveLinkPlugin) {
        super(app);
        this.plugin = plugin;
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('drivelink-log-modal');
        this.titleEl.setText('DriveLink log');

        const header = this.buildHeader();
        contentEl.createEl('pre', { text: header, cls: 'drivelink-log-header' });

        const actionsEl = contentEl.createDiv({ cls: 'drivelink-actions' });
        const textarea = contentEl.createEl('textarea', { cls: 'drivelink-log-text' });
        textarea.readOnly = true;
        textarea.rows = 18;
        textarea.value = Logger.formatEntries(Logger.getEntries()) || 'No log entries yet.';

        const lastSyncLog = await this.plugin.readLastSyncLog();

        this.addButton(actionsEl, 'Copy last sync', () => {
            if (!lastSyncLog) {
                new Notice('DriveLink: no sync has been logged yet.');
                return;
            }
            void this.copy(`${header}\n\n${lastSyncLog}`, textarea);
        });

        this.addButton(actionsEl, 'Copy all', () => {
            void this.copy(`${header}\n\n${Logger.formatEntries(Logger.getEntries())}`, textarea);
        });

        this.addButton(actionsEl, 'Clear', () => {
            Logger.clearEntries();
            textarea.value = '';
        }, 'secondary');

        // Newest entries are the interesting ones
        textarea.scrollTop = textarea.scrollHeight;
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private addButton(containerEl: HTMLElement, text: string, onClick: () => void, extraCls = ''): void {
        containerEl.createEl('button', {
            text,
            cls: `drivelink-button ${extraCls}`.trim()
        }).addEventListener('click', onClick);
    }

    /**
     * Copy to the clipboard; where that is not allowed, put the text in the box and select it
     */
    private async copy(text: string, textarea: HTMLTextAreaElement): Promise<void> {
        try {
            await navigator.clipboard.writeText(text);
            new Notice('DriveLink: log copied.');
        } catch {
            textarea.value = text;
            textarea.focus();
            textarea.select();
            new Notice('DriveLink: copying is not allowed here. The text is selected, copy it manually.');
        }
    }

    /**
     * Plugin version, platform and outcome of the last sync, put on top of every copied log
     */
    private buildHeader(): string {
        const platform = Platform.isIosApp ? 'iOS'
            : Platform.isAndroidApp ? 'Android'
            : Platform.isMobile ? 'mobile'
            : 'desktop';

        const lines = [`DriveLink ${this.plugin.manifest.version} · ${platform}`];

        const lastSync = this.plugin.lastSyncResult;
        if (lastSync) {
            const outcome = lastSync.success
                ? 'succeeded'
                : `failed (${lastSync.error || `${lastSync.stats.errors} error(s)`})`;
            lines.push(`Last sync: ${new Date(lastSync.stats.startTime).toISOString()} · ${outcome}`);
        } else if (this.plugin.settings.lastSyncTime) {
            lines.push(`Last successful sync: ${this.plugin.settings.lastSyncTime}`);
        }

        return lines.join('\n');
    }
}
