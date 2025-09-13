import { App, PluginSettingTab, Setting } from 'obsidian';
import DriveLinkPlugin from './main';

/**
 * Plugin settings interface
 */
export interface DriveLinkSettings {
    clientId: string;
    redirectUri: string;
    driveFolderId: string;
    ignoreGlobs: string[];
    syncOnStartup: boolean;
    syncOnFileChange: boolean;
    conflictResolution: 'last-writer-wins' | 'manual';
}

/**
 * Default plugin settings
 */
export const DEFAULT_SETTINGS: DriveLinkSettings = {
    clientId: '',
    redirectUri: 'https://your-callback-domain.com/callback/drive',
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
    conflictResolution: 'last-writer-wins'
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

        // Google OAuth Configuration Section
        this.addOAuthSection(containerEl);

        // Drive Configuration Section
        this.addDriveSection(containerEl);

        // Sync Configuration Section
        this.addSyncSection(containerEl);

        // Advanced Settings Section
        this.addAdvancedSection(containerEl);
    }

    private addOAuthSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'Google OAuth Configuration' });

        // Client ID Setting
        new Setting(containerEl)
            .setName('Google OAuth Client ID')
            .setDesc('Your Google OAuth 2.0 Client ID from Google Cloud Console')
            .addText(text => text
                .setPlaceholder('Enter your Google OAuth Client ID')
                .setValue(this.plugin.settings.clientId)
                .onChange(async (value) => {
                    this.plugin.settings.clientId = value.trim();
                    await this.plugin.saveSettings();

                    // Initialize OAuth manager when client ID is set
                    if (value.trim()) {
                        this.plugin.tokenManager.initializeOAuth(
                            this.plugin.settings.clientId,
                            this.plugin.settings.redirectUri
                        );
                    }
                }));

        // Redirect URI Setting
        new Setting(containerEl)
            .setName('OAuth Redirect URI')
            .setDesc('The callback URL configured in your Google OAuth client')
            .addText(text => text
                .setPlaceholder('https://your-domain.com/callback/drive')
                .setValue(this.plugin.settings.redirectUri)
                .onChange(async (value) => {
                    this.plugin.settings.redirectUri = value.trim();
                    await this.plugin.saveSettings();
                }));

        // Connection Status and Actions
        this.addConnectionStatus(containerEl);
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

            if (!this.plugin.settings.clientId) {
                connectBtn.disabled = true;
                connectBtn.title = 'Please set Client ID first';
            }

            connectBtn.addEventListener('click', async () => {
                try {
                    await this.plugin.connectToDrive();
                    this.display(); // Refresh after connection
                } catch (error) {
                    console.error('Connection failed:', error);
                    // Could show a notice here
                }
            });
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
}