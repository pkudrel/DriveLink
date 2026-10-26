import type { TokenManager } from '../auth/token-manager';
import type { DriveClient } from './client';
import { maskEmail, redact } from '../utils/redact';

/**
 * Result of one connection test step
 */
export interface ConnectionCheck {
    name: string;
    status: 'ok' | 'failed' | 'skipped';
    detail: string;
    hint?: string; // What to do about a failure
    durationMs: number;
}

export interface ConnectionTestDeps {
    tokenManager: Pick<TokenManager, 'getValidAccessToken' | 'getTokenStatus'>;
    driveClient: Pick<DriveClient, 'getUserInfo' | 'getFileMetadata' | 'listFiles'>;
    getStartPageToken: () => Promise<string>;
    folderId: string;
}

interface ConnectionStep {
    name: string;
    hint: string;
    required: boolean; // Later steps cannot work when this one fails
    run: () => Promise<string>;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * Check, step by step, everything a sync needs: token, Drive API, sync folder and change detection.
 * Read-only: nothing is written to Drive.
 */
export async function runConnectionTest(deps: ConnectionTestDeps): Promise<ConnectionCheck[]> {
    const steps: ConnectionStep[] = [
        {
            name: 'Token',
            hint: 'Import tokens again with SimpleToken in the Authentication section.',
            required: true,
            run: async () => {
                await deps.tokenManager.getValidAccessToken();
                const status = await deps.tokenManager.getTokenStatus();
                if (!status.expiresAt) {
                    return 'valid';
                }
                return `valid, expires in ${Math.round((status.expiresAt - Date.now()) / 60000)} min`;
            }
        },
        {
            name: 'Google Drive API',
            hint: 'Check the network connection. On a VPN or behind a firewall, www.googleapis.com must be reachable.',
            required: true,
            run: async () => {
                const user = await deps.driveClient.getUserInfo();
                return `connected as ${maskEmail(user.emailAddress)}`;
            }
        },
        {
            name: 'Sync folder',
            hint: 'Use "Setup Folder" in the Google Drive section or check the Drive Folder ID.',
            required: false,
            run: async () => {
                if (!deps.folderId) {
                    throw new Error('no Drive folder configured');
                }
                const folder = await deps.driveClient.getFileMetadata(deps.folderId);
                if (folder.mimeType !== FOLDER_MIME) {
                    throw new Error(`"${folder.name}" is not a folder`);
                }
                if (folder.trashed) {
                    throw new Error(`"${folder.name}" is in the Drive trash`);
                }
                const listing = await deps.driveClient.listFiles(deps.folderId, undefined, 100);
                const count = listing.nextPageToken ? '100+' : String(listing.files.length);
                return `"${folder.name}", ${count} item(s) at the top level`;
            }
        },
        {
            name: 'Change detection',
            hint: 'Sync still works without it by listing the whole folder, only slower.',
            required: false,
            run: async () => {
                await deps.getStartPageToken();
                return 'change token received';
            }
        }
    ];

    const checks: ConnectionCheck[] = [];
    let blocked = false;

    for (const step of steps) {
        if (blocked) {
            checks.push({ name: step.name, status: 'skipped', detail: 'skipped after an earlier failure', durationMs: 0 });
            continue;
        }

        const start = Date.now();
        try {
            const detail = await step.run();
            checks.push({ name: step.name, status: 'ok', detail, durationMs: Date.now() - start });
        } catch (error) {
            checks.push({
                name: step.name,
                status: 'failed',
                detail: redact((error as Error).message || String(error)),
                hint: step.hint,
                durationMs: Date.now() - start
            });
            blocked = step.required;
        }
    }

    return checks;
}

/**
 * One line per check, e.g. "✅ Token: valid, expires in 42 min (120 ms)"
 */
export function formatConnectionCheck(check: ConnectionCheck): string {
    const icon = check.status === 'ok' ? '✅' : check.status === 'failed' ? '❌' : '⏭️';
    const duration = check.status === 'skipped' ? '' : ` (${check.durationMs} ms)`;
    return `${icon} ${check.name}: ${check.detail}${duration}`;
}
