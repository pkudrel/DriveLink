import { App, PluginSettingTab, Setting } from 'obsidian';
import DriveLinkPlugin from './main';
import { CLIIntegration } from './utils/cli-integration';

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

        // Add SimpleToken integration info first
        this.addSimpleTokenSection(containerEl);

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

    private addSimpleTokenSection(containerEl: HTMLElement): void {
        const simpleTokenContainer = containerEl.createDiv({ cls: 'drivelink-simple-token-section' });

        // SimpleToken header
        const headerEl = simpleTokenContainer.createEl('h4', { text: '🔐 SimpleToken CLI Integration' });
        headerEl.style.marginBottom = '8px';

        // Description
        const descEl = simpleTokenContainer.createEl('p', {
            cls: 'setting-item-description',
            text: 'Use SimpleToken CLI for easier token generation. Run the CLI tool separately and paste the generated tokens here.'
        });
        descEl.style.marginBottom = '16px';

        // CLI detection status
        this.addCLIStatus(simpleTokenContainer);

        // Token import area
        this.addTokenImport(simpleTokenContainer);
    }

    private addCLIStatus(containerEl: HTMLElement): void {
        const statusEl = containerEl.createDiv({ cls: 'drivelink-cli-status' });

        // Check CLI availability
        const cliDetection = CLIIntegration.detectSimpleTokenCLI();
        const statusText = cliDetection.available
            ? `✅ SimpleToken CLI detected (${cliDetection.method})`
            : '⚠️ SimpleToken CLI not detected';

        statusEl.createSpan({ text: statusText });

        if (cliDetection.available) {
            const instructions = CLIIntegration.getSetupInstructions();
            const instructionEl = statusEl.createDiv({
                cls: 'drivelink-cli-instructions',
                text: instructions.command ? `Run: ${instructions.command}` : ''
            });
            instructionEl.style.fontSize = '0.85em';
            instructionEl.style.color = 'var(--text-muted)';
            instructionEl.style.marginTop = '4px';
        }
    }

    private addTokenImport(containerEl: HTMLElement): void {
        const importContainer = containerEl.createDiv({ cls: 'drivelink-token-import' });

        // Token paste area
        new Setting(importContainer)
            .setName('Paste SimpleToken Output')
            .setDesc('Copy the JSON output from SimpleToken CLI and paste it here')
            .addTextArea(text => {
                text.setPlaceholder('Paste SimpleToken JSON output here...\n{\n  "access_token": "...",\n  "refresh_token": "...",\n  ...\n}');
                text.inputEl.rows = 6;
                text.inputEl.style.fontFamily = 'monospace';
                text.inputEl.style.fontSize = '0.85em';

                // Add import button after the textarea
                const buttonContainer = text.inputEl.parentElement?.createDiv({ cls: 'drivelink-import-actions' });
                if (buttonContainer) {
                    buttonContainer.style.marginTop = '8px';

                    const importBtn = buttonContainer.createEl('button', {
                        text: 'Import Tokens',
                        cls: 'drivelink-button'
                    });

                    const clearBtn = buttonContainer.createEl('button', {
                        text: 'Clear',
                        cls: 'drivelink-button secondary'
                    });
                    clearBtn.style.marginLeft = '8px';

                    importBtn.addEventListener('click', async () => {
                        const tokenData = text.getValue().trim();
                        if (!tokenData) {
                            // Could show a notice here
                            return;
                        }

                        try {
                            const success = await this.plugin.tokenManager.importSimpleTokenData(tokenData);
                            if (success) {
                                text.setValue(''); // Clear the input
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
                        text.setValue('');
                    });
                }
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

        // Show SimpleToken availability status
        if (tokenStatus.simpleTokenAvailable && !tokenStatus.connected) {
            statusContainer.createDiv({
                text: '💡 SimpleToken CLI detected - you can use it for easier setup',
                cls: 'drivelink-hint'
            }).style.fontSize = '0.85em';
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