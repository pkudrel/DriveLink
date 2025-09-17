import { Notice, Plugin } from 'obsidian';
import { DriveLinkSettings, DEFAULT_SETTINGS, DriveLinkSettingTab } from './settings';
import { TokenManager } from './auth/token-manager';
import { DriveClient } from './drive/client';
import { SyncEngine } from './sync/sync-engine';
import { Logger, LogLevel } from './utils/logger';

export default class DriveLinkPlugin extends Plugin {
        settings: DriveLinkSettings;
        tokenManager: TokenManager;
        driveClient: DriveClient;
        syncEngine: SyncEngine;
        private settingsTab?: DriveLinkSettingTab;

	
	
        async onload() {
                await this.loadSettings();

                // Initialize logging system
                console.log('DriveLink: Setting log level to', this.settings.debugLevel, '(', Object.keys(LogLevel)[this.settings.debugLevel], ')');
                Logger.setLevel(this.settings.debugLevel);
                const logger = Logger.createComponentLogger('Main');
                logger.info('DriveLink plugin loading...');

                // Initialize core components
                this.tokenManager = new TokenManager(this);
                this.driveClient = new DriveClient(this.tokenManager);
                this.syncEngine = new SyncEngine(this.app, this.driveClient, this.settings, this);

                // Initialize manual OAuth manager if configuration is available
                if (this.settings.oauthClientId && this.settings.oauthRedirectUri) {
                        this.tokenManager.initializeOAuth(
                                this.settings.oauthClientId,
                                this.settings.oauthRedirectUri,
                                this.settings.oauthClientSecret || undefined
                        );
                }

                // Initialize sync engine (index, change detection)
                await this.syncEngine.initialize();

                // Add settings tab
                this.settingsTab = new DriveLinkSettingTab(this.app, this);
                this.addSettingTab(this.settingsTab);

                // Add commands
                this.addCommand({
                        id: 'connect-to-drive',
                        name: 'Connect to Google Drive',
                        callback: () => this.connectToDrive()
                });

                this.addCommand({
                        id: 'setup-drive-folder',
                        name: 'Set up Drive folder',
                        callback: () => this.setupDriveFolder()
                });

		this.addCommand({
			id: 'sync-now',
			name: 'Sync now',
			callback: () => this.syncNow()
		});

		this.addCommand({
			id: 'reset-change-detection',
			name: 'Reset change detection',
			callback: () => this.resetChangeDetection()
		});

                // Register obsidian protocol handler for OAuth callback
                this.registerObsidianProtocolHandler('plugin-drivelink', async (params) => {
                        try {
                                const { code, state, error, error_description } = params as Record<string, string>;
                                if (error) {
                                        new Notice(`DriveLink auth error: ${error_description || error}`);
                                        return;
                                }

                                if (!code || !state) {
                                        new Notice('DriveLink: Missing code/state in callback');
                                        return;
                                }

                                const callbackUrl = `obsidian://plugin-drivelink/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
                                await this.tokenManager.handleCallback(callbackUrl);
                                this.settingsTab?.handleTokenStatusChange();
                                new Notice('DriveLink: Connected to Google Drive');
                        } catch (e) {
                                console.error('DriveLink OAuth callback failed:', e);
                                new Notice('DriveLink: Authorization failed');
                        }
                });

                // Optional: sync on startup if enabled
                if (this.settings.syncOnStartup) {
                        this.syncNow();
                }

                console.log('DriveLink plugin loaded');
        }

	onunload() {
		console.log('DriveLink plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

        async saveSettings() {
                await this.saveData(this.settings);
        }

        async connectToDrive() {
                try {
                        if (!this.settings.oauthClientId || !this.settings.oauthRedirectUri) {
                                throw new Error('Configure OAuth Client ID and Redirect URI in settings first.');
                        }

                        this.tokenManager.initializeOAuth(
                                this.settings.oauthClientId,
                                this.settings.oauthRedirectUri,
                                this.settings.oauthClientSecret || undefined
                        );

                        const authUrl = await this.tokenManager.authorize();
                        if (!authUrl) {
                                throw new Error('Authorization URL was not generated.');
                        }

                        window.open(authUrl, '_blank', 'noopener');
                        new Notice('DriveLink: Complete Google consent in your browser, then return to Obsidian.');
                } catch (error) {
                        console.error('DriveLink: Failed to initiate OAuth flow', error);
                        if (error instanceof Error) {
                                new Notice(`DriveLink: ${error.message}`);
                        } else {
                                new Notice('DriveLink: Unable to start Google authorization.');
                        }
                        throw error;
                }
        }

        async setupDriveFolder() {
                try {
                        if (!await this.tokenManager.hasValidToken()) {
                                throw new Error('No valid tokens found. Connect to Google Drive first.');
                        }

			// If a folder ID is already set in settings, validate it
			if (this.settings.driveFolderId) {
				try {
					await this.driveClient.listFiles(this.settings.driveFolderId, undefined, 1);
					console.log('Using existing Drive folder:', this.settings.driveFolderId);
					return;
				} catch (error) {
					console.warn('Existing folder ID is invalid, creating new folder');
				}
			}

			const folderId = await this.driveClient.createOrFindFolder('ObsidianVault');
			this.settings.driveFolderId = folderId;
			await this.saveSettings();

			console.log('Drive folder set up successfully:', folderId);
		} catch (error) {
			console.error('Failed to set up Drive folder:', error);
		}
	}

	async syncNow() {
		try {
			if (!this.settings.driveFolderId) {
				await this.setupDriveFolder();
			}

			await this.syncEngine.performSync();
			console.log('Sync completed successfully');
		} catch (error) {
			console.error('Sync failed:', error);
		}
	}

	async resetChangeDetection() {
		try {
			console.log('Resetting change detection...');
			await this.syncEngine.resetChangeDetection();
			console.log('Change detection reset successfully');
		} catch (error) {
			console.error('Failed to reset change detection:', error);
		}
	}
}
