import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ProjectConfigProvider, VscodeProjectConfigProvider } from './config';
import { comparePaths, createProjectId, normalizePath } from './pathUtils';
import { ProjectTypeDetector } from './projectTypeDetector';
import { sortProjects } from './projectSort';

export type ProjectTargetKind = 'folder' | 'workspace';
export type ProjectType =
	| 'React'
	| 'Python'
	| 'Rust'
	| 'Go'
	| 'Java'
	| '.NET'
	| 'PHP'
	| 'Ruby'
	| 'Kotlin'
	| 'Docker'
	| 'Terraform'
	| 'Monorepo'
	| 'Generic'
	| 'Workspace';

export interface Project {
	id: string;
	name: string;
	path: string;
	target: ProjectTargetKind;
	type: ProjectType;
	lastAccessed: number;
	pinned?: boolean;
	aliases?: string[];
	tags?: string[];
	collection?: string;
	stale?: boolean;
	packageManager?: string;
}

export interface ProjectSnapshot {
	version: number;
	exportedAt: string;
	savedProjects: Project[];
	historyProjects: Project[];
	pathMappings?: Record<string, string>;
}

export type ImportStrategy = 'replace' | 'merge';

export interface ImportResult {
	savedCount: number;
	historyCount: number;
}

type ProjectListKey = 'projectLauncher.savedProjects' | 'projectLauncher.historyProjects';

const SAVED_PROJECTS_KEY: ProjectListKey = 'projectLauncher.savedProjects';
const HISTORY_PROJECTS_KEY: ProjectListKey = 'projectLauncher.historyProjects';
const SNAPSHOT_VERSION = 2;
const MAX_IMPORTED_PROJECTS = 10000;
const MAX_IMPORTED_STRING_LENGTH = 4096;
const MAX_PROJECTS = 10000;
const BACKUP_SUFFIX = '.backup';

export class ProjectService {
	public constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly configProvider: ProjectConfigProvider = new VscodeProjectConfigProvider(),
		private readonly projectTypeDetector: ProjectTypeDetector = new ProjectTypeDetector()
	) {}

	public async addToSaved(targetUri: vscode.Uri): Promise<Project> {
		const project = await this.createProject(targetUri);
		return this.upsertProject(SAVED_PROJECTS_KEY, project);
	}

	public async addToHistory(targetUri: vscode.Uri): Promise<Project> {
		const project = await this.createProject(targetUri);
		return this.upsertProject(HISTORY_PROJECTS_KEY, project);
	}

	public async addExistingToHistory(project: Project): Promise<Project> {
		return this.upsertProject(HISTORY_PROJECTS_KEY, {
			...project,
			lastAccessed: Date.now(),
			pinned: false
		});
	}

	public async removeSavedProject(projectId: string): Promise<void> {
		const projects = await this.readProjects(SAVED_PROJECTS_KEY);
		const nextProjects = projects.filter((project) => project.id !== projectId);
		await this.writeProjects(SAVED_PROJECTS_KEY, nextProjects);
	}

	public async setSavedPinned(projectId: string, pinned: boolean): Promise<Project | undefined> {
		const projects = await this.readProjects(SAVED_PROJECTS_KEY);
		const projectIndex = projects.findIndex((project) => project.id === projectId);
		if (projectIndex < 0) {
			return undefined;
		}

		const updatedProject: Project = {
			...projects[projectIndex],
			pinned
		};
		projects.splice(projectIndex, 1, updatedProject);
		await this.writeProjects(SAVED_PROJECTS_KEY, projects);
		return updatedProject;
	}

	public async updateSavedTags(projectId: string, tags: string[]): Promise<Project | undefined> {
		const normalizedTags = normalizeTags(tags);
		return this.updateSavedProject(projectId, { tags: normalizedTags });
	}

	public async updateSavedCollection(projectId: string, collection: string | undefined): Promise<Project | undefined> {
		const normalizedCollection = normalizeCollection(collection);
		return this.updateSavedProject(projectId, { collection: normalizedCollection });
	}

	public async updateSavedName(projectId: string, name: string): Promise<Project | undefined> {
		const normalizedName = name.trim();
		if (normalizedName.length === 0 || normalizedName.length > MAX_IMPORTED_STRING_LENGTH) {
			throw new Error('Project name must be between 1 and 4096 characters.');
		}
		return this.updateSavedProject(projectId, { name: normalizedName });
	}

	public async updateSavedAliases(projectId: string, aliases: string[]): Promise<Project | undefined> {
		return this.updateSavedProject(projectId, { aliases: normalizeAliases(aliases) });
	}

	public async removeHistoryProject(projectId: string): Promise<void> {
		const projects = await this.readProjects(HISTORY_PROJECTS_KEY);
		const nextProjects = projects.filter((project) => project.id !== projectId);
		await this.writeProjects(HISTORY_PROJECTS_KEY, nextProjects);
	}

	public async clearHistory(): Promise<void> {
		await this.writeProjects(HISTORY_PROJECTS_KEY, []);
	}

	public async getSavedProjects(): Promise<Project[]> {
		return this.readProjects(SAVED_PROJECTS_KEY);
	}

	public async getHistoryProjects(): Promise<Project[]> {
		return this.readProjects(HISTORY_PROJECTS_KEY);
	}

	public async getCollections(): Promise<string[]> {
		const savedProjects = await this.getSavedProjects();
		const collectionSet = new Set(
			savedProjects
				.map((project) => normalizeCollection(project.collection))
				.filter((collection): collection is string => collection !== undefined)
		);

		return [...collectionSet].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
	}

	public async getAllProjectsForQuickOpen(): Promise<Array<{ section: 'saved' | 'history'; project: Project }>> {
		const savedProjects = await this.getSavedProjects();
		const historyProjects = await this.getHistoryProjects();
		const savedPathSet = new Set(savedProjects.map((project) => normalizePath(project.path)));

		return [
			...savedProjects.map((project) => ({ section: 'saved' as const, project })),
			...historyProjects
				.filter((project) => !savedPathSet.has(normalizePath(project.path)))
				.map((project) => ({ section: 'history' as const, project }))
		];
	}

	public async exportSnapshot(pathMappings?: Record<string, string>): Promise<ProjectSnapshot> {
		const savedProjects = await this.getSavedProjects();
		const historyProjects = await this.getHistoryProjects();
		return {
			version: SNAPSHOT_VERSION,
			exportedAt: new Date().toISOString(),
			savedProjects: mapSnapshotProjects(savedProjects, pathMappings),
			historyProjects: mapSnapshotProjects(historyProjects, pathMappings),
			pathMappings
		};
	}

	public async importSnapshot(
		rawSnapshot: unknown,
		strategy: ImportStrategy,
		pathMappings: Record<string, string> = {}
	): Promise<ImportResult> {
		const snapshot = parseSnapshot(rawSnapshot);
		const mappings = { ...(snapshot.pathMappings ?? {}), ...pathMappings };
		const incomingSaved = snapshot.savedProjects.map((project) => normalizeProject(remapProjectPath(project, mappings)));
		const incomingHistory = snapshot.historyProjects.map((project) => normalizeProject(remapProjectPath(project, mappings)));

		if (strategy === 'replace') {
			await this.writeProjects(SAVED_PROJECTS_KEY, incomingSaved);
			await this.writeProjects(HISTORY_PROJECTS_KEY, incomingHistory);
		} else {
			const existingSaved = await this.getSavedProjects();
			const existingHistory = await this.getHistoryProjects();
			await this.writeProjects(SAVED_PROJECTS_KEY, mergeProjects(existingSaved, incomingSaved, SAVED_PROJECTS_KEY));
			await this.writeProjects(HISTORY_PROJECTS_KEY, mergeProjects(existingHistory, incomingHistory, HISTORY_PROJECTS_KEY));
		}

		return {
			savedCount: (await this.getSavedProjects()).length,
			historyCount: (await this.getHistoryProjects()).length
		};
	}

	public async isValidProjectTarget(project: Pick<Project, 'path' | 'target'>): Promise<boolean> {
		try {
			const stat = await fs.stat(project.path);
			if (project.target === 'folder') {
				return stat.isDirectory();
			}

			return stat.isFile() && isWorkspaceFile(project.path);
		} catch (error: unknown) {
			if (isMissingPathError(error)) {
				return false;
			}

			throw error;
		}
	}

	private async updateSavedProject(projectId: string, updates: Partial<Project>): Promise<Project | undefined> {
		const projects = await this.readProjects(SAVED_PROJECTS_KEY);
		const projectIndex = projects.findIndex((project) => project.id === projectId);
		if (projectIndex < 0) {
			return undefined;
		}

		const updatedProject = normalizeProject({
			...projects[projectIndex],
			...updates
		});
		projects.splice(projectIndex, 1, updatedProject);
		await this.writeProjects(SAVED_PROJECTS_KEY, projects);
		return updatedProject;
	}

	private async createProject(targetUri: vscode.Uri): Promise<Project> {
		if (targetUri.scheme !== 'file') {
			throw new Error(`Unsupported project URI scheme: ${targetUri.scheme}`);
		}

		const resolvedPath = await fs.realpath(path.resolve(targetUri.fsPath));
		const target = await detectTargetKind(resolvedPath);
		const config = this.configProvider.getConfig();
		const projectType =
			target === 'workspace'
				? 'Workspace'
				: await this.projectTypeDetector.detect(resolvedPath, {
						maxDepth: config.maxProjectScanDepth,
						maxScanDirectories: config.maxProjectScanDirectories,
						skipDirectories: config.skipDirectories,
						useCache: config.enableTypeDetectionCache,
						cacheTtlMs: config.typeDetectionCacheTtlMs,
						projectMarkers: Object.fromEntries(
							Object.entries(config.projectMarkers ?? {}).map(([marker, type]) => [marker, parseProjectType(type, 'folder')])
						)
					});

		return normalizeProject({
			id: createProjectId(resolvedPath),
			name: inferProjectName(resolvedPath, target),
			path: resolvedPath,
			target,
			type: projectType,
			packageManager: target === 'folder' ? await detectPackageManager(resolvedPath) : undefined,
			lastAccessed: Date.now(),
			pinned: false,
			tags: [],
			collection: undefined
		});
	}

	private async upsertProject(storageKey: ProjectListKey, incomingProject: Project): Promise<Project> {
		const projects = await this.readProjects(storageKey);
		const existingIndex = projects.findIndex((project) => comparePaths(project.path, incomingProject.path));

		if (existingIndex >= 0) {
			const existingProject = projects[existingIndex];
			const updatedProject: Project = normalizeProject({
				...existingProject,
				...incomingProject,
				id: existingProject.id,
				lastAccessed: Date.now(),
				pinned: storageKey === SAVED_PROJECTS_KEY ? existingProject.pinned ?? false : false,
				tags: storageKey === SAVED_PROJECTS_KEY ? existingProject.tags : incomingProject.tags,
				collection: storageKey === SAVED_PROJECTS_KEY ? existingProject.collection : incomingProject.collection
			});

			projects.splice(existingIndex, 1, updatedProject);
			await this.writeProjects(storageKey, projects);
			return updatedProject;
		}

		let projectToInsert = normalizeProject({
			...incomingProject,
			pinned: storageKey === SAVED_PROJECTS_KEY ? incomingProject.pinned ?? false : false
		});

		if (storageKey === HISTORY_PROJECTS_KEY) {
			const savedProjects = await this.readProjects(SAVED_PROJECTS_KEY);
			const matchingSavedProject = savedProjects.find((project) => comparePaths(project.path, incomingProject.path));
			if (matchingSavedProject) {
				projectToInsert = normalizeProject({
					...projectToInsert,
					tags: matchingSavedProject.tags,
					collection: matchingSavedProject.collection
				});
			}
		}

		projects.unshift(projectToInsert);
		await this.writeProjects(storageKey, projects);
		return projectToInsert;
	}

	private async readProjects(storageKey: ProjectListKey): Promise<Project[]> {
		const rawValue = this.context.globalState.get<unknown>(storageKey, []);
		const parsedProjects = Array.isArray(rawValue) ? rawValue.map(parseStoredProject).filter(isDefined) : [];
		const canonicalProjects = await Promise.all(parsedProjects.map((project) => canonicalizeProject(project)));
		const deduplicatedProjects = deduplicateProjects(canonicalProjects);
		const constrainedProjects = this.applyListConstraints(storageKey, deduplicatedProjects);

		if (!areProjectListsEqual(parsedProjects, constrainedProjects)) {
			await this.writeProjects(storageKey, constrainedProjects);
		}

		async function canonicalizeProject(project: Project): Promise<Project> {
			try {
				return {
					...project,
					path: await fs.realpath(project.path),
					stale: false
				};
			} catch (error: unknown) {
				if (isMissingPathError(error)) {
					return { ...project, stale: true };
				}

				throw error;
			}
		}

		return constrainedProjects;
	}

	private async writeProjects(storageKey: ProjectListKey, projects: Project[]): Promise<void> {
		const nextProjects = this.applyListConstraints(storageKey, projects).slice(0, MAX_PROJECTS);
		const previous = this.context.globalState.get<unknown>(storageKey);
		if (previous !== undefined) {
			await this.context.globalState.update(`${storageKey}${BACKUP_SUFFIX}`, {
				savedAt: new Date().toISOString(),
				value: previous
			});
		}
		await this.context.globalState.update(storageKey, nextProjects);
	}

	private applyListConstraints(storageKey: ProjectListKey, projects: Project[]): Project[] {
		const normalizedProjects = projects.map((project) => normalizeProject(project));

		if (storageKey === SAVED_PROJECTS_KEY) {
			return sortProjects(normalizedProjects, 'lastAccessed', true);
		}

		const { maxHistoryEntries } = this.configProvider.getConfig();
		return sortProjects(normalizedProjects, 'lastAccessed', false).slice(0, maxHistoryEntries);
	}

}

function parseStoredProject(value: unknown): Project | undefined {
	if (!isRecord(value)) {
		return undefined;
	}

	const projectPath = typeof value.path === 'string' ? value.path : undefined;
	if (!projectPath) {
		return undefined;
	}

	const target = parseTargetKind(value.target, projectPath);
	const projectType = parseProjectType(value.type, target);
	const lastAccessed =
		typeof value.lastAccessed === 'number' && Number.isFinite(value.lastAccessed) && value.lastAccessed >= 0
			? value.lastAccessed
			: Date.now();
	const projectName =
		typeof value.name === 'string' && value.name.trim().length > 0 ? value.name : inferProjectName(projectPath, target);
	const projectId = typeof value.id === 'string' && value.id.length > 0 ? value.id : createProjectId(projectPath);

	return normalizeProject({
		id: projectId,
		name: projectName,
		path: projectPath,
		target,
		type: projectType,
		lastAccessed,
		pinned: typeof value.pinned === 'boolean' ? value.pinned : false,
		aliases: parseTags(value.aliases),
		tags: parseTags(value.tags),
		collection: normalizeCollection(typeof value.collection === 'string' ? value.collection : undefined),
		stale: typeof value.stale === 'boolean' ? value.stale : undefined,
		packageManager: typeof value.packageManager === 'string' ? value.packageManager : undefined
	});
}

function parseSnapshot(rawSnapshot: unknown): ProjectSnapshot {
	if (!isRecord(rawSnapshot)) {
		throw new Error('Invalid import file: expected a JSON object.');
	}

	if (!Array.isArray(rawSnapshot.savedProjects) || !Array.isArray(rawSnapshot.historyProjects)) {
		throw new Error('Invalid import file: savedProjects and historyProjects must be arrays.');
	}
	if (rawSnapshot.savedProjects.length > MAX_IMPORTED_PROJECTS || rawSnapshot.historyProjects.length > MAX_IMPORTED_PROJECTS) {
		throw new Error(`Invalid import file: each project list may contain at most ${MAX_IMPORTED_PROJECTS} entries.`);
	}

	const savedProjects = rawSnapshot.savedProjects.map((value, index) => parseImportedProject(value, `savedProjects[${index}]`));
	const historyProjects = rawSnapshot.historyProjects.map((value, index) =>
		parseImportedProject(value, `historyProjects[${index}]`)
	);

	return {
		version:
			typeof rawSnapshot.version === 'number' && Number.isInteger(rawSnapshot.version) && rawSnapshot.version >= 1
				? rawSnapshot.version
				: (() => {
						throw new Error('Invalid import file: version must be a positive integer.');
					})(),
		exportedAt: typeof rawSnapshot.exportedAt === 'string' ? rawSnapshot.exportedAt : new Date().toISOString(),
		savedProjects,
		historyProjects,
		pathMappings: parsePathMappings(rawSnapshot.pathMappings)
	};
}

function parsePathMappings(value: unknown): Record<string, string> | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	const mappings: Record<string, string> = {};
	for (const [from, to] of Object.entries(value)) {
		if (from.length <= MAX_IMPORTED_STRING_LENGTH && typeof to === 'string' && to.length <= MAX_IMPORTED_STRING_LENGTH) {
			mappings[from] = to;
		}
	}
	return Object.keys(mappings).length > 0 ? mappings : undefined;
}

function parseImportedProject(value: unknown, fieldName: string): Project {
	const project = parseStoredProject(value);
	if (!project) {
		throw new Error(`Invalid import file: ${fieldName} is not a valid project.`);
	}
	if (project.path.length > MAX_IMPORTED_STRING_LENGTH || project.name.length > MAX_IMPORTED_STRING_LENGTH) {
		throw new Error(`Invalid import file: ${fieldName} contains an overly long project value.`);
	}
	if (
		project.tags?.some((tag) => tag.length > MAX_IMPORTED_STRING_LENGTH) ||
		(project.collection !== undefined && project.collection.length > MAX_IMPORTED_STRING_LENGTH)
	) {
		throw new Error(`Invalid import file: ${fieldName} contains overly long tags or collection data.`);
	}

	return normalizeProject(project);
}

function mergeProjects(existing: Project[], incoming: Project[], storageKey: ProjectListKey): Project[] {
	const mergedMap = new Map<string, Project>();

	for (const project of [...existing, ...incoming]) {
		const mapKey = normalizePath(project.path);
		const existingProject = mergedMap.get(mapKey);
		if (!existingProject) {
			mergedMap.set(mapKey, normalizeProject(project));
			continue;
		}

		if (storageKey === SAVED_PROJECTS_KEY) {
			const newerProject = existingProject.lastAccessed >= project.lastAccessed ? existingProject : project;
			mergedMap.set(
				mapKey,
				normalizeProject({
					...newerProject,
					pinned: (existingProject.pinned ?? false) || (project.pinned ?? false),
					aliases: normalizeAliases([...(existingProject.aliases ?? []), ...(project.aliases ?? [])]),
					tags: Array.from(new Set([...(existingProject.tags ?? []), ...(project.tags ?? [])])),
					collection: normalizeCollection(project.collection) ?? normalizeCollection(existingProject.collection)
				})
			);
			continue;
		}

		mergedMap.set(
			mapKey,
			normalizeProject(existingProject.lastAccessed >= project.lastAccessed ? existingProject : project)
		);
	}

	return [...mergedMap.values()];
}

function deduplicateProjects(projects: Project[]): Project[] {
	const byPath = new Map<string, Project>();
	for (const project of projects) {
		const key = normalizePath(project.path);
		const current = byPath.get(key);
		if (!current || (current.stale && !project.stale)) {
			byPath.set(key, project);
		}
	}
	return [...byPath.values()];
}

async function detectTargetKind(projectPath: string): Promise<ProjectTargetKind> {
	let stat: Awaited<ReturnType<typeof fs.stat>>;
	try {
		stat = await fs.stat(projectPath);
	} catch (error: unknown) {
		if (isMissingPathError(error)) {
			throw new Error(`Project path no longer exists: ${projectPath}`);
		}

		throw error;
	}

	if (stat.isDirectory()) {
		return 'folder';
	}

	if (stat.isFile() && isWorkspaceFile(projectPath)) {
		return 'workspace';
	}

	throw new Error(`Only folders and .code-workspace files are supported: ${projectPath}`);
}

function inferProjectName(projectPath: string, target: ProjectTargetKind): string {
	if (target === 'workspace') {
		return path.basename(projectPath, '.code-workspace');
	}

	return path.basename(projectPath);
}

function isWorkspaceFile(projectPath: string): boolean {
	return projectPath.toLowerCase().endsWith('.code-workspace');
}

function normalizeProject(project: Project): Project {
	const target = parseTargetKind(project.target, project.path);
	return {
		...project,
		name: project.name.trim().length > 0 ? project.name : inferProjectName(project.path, target),
		target,
		type: parseProjectType(project.type, target),
		pinned: project.pinned ?? false,
		tags: normalizeTags(project.tags ?? []),
		aliases: normalizeAliases(project.aliases ?? []),
		collection: normalizeCollection(project.collection),
		stale: project.stale === true ? true : undefined,
		packageManager: project.packageManager?.trim() || undefined
	};
}

function normalizeTags(tags: string[]): string[] {
	return Array.from(
		new Set(
			tags
				.filter((tag): tag is string => typeof tag === 'string')
				.map((tag) => tag.trim())
				.filter((tag) => tag.length > 0)
		)
	).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

function normalizeAliases(aliases: string[]): string[] {
	return normalizeTags(aliases).slice(0, 20);
}

function parseTags(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return normalizeTags(value.filter((tag): tag is string => typeof tag === 'string'));
}

function normalizeCollection(collection: string | undefined): string | undefined {
	if (collection === undefined) {
		return undefined;
	}

	const normalizedCollection = collection.trim();
	return normalizedCollection.length > 0 ? normalizedCollection : undefined;
}

function parseTargetKind(value: unknown, projectPath: string): ProjectTargetKind {
	if (value === 'folder' || value === 'workspace') {
		return value;
	}

	return isWorkspaceFile(projectPath) ? 'workspace' : 'folder';
}

function parseProjectType(value: unknown, target: ProjectTargetKind): ProjectType {
	if (target === 'workspace') {
		return 'Workspace';
	}

	if (
		value === 'React' ||
		value === 'Python' ||
		value === 'Rust' ||
		value === 'Go' ||
		value === 'Java' ||
		value === '.NET' ||
		value === 'PHP' ||
		value === 'Ruby' ||
		value === 'Kotlin' ||
		value === 'Docker' ||
		value === 'Terraform' ||
		value === 'Monorepo' ||
		value === 'Generic'
	) {
		return value;
	}

	return 'Generic';
}

function areProjectListsEqual(left: Project[], right: Project[]): boolean {
	if (left.length !== right.length) {
		return false;
	}

	return left.every((leftProject, index) => {
		const rightProject = right[index];
		return (
			leftProject.id === rightProject.id &&
			leftProject.name === rightProject.name &&
			leftProject.path === rightProject.path &&
			leftProject.target === rightProject.target &&
			leftProject.type === rightProject.type &&
			leftProject.lastAccessed === rightProject.lastAccessed &&
			(leftProject.pinned ?? false) === (rightProject.pinned ?? false) &&
			JSON.stringify(leftProject.aliases ?? []) === JSON.stringify(rightProject.aliases ?? []) &&
			(leftProject.collection ?? '') === (rightProject.collection ?? '') &&
			JSON.stringify(leftProject.tags ?? []) === JSON.stringify(rightProject.tags ?? []) &&
			(leftProject.stale ?? false) === (rightProject.stale ?? false) &&
			(leftProject.packageManager ?? '') === (rightProject.packageManager ?? '')
		);
	});
}

function mapSnapshotProjects(projects: Project[], mappings?: Record<string, string>): Project[] {
	if (!mappings || Object.keys(mappings).length === 0) {
		return projects;
	}
	return projects.map((project) => {
		let mappedPath = project.path;
		for (const [from, to] of Object.entries(mappings)) {
			if (mappedPath === from || mappedPath.startsWith(`${from}${path.sep}`)) {
				mappedPath = `${to}${mappedPath.slice(from.length)}`;
				break;
			}
		}
		return { ...project, id: createProjectId(mappedPath), path: mappedPath };
	});
}

function remapProjectPath(project: Project, mappings: Record<string, string>): Project {
	let mappedPath = project.path;
	for (const [from, to] of Object.entries(mappings)) {
		if (mappedPath === from || mappedPath.startsWith(`${from}${path.sep}`)) {
			mappedPath = `${to}${mappedPath.slice(from.length)}`;
			break;
		}
	}
	const resolvedPath = path.resolve(mappedPath);
	return { ...project, id: createProjectId(resolvedPath), path: resolvedPath };
}

async function detectPackageManager(projectPath: string): Promise<string | undefined> {
	const markers: Array<[string, string]> = [
		['pnpm-lock.yaml', 'pnpm'],
		['yarn.lock', 'yarn'],
		['bun.lockb', 'bun'],
		['package-lock.json', 'npm'],
		['Pipfile.lock', 'pipenv'],
		['poetry.lock', 'poetry'],
		['Gemfile.lock', 'bundler'],
		['composer.lock', 'composer']
	];
	for (const [fileName, manager] of markers) {
		try {
			await fs.access(path.join(projectPath, fileName));
			return manager;
		} catch (error: unknown) {
			if (!isMissingPathError(error)) {
				throw error;
			}
		}
	}
	return undefined;
}


function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isMissingPathError(error: unknown): boolean {
	return isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === 'object' && error !== null && 'code' in error;
}

function isDefined<T>(value: T | undefined): value is T {
	return value !== undefined;
}
