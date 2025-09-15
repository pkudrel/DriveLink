import { App, PluginSettingTab, Setting } from 'obsidian';
import DriveLinkPlugin from './main';
import { LogLevel, Logger } from './utils/logger';

/**
 * Plugin settings interface
 */
export interface DriveLinkSettings {
    driveFolderId: string;
    ignoreGlobs: string[];
    syncOnStartup: boolean;
    syncOnFileChange: boolean;
    conflictResolution: 'last-writer-wins' | 'manual';
    allowedFileExtensions: string[];
    enableExtensionFiltering: boolean;
    allowFolders: boolean;
    debugLevel: LogLevel;
}

/**
 * Default plugin settings
 */
export const DEFAULT_SETTINGS: DriveLinkSettings = {
    driveFolderId: '',
    ignoreGlobs: [
        '.obsidian/**',
        '.trash/**',
        '*.tmp',
        '*.lock',
        '.git/**'
    ],
    syncOnStartup: false,
    syncOnFileChange: false,
    conflictResolution: 'last-writer-wins',
    allowedFileExtensions: ['md', 'pdf'],
    enableExtensionFiltering: false,
    allowFolders: true,
    debugLevel: LogLevel.INFO
};

/**
 * Settings tab for DriveLink plugin
 */
export class DriveLinkSettingTab extends PluginSettingTab {
    plugin: DriveLinkPlugin;

    constructor(app: App, plugin: DriveLinkPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // Add custom CSS class for styling
        containerEl.addClass('drivelink-settings');

        // Header
        containerEl.createEl('h2', { text: 'DriveLink Settings' });
        containerEl.createEl('p', {
            text: 'Configure Google Drive synchronization for your Obsidian vault.',
            cls: 'setting-item-description'
        });

        // Authentication Section
        this.addAuthenticationSection(containerEl);

        // Drive Configuration Section
        this.addDriveSection(containerEl);

        // Sync Configuration Section
        this.addSyncSection(containerEl);

        // Advanced Settings Section
        this.addAdvancedSection(containerEl);
    }

    private addAuthenticationSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'Authentication' });

        // Description
        const descEl = containerEl.createEl('p', {
            cls: 'setting-item-description',
            text: 'Paste SimpleToken CLI generated tokens here.'
        });
        descEl.style.marginBottom = '4px';

        // Token import area
        this.addTokenImport(containerEl);

        // Connection Status and Actions
        this.addConnectionStatus(containerEl);
    }



    private addTokenImport(containerEl: HTMLElement): void {
        // Create custom vertical layout instead of using Setting
        const importContainer = containerEl.createDiv({ cls: 'drivelink-import-container' });

        // Textarea
        const textareaEl = importContainer.createEl('textarea', {
            cls: 'drivelink-import-textarea'
        });
        textareaEl.placeholder = 'Paste SimpleToken JSON output here...\n{\n  "access_token": "...",\n  "refresh_token": "...",\n  ...\n}';
        textareaEl.rows = 6;
        textareaEl.style.fontFamily = 'monospace';
        textareaEl.style.fontSize = '0.85em';
        textareaEl.style.width = '100%';
        textareaEl.style.marginTop = '8px';

        // Add import button after the textarea
        const buttonContainer = importContainer.createDiv({ cls: 'drivelink-import-actions' });
        buttonContainer.style.marginTop = '4px';

        const importBtn = buttonContainer.createEl('button', {
            text: 'Import Tokens',
            cls: 'drivelink-button'
        });
        importBtn.style.margin = '0';

        const clearBtn = buttonContainer.createEl('button', {
            text: 'Clear',
            cls: 'drivelink-button secondary'
        });
        clearBtn.style.margin = '0';

        // Event handlers
        importBtn.addEventListener('click', async () => {
            const tokenData = textareaEl.value.trim();
            if (!tokenData) {
                // Could show a notice here
                return;
            }

            try {
                const success = await this.plugin.tokenManager.importSimpleTokenData(tokenData);
                if (success) {
                    textareaEl.value = ''; // Clear the input
                    this.display(); // Refresh the settings tab
                    // Could show success notice here
                } else {
                    // Could show error notice here
                    console.error('Failed to import token data');
                }
            } catch (error) {
                console.error('Import failed:', error);
                // Could show error notice here
            }
        });

        clearBtn.addEventListener('click', () => {
            textareaEl.value = '';
        });
    }

    private async addConnectionStatus(containerEl: HTMLElement): Promise<void> {
        const statusContainer = containerEl.createDiv({ cls: 'drivelink-connection-status' });

        // Get current connection status
        const tokenStatus = await this.plugin.tokenManager.getTokenStatus();

        // Status display
        const statusEl = statusContainer.createDiv({ cls: 'drivelink-status-row' });
        statusEl.createSpan({ text: 'Connection Status: ' });

        const statusBadge = statusEl.createSpan({
            cls: `drivelink-status ${tokenStatus.connected ? 'connected' : 'disconnected'}`,
            text: tokenStatus.connected ? 'Connected' : 'Disconnected'
        });

        // Show token source
        if (tokenStatus.connected && tokenStatus.source !== 'none') {
            const sourceText = tokenStatus.source === 'simple_token'
                ? '(via SimpleToken CLI)'
                : '(manual OAuth)';
            statusEl.createSpan({
                text: ` ${sourceText}`,
                cls: 'drivelink-token-source'
            }).style.color = 'var(--text-muted)';
        }

        if (tokenStatus.connected && tokenStatus.expiresAt) {
            const expiryDate = new Date(tokenStatus.expiresAt);
            statusContainer.createDiv({
                text: `Token expires: ${expiryDate.toLocaleString()}`,
                cls: 'drivelink-token-expiry'
            });
        }


        // Action buttons
        const actionsEl = statusContainer.createDiv({ cls: 'drivelink-actions' });

        if (tokenStatus.connected) {
            // Disconnect button
            actionsEl.createEl('button', {
                text: 'Disconnect',
                cls: 'drivelink-button'
            }).addEventListener('click', async () => {
                await this.plugin.tokenManager.disconnect();
                this.display(); // Refresh the settings tab
            });
        } else {
            // Connect button
            const connectBtn = actionsEl.createEl('button', {
                text: 'Connect to Google Drive',
                cls: 'drivelink-button'
            });

            connectBtn.disabled = true;
            connectBtn.title = 'Paste tokens above to connect';
        }
    }

    private addDriveSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'Google Drive Configuration' });

        // Drive Folder ID
        new Setting(containerEl)
            .setName('Drive Folder ID')
            .setDesc('Google Drive folder ID for synchronization (auto-detected after setup)')
            .addText(text => text
                .setPlaceholder('Will be auto-filled after folder setup')
                .setValue(this.plugin.settings.driveFolderId)
                .onChange(async (value) => {
                    this.plugin.settings.driveFolderId = value.trim();
                    await this.plugin.saveSettings();
                }))
            .addButton(button => button
                .setButtonText('Setup Folder')
                .onClick(async () => {
                    try {
                        await this.plugin.setupDriveFolder();
                        this.display(); // Refresh to show the new folder ID
                    } catch (error) {
                        console.error('Folder setup failed:', error);
                    }
                }));
    }

    private addSyncSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'Synchronization Settings' });

        // Sync on startup
        new Setting(containerEl)
            .setName('Sync on startup')
            .setDesc('Automatically sync when Obsidian starts')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.syncOnStartup)
                .onChange(async (value) => {
                    this.plugin.settings.syncOnStartup = value;
                    await this.plugin.saveSettings();
                }));

        // Sync on file change
        new Setting(containerEl)
            .setName('Auto-sync on file changes')
            .setDesc('Automatically sync when files are modified (experimental)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.syncOnFileChange)
                .onChange(async (value) => {
                    this.plugin.settings.syncOnFileChange = value;
                    await this.plugin.saveSettings();
                }));

        // Conflict resolution
        new Setting(containerEl)
            .setName('Conflict resolution')
            .setDesc('How to handle conflicts when the same file is modified in both locations')
            .addDropdown(dropdown => dropdown
                .addOption('last-writer-wins', 'Last writer wins (create backup)')
                .addOption('manual', 'Manual resolution (not implemented)')
                .setValue(this.plugin.settings.conflictResolution)
                .onChange(async (value: 'last-writer-wins' | 'manual') => {
                    this.plugin.settings.conflictResolution = value;
                    await this.plugin.saveSettings();
                }));

        // Manual sync button
        new Setting(containerEl)
            .setName('Manual Sync')
            .setDesc('Trigger a manual synchronization')
            .addButton(button => button
                .setButtonText('Sync Now')
                .onClick(async () => {
                    try {
                        await this.plugin.syncNow();
                        // Could show a success notice here
                    } catch (error) {
                        console.error('Sync failed:', error);
                        // Could show an error notice here
                    }
                }));
    }

    private addAdvancedSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'Advanced Settings' });

        // Debug Level Control
        new Setting(containerEl)
            .setName('Debug Level')
            .setDesc('Set logging level for troubleshooting. Higher levels show more detailed information.')
            .addDropdown(dropdown => dropdown
                .addOption(LogLevel.ERROR.toString(), 'Error - Only errors')
                .addOption(LogLevel.WARN.toString(), 'Warning - Errors and warnings')
                .addOption(LogLevel.INFO.toString(), 'Info - General information')
                .addOption(LogLevel.DEBUG.toString(), 'Debug - All details (verbose)')
                .setValue(this.plugin.settings.debugLevel.toString())
                .onChange(async (value) => {
                    const newLevel = parseInt(value) as LogLevel;
                    this.plugin.settings.debugLevel = newLevel;
                    await this.plugin.saveSettings();
                    // Update logger immediately
                    Logger.setLevel(newLevel);
                }));

        // File extension filtering
        this.addExtensionFilteringSection(containerEl);

        // Ignore patterns
        const ignoreDesc = containerEl.createDiv();
        ignoreDesc.innerHTML = `
            <p>File patterns to ignore during sync (one per line). Supports glob patterns:</p>
            <ul>
                <li><code>.obsidian/**</code> - Ignore all Obsidian config files</li>
                <li><code>*.tmp</code> - Ignore temporary files</li>
                <li><code>private/**</code> - Ignore a specific folder</li>
            </ul>
        `;

        new Setting(containerEl)
            .setName('Ignore patterns')
            .setDesc('')
            .addTextArea(text => text
                .setPlaceholder('Enter ignore patterns, one per line')
                .setValue(this.plugin.settings.ignoreGlobs.join('\n'))
                .onChange(async (value) => {
                    this.plugin.settings.ignoreGlobs = value
                        .split('\n')
                        .map(line => line.trim())
                        .filter(line => line.length > 0);
                    await this.plugin.saveSettings();
                }));
    }

    private addExtensionFilteringSection(containerEl: HTMLElement): void {
        // Enable/disable extension filtering toggle
        new Setting(containerEl)
            .setName('Enable file extension filtering')
            .setDesc('Only sync files with specific extensions. When disabled, all files (except ignored patterns) will be synced.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableExtensionFiltering)
                .onChange(async (value) => {
                    this.plugin.settings.enableExtensionFiltering = value;
                    await this.plugin.saveSettings();
                    this.display(); // Refresh to show/hide extension list
                }));

        // Allow folders setting
        new Setting(containerEl)
            .setName('Allow folders')
            .setDesc('Include folders in synchronization. When enabled, folders will be synced regardless of extension filtering.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.allowFolders)
                .onChange(async (value) => {
                    this.plugin.settings.allowFolders = value;
                    await this.plugin.saveSettings();
                }));

        // Extension list (only show when filtering is enabled)
        if (this.plugin.settings.enableExtensionFiltering) {
            const extensionDesc = containerEl.createDiv();
            extensionDesc.innerHTML = `
                <p>File extensions to sync (one per line, without the dot):</p>
                <ul>
                    <li><code>md</code> - Markdown files</li>
                    <li><code>pdf</code> - PDF documents</li>
                    <li><code>txt</code> - Text files</li>
                    <li><code>png</code> - PNG images</li>
                </ul>
            `;

            new Setting(containerEl)
                .setName('Allowed file extensions')
                .setDesc('Enter file extensions without the dot (e.g., "md", "pdf", "txt")')
                .addTextArea(text => text
                    .setPlaceholder('md\npdf\ntxt\npng\njpeg')
                    .setValue(this.plugin.settings.allowedFileExtensions.join('\n'))
                    .onChange(async (value) => {
                        this.plugin.settings.allowedFileExtensions = value
                            .split('\n')
                            .map(line => line.trim().toLowerCase())
                            .filter(line => line.length > 0)
                            .filter(line => /^[a-zA-Z0-9]+$/.test(line)); // Only allow alphanumeric extensions
                        await this.plugin.saveSettings();
                    }));

            // Show current extensions count
            const currentExtensions = this.plugin.settings.allowedFileExtensions;
            if (currentExtensions.length > 0) {
                const statusEl = containerEl.createDiv({
                    cls: 'setting-item-description',
                    text: `Currently allowing: ${currentExtensions.map(ext => '.' + ext).join(', ')}`
                });
                statusEl.style.fontStyle = 'italic';
                statusEl.style.marginTop = '8px';
            }
        }
    }
}