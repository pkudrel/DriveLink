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

		// Note: OAuth is handled entirely by SimpleToken CLI
		// No need to initialize OAuth manager in SimpleToken-only mode

		// Initialize sync engine (index, change detection)
		await this.syncEngine.initialize();

		// Add settings tab
		this.addSettingTab(new DriveLinkSettingTab(this.app, this));

		// Add commands
		// Note: Connection is handled via SimpleToken CLI, no manual connect command needed

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

				// Reconstruct the callback URL for parser
				const callbackUrl = `obsidian://plugin-drivelink/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
				await this.tokenManager.handleCallback(callbackUrl);
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

	// Note: Connection is now handled entirely by SimpleToken CLI
	// This method is kept for compatibility but does nothing in SimpleToken-only mode
	async connectToDrive() {
		console.log('Drive connection is managed by SimpleToken CLI');
	}

	async setupDriveFolder() {
		try {
			if (!await this.tokenManager.hasValidToken()) {
				throw new Error('No valid tokens found. Please set up SimpleToken CLI first.');
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
}
