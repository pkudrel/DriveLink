import { Notice, Plugin } from 'obsidian';
import { DriveLinkSettings, DEFAULT_SETTINGS, DriveLinkSettingTab } from './settings';
import { TokenManager, TOKEN_STORAGE_KEY } from './auth/token-manager';
import { DriveClient } from './drive/client';
import { SyncEngine, SyncResult } from './sync/sync-engine';
import { INDEX_STORAGE_KEY } from './sync/index-manager';
import { DriveChangeDetection } from './drive/change-detection';
import { ConnectionCheck, formatConnectionCheck, runConnectionTest } from './drive/connection-test';
import { LogModal } from './ui/log-modal';
import { Logger, LogLevel } from './utils/logger';

/**
 * data.json keys owned by other components; never part of settings
 */
const NON_SETTINGS_KEYS = [INDEX_STORAGE_KEY, TOKEN_STORAGE_KEY];

export default class DriveLinkPlugin extends Plugin {
        settings: DriveLinkSettings;
        tokenManager: TokenManager;
        driveClient: DriveClient;
        syncEngine: SyncEngine;
        lastSyncResult?: SyncResult; // Outcome of the last sync in this session
        private settingsTab?: DriveLinkSettingTab;
        private dataWriteQueue: Promise<void> = Promise.resolve();

	
	
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

		this.addCommand({
			id: 'show-log',
			name: 'Show log',
			callback: () => this.showLog()
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
		const data = { ...(await this.loadData() || {}) };
		for (const key of NON_SETTINGS_KEYS) {
			delete data[key];
		}
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

        async saveSettings() {
                const settings = { ...this.settings };
                await this.updateData(data => Object.assign(data, settings));
        }

        /**
         * Read-modify-write of data.json. Writes are serialized so settings,
         * file index and tokens never overwrite each other's keys.
         */
        updateData(mutate: (data: Record<string, any>) => void): Promise<void> {
                const write = this.dataWriteQueue.then(async () => {
                        const data = await this.loadData() || {};
                        mutate(data);
                        await this.saveData(data);
                });
                this.dataWriteQueue = write.catch(() => undefined);
                return write;
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

			const result = await this.syncEngine.performSync();
			this.lastSyncResult = result;

			if (result.success) {
				const { filesUploaded, filesDownloaded, filesDeleted } = result.stats;
				new Notice(`DriveLink: sync completed (${filesUploaded} uploaded, ${filesDownloaded} downloaded, ${filesDeleted} deleted)`);
			} else {
				this.notifySyncFailure(result.error || `${result.stats.errors} file(s) failed`);
			}
		} catch (error) {
			Logger.error('Main', 'Sync failed', error as Error);
			this.notifySyncFailure((error as Error).message);
		}
	}

	/**
	 * Failure notice with a button that opens the log
	 */
	private notifySyncFailure(message: string): void {
		const fragment = document.createDocumentFragment();
		fragment.createDiv({ text: `DriveLink: sync failed: ${message}` });
		fragment.createEl('button', { text: 'Show log' })
			.addEventListener('click', () => this.showLog());
		new Notice(fragment, 15000);
	}

	showLog(): void {
		new LogModal(this.app, this).open();
	}

	/**
	 * Check token, Drive API, sync folder and change detection; results also go to the log
	 */
	async testConnection(): Promise<ConnectionCheck[]> {
		const changeDetection = new DriveChangeDetection(this.tokenManager);
		const checks = await runConnectionTest({
			tokenManager: this.tokenManager,
			driveClient: this.driveClient,
			getStartPageToken: () => changeDetection.getStartPageToken(),
			folderId: this.settings.driveFolderId
		});

		for (const check of checks) {
			if (check.status === 'failed') {
				Logger.warn('Connection', formatConnectionCheck(check), { hint: check.hint });
			} else {
				Logger.info('Connection', formatConnectionCheck(check));
			}
		}
		return checks;
	}

	/**
	 * File with the log of the last sync, kept across restarts (iOS often kills the app);
	 * null when the plugin has no folder (tests)
	 */
	private get lastSyncLogPath(): string | null {
		return this.manifest?.dir ? `${this.manifest.dir}/last-sync.log` : null;
	}

	async saveLastSyncLog(): Promise<void> {
		const path = this.lastSyncLogPath;
		if (!path) {
			return;
		}
		try {
			await this.app.vault.adapter.write(path, Logger.formatEntries(Logger.getLastSyncEntries()));
		} catch (error) {
			Logger.warn('Main', 'Could not save the last sync log', { error: (error as Error).message });
		}
	}

	/**
	 * Log of the last sync: from memory, or from the file written by an earlier session
	 */
	async readLastSyncLog(): Promise<string> {
		const entries = Logger.getLastSyncEntries();
		if (entries.length > 0) {
			return Logger.formatEntries(entries);
		}

		const path = this.lastSyncLogPath;
		try {
			if (path && await this.app.vault.adapter.exists(path)) {
				return await this.app.vault.adapter.read(path);
			}
		} catch (error) {
			Logger.warn('Main', 'Could not read the last sync log', { error: (error as Error).message });
		}
		return '';
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
