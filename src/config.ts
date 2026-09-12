import * as vscode from 'vscode';
import { ProjectSortMode } from './projectSort';

export interface ProjectLauncherCustomAction {
	label: string;
	command: string;
	projectTypes?: string[];
	targetKinds?: string[];
}

export interface ProjectLauncherConfig {
	maxHistoryEntries: number;
	maxProjectScanDepth: number;
	maxProjectScanDirectories: number;
	skipDirectories: string[];
	openInNewWindow: boolean;
	enableTypeDetectionCache: boolean;
	typeDetectionCacheTtlMs: number;
	sortMode: ProjectSortMode;
	groupSavedByCollection: boolean;
	showGitMetadata: boolean;
	gitMetadataCacheTtlMs: number;
	customActions: ProjectLauncherCustomAction[];
	enableDiagnosticLogging?: boolean;
	projectMarkers?: Record<string, string>;
}

export interface ProjectConfigProvider {
	getConfig(): ProjectLauncherConfig;
}

export class VscodeProjectConfigProvider implements ProjectConfigProvider {
	public getConfig(): ProjectLauncherConfig {
		const configuration = vscode.workspace.getConfiguration('projectLauncher');

		return {
			maxHistoryEntries: readNumberSetting(configuration, 'maxHistoryEntries', 100, 1, 5000),
			maxProjectScanDepth: readNumberSetting(configuration, 'maxProjectScanDepth', 2, 0, 8),
			maxProjectScanDirectories: readNumberSetting(configuration, 'maxProjectScanDirectories', 250, 1, 10000),
			skipDirectories: readDirectoryList(configuration, 'skipDirectories', defaultSkipDirectories()),
			openInNewWindow: configuration.get<boolean>('openInNewWindow', false),
			enableTypeDetectionCache: configuration.get<boolean>('enableTypeDetectionCache', true),
			typeDetectionCacheTtlMs: readNumberSetting(configuration, 'typeDetectionCacheTtlMs', 300000, 1000, 3600000),
			sortMode: readSortMode(configuration, 'sortMode', 'lastAccessed'),
			groupSavedByCollection: configuration.get<boolean>('groupSavedByCollection', true),
			showGitMetadata: configuration.get<boolean>('showGitMetadata', true),
			gitMetadataCacheTtlMs: readNumberSetting(configuration, 'gitMetadataCacheTtlMs', 30000, 1000, 300000),
			customActions: readCustomActions(configuration, 'customActions', defaultCustomActions())
			,enableDiagnosticLogging: configuration.get<boolean>('enableDiagnosticLogging', false)
			,projectMarkers: readProjectMarkers(configuration)
		};
	}

}

function readProjectMarkers(configuration: vscode.WorkspaceConfiguration): Record<string, string> {
	const rawValue = configuration.get<unknown>('projectMarkers', {});
	if (!isRecord(rawValue)) {
		return {};
	}
	const markers: Record<string, string> = {};
	for (const [marker, type] of Object.entries(rawValue).slice(0, 50)) {
		if (/^[\w.*-]{1,120}$/.test(marker) && typeof type === 'string' && type.trim().length > 0) {
			markers[marker] = type.trim().slice(0, 40);
		}
	}
	return markers;
}

function readNumberSetting(
	configuration: vscode.WorkspaceConfiguration,
	key: string,
	fallback: number,
	min: number,
	max: number
): number {
	const rawValue = configuration.get<unknown>(key, fallback);
	if (typeof rawValue !== 'number' || Number.isNaN(rawValue)) {
		return fallback;
	}

	return Math.min(max, Math.max(min, Math.floor(rawValue)));
}

function readDirectoryList(
	configuration: vscode.WorkspaceConfiguration,
	key: string,
	fallback: string[]
): string[] {
	const rawValue = configuration.get<unknown>(key, fallback);
	if (!Array.isArray(rawValue)) {
		return fallback;
	}

	const normalized = rawValue
		.filter((entry): entry is string => typeof entry === 'string')
		.map((entry) => entry.trim().toLowerCase())
		.filter((entry) => entry.length > 0);

	return normalized.length > 0 ? Array.from(new Set(normalized)) : fallback;
}

function readSortMode(
	configuration: vscode.WorkspaceConfiguration,
	key: string,
	fallback: ProjectSortMode
): ProjectSortMode {
	const rawValue = configuration.get<unknown>(key, fallback);
	if (rawValue === 'lastAccessed' || rawValue === 'name' || rawValue === 'type' || rawValue === 'path') {
		return rawValue;
	}

	return fallback;
}

function readCustomActions(
	configuration: vscode.WorkspaceConfiguration,
	key: string,
	fallback: ProjectLauncherCustomAction[]
): ProjectLauncherCustomAction[] {
	const rawValue = configuration.get<unknown>(key, fallback);
	if (!Array.isArray(rawValue)) {
		return fallback;
	}

	const parsedActions: ProjectLauncherCustomAction[] = [];
	for (const entry of rawValue.slice(0, 50)) {
		const action = parseCustomAction(entry);
		if (action !== undefined) {
			parsedActions.push(action);
		}
	}

	return parsedActions.length > 0 ? parsedActions : fallback;
}

function parseCustomAction(value: unknown): ProjectLauncherCustomAction | undefined {
	if (!isRecord(value)) {
		return undefined;
	}

	const rawLabel = value.label;
	const rawCommand = value.command;
	if (typeof rawLabel !== 'string' || rawLabel.trim().length === 0) {
		return undefined;
	}
	if (typeof rawCommand !== 'string' || rawCommand.trim().length === 0) {
		return undefined;
	}
	if (rawLabel.length > 120 || rawCommand.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(rawCommand)) {
		return undefined;
	}

	return {
		label: rawLabel.trim().slice(0, 120),
		command: rawCommand.trim().slice(0, 2000),
		projectTypes: toOptionalStringArray(value.projectTypes)?.slice(0, 20),
		targetKinds: toOptionalStringArray(value.targetKinds)?.slice(0, 10)
	};
}

function toOptionalStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}

	const normalized = value
		.filter((entry): entry is string => typeof entry === 'string')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
		.map((entry) => entry.slice(0, 80));

	return normalized.length > 0 ? normalized : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function defaultSkipDirectories(): string[] {
	return ['node_modules', '.git', 'dist', 'build', '.venv', 'venv', '.next', 'target'];
}

function defaultCustomActions(): ProjectLauncherCustomAction[] {
	return [
		{
			label: 'npm: dev',
			command: 'npm run dev',
			targetKinds: ['folder']
		},
		{
			label: 'npm: test',
			command: 'npm test',
			targetKinds: ['folder']
		}
	];
}
