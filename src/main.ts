import { Plugin } from 'obsidian';
import { DriveLinkSettings, DEFAULT_SETTINGS, DriveLinkSettingTab } from './settings';
import { TokenManager } from './auth/token-manager';
import { DriveClient } from './drive/client';
import { SyncEngine } from './sync/sync-engine';

export default class DriveLinkPlugin extends Plugin {
	settings: DriveLinkSettings;
	tokenManager: TokenManager;
	driveClient: DriveClient;
	syncEngine: SyncEngine;

	async onload() {
		await this.loadSettings();

		// Initialize core components
		this.tokenManager = new TokenManager(this);
		this.driveClient = new DriveClient(this.tokenManager);
		this.syncEngine = new SyncEngine(this.app, this.driveClient, this.settings);

		// Add settings tab
		this.addSettingTab(new DriveLinkSettingTab(this.app, this));

		// Add commands
		this.addCommand({
			id: 'connect-google-drive',
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
			await this.tokenManager.authorize();
			console.log('Connected to Google Drive successfully');
		} catch (error) {
			console.error('Failed to connect to Google Drive:', error);
		}
	}

	async setupDriveFolder() {
		try {
			if (!await this.tokenManager.hasValidToken()) {
				await this.connectToDrive();
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
}