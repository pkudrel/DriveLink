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


                // Initialize sync engine (index, change detection)
                await this.syncEngine.initialize();

                // Add settings tab
                this.settingsTab = new DriveLinkSettingTab(this.app, this);
                this.addSettingTab(this.settingsTab);

                // Add commands

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
