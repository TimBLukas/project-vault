import * as vscode from 'vscode';
import { ProjectConfigProvider, VscodeProjectConfigProvider } from './config';
import { GitMetadata, GitMetadataService } from './gitMetadataService';
import { sortProjects } from './projectSort';
import { Project } from './projectService';

type ProjectSection = 'saved' | 'history';
const UNCATEGORIZED_COLLECTION = 'Uncategorized';

export interface ProjectQueryService {
	getSavedProjects(): Promise<Project[]>;
	getHistoryProjects(): Promise<Project[]>;
}

interface ProjectDisplayEntry {
	project: Project;
	gitMetadata: GitMetadata | undefined;
}

export class ProjectTreeItem extends vscode.TreeItem {
	public constructor(
		public readonly nodeType: 'section' | 'collection' | 'project',
		public readonly section: ProjectSection,
		public readonly project?: Project,
		public readonly collectionName?: string,
		public readonly gitMetadata?: GitMetadata
	) {
		super(
			resolveLabel(nodeType, section, project, collectionName),
			nodeType === 'project' ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Expanded
		);

		if (nodeType === 'section') {
			this.contextValue = section === 'saved' ? 'section.saved' : 'section.history';
			this.iconPath = new vscode.ThemeIcon(section === 'saved' ? 'briefcase' : 'history');
			return;
		}

		if (nodeType === 'collection') {
			this.contextValue = 'collection.saved';
			this.iconPath = new vscode.ThemeIcon('folder-library');
			return;
		}

		if (!project) {
			throw new Error('Project tree item requires project data.');
		}

		this.contextValue =
			section === 'saved' ? (project.pinned ? 'project.saved.pinned' : 'project.saved.unpinned') : 'project.history';
		this.iconPath = projectIcon(project, section);
		this.description = projectDescription(project, gitMetadata);
		this.tooltip = projectTooltip(project, gitMetadata);
		this.command = {
			command: 'projectLauncher.openProject',
			title: 'Open Project',
			arguments: [this]
		};
	}
}

export class ProjectProvider implements vscode.TreeDataProvider<ProjectTreeItem>, vscode.Disposable {
	private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ProjectTreeItem | undefined | void>();
	private readonly disposables: vscode.Disposable[] = [this.onDidChangeTreeDataEmitter];
	private filterQuery: string | undefined;

	public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

	public constructor(
		private readonly projectService: ProjectQueryService,
		private readonly configProvider: ProjectConfigProvider = new VscodeProjectConfigProvider(),
		private readonly gitMetadataService: GitMetadataService = new GitMetadataService()
	) {}

	public dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}

	public refresh(): void {
		this.onDidChangeTreeDataEmitter.fire();
	}

	public setFilter(filterQuery: string | undefined): void {
		const normalizedQuery = normalizeFilterQuery(filterQuery);
		if (this.filterQuery === normalizedQuery) {
			return;
		}

		this.filterQuery = normalizedQuery;
		this.refresh();
	}

	public clearFilter(): void {
		this.setFilter(undefined);
	}

	public getFilter(): string | undefined {
		return this.filterQuery;
	}

	public async getChildren(element?: ProjectTreeItem): Promise<ProjectTreeItem[]> {
		if (!element) {
			return [new ProjectTreeItem('section', 'saved'), new ProjectTreeItem('section', 'history')];
		}

		if (element.nodeType === 'section') {
			return this.getSectionChildren(element.section);
		}

		if (element.nodeType === 'collection') {
			return this.getSavedCollectionChildren(element.collectionName);
		}

		return [];
	}

	public getTreeItem(element: ProjectTreeItem): vscode.TreeItem {
		return element;
	}

	private async getSectionChildren(section: ProjectSection): Promise<ProjectTreeItem[]> {
		const config = this.configProvider.getConfig();
		const projects = await this.getVisibleSortedProjects(section);

		if (section === 'saved' && config.groupSavedByCollection) {
			const collections = Array.from(
				new Set(
					projects.map((project) =>
						project.collection && project.collection.trim().length > 0
							? project.collection
							: UNCATEGORIZED_COLLECTION
					)
				)
			).sort((left, right) => {
				if (left === UNCATEGORIZED_COLLECTION) {
					return 1;
				}
				if (right === UNCATEGORIZED_COLLECTION) {
					return -1;
				}

				return left.localeCompare(right, undefined, { sensitivity: 'base' });
			});

			return collections.map((collectionName) => new ProjectTreeItem('collection', 'saved', undefined, collectionName));
		}

		const displayEntries = await this.getDisplayEntries(projects);
		return displayEntries.map(
			(entry) => new ProjectTreeItem('project', section, entry.project, undefined, entry.gitMetadata)
		);
	}

	private async getSavedCollectionChildren(collectionName: string | undefined): Promise<ProjectTreeItem[]> {
		if (!collectionName) {
			return [];
		}

		const projects = (await this.getVisibleSortedProjects('saved')).filter(
			(project) => normalizeCollectionName(project.collection) === collectionName
		);
		const displayEntries = await this.getDisplayEntries(projects);
		return displayEntries.map(
			(entry) => new ProjectTreeItem('project', 'saved', entry.project, collectionName, entry.gitMetadata)
		);
	}

	private async getVisibleSortedProjects(section: ProjectSection): Promise<Project[]> {
		const config = this.configProvider.getConfig();
		const projects = section === 'saved' ? await this.projectService.getSavedProjects() : await this.projectService.getHistoryProjects();
		const visibleProjects = applyProjectFilter(projects, this.filterQuery);
		return sortProjects(visibleProjects, config.sortMode, section === 'saved');
	}

	private async getDisplayEntries(projects: Project[]): Promise<ProjectDisplayEntry[]> {
		const config = this.configProvider.getConfig();
		if (!config.showGitMetadata) {
			return projects.map((project) => ({ project, gitMetadata: undefined }));
		}

		return Promise.all(
			projects.map(async (project) => ({
				project,
				gitMetadata: await this.gitMetadataService.getMetadata(project, config.gitMetadataCacheTtlMs)
			}))
		);
	}
}

function resolveLabel(
	nodeType: ProjectTreeItem['nodeType'],
	section: ProjectSection,
	project?: Project,
	collectionName?: string
): string {
	if (nodeType === 'section') {
		return section === 'saved' ? 'Saved Projects' : 'Recent History';
	}

	if (nodeType === 'collection') {
		return collectionName ?? UNCATEGORIZED_COLLECTION;
	}

	return project?.name ?? '';
}

function projectIcon(project: Project, section: ProjectSection): vscode.ThemeIcon {
	if (section === 'saved' && project.pinned) {
		return new vscode.ThemeIcon('star-full');
	}

	return new vscode.ThemeIcon(project.target === 'workspace' ? 'files' : 'folder');
}

function projectDescription(project: Project, gitMetadata: GitMetadata | undefined): string {
	const details: string[] = [
		project.type,
		project.target === 'workspace' ? 'workspace' : 'folder'
	];

	if (project.collection) {
		details.push(project.collection);
	}

	if (project.tags && project.tags.length > 0) {
		details.push(project.tags.map((tag) => `#${tag}`).join(' '));
	}
	if (project.aliases && project.aliases.length > 0) {
		details.push(`aka ${project.aliases.join(', ')}`);
	}
	if (project.packageManager) {
		details.push(project.packageManager);
	}
	if (project.stale) {
		details.unshift('STALE PATH');
	}

	if (gitMetadata) {
		details.push(formatGitDescription(gitMetadata));
	}

	details.push(project.path);
	return details.join(' • ');
}

function projectTooltip(project: Project, gitMetadata: GitMetadata | undefined): string {
	const lines = [
		project.name,
		project.path,
		`Type: ${project.type}`,
		`Target: ${project.target}`,
		`Pinned: ${project.pinned ? 'yes' : 'no'}`,
		`Collection: ${project.collection ?? 'none'}`,
		`Tags: ${(project.tags ?? []).join(', ') || 'none'}`,
		`Aliases: ${(project.aliases ?? []).join(', ') || 'none'}`,
		`Status: ${project.stale ? 'path missing' : 'available'}`,
		`Last accessed: ${new Date(project.lastAccessed).toLocaleString()}`
	];

	if (gitMetadata) {
		lines.push(`Git: ${formatGitDescription(gitMetadata)}`);
		lines.push(`Git root: ${gitMetadata.repositoryRoot}`);
		if (gitMetadata.remote) {
			lines.push(`Git remote: ${gitMetadata.remote}`);
		}
	}

	return lines.join('\n');
}

function formatGitDescription(gitMetadata: GitMetadata): string {
	const dirtySuffix = gitMetadata.dirty ? '*' : '';
	const worktreeSuffix = gitMetadata.worktree ? ' worktree' : '';
	return `${gitMetadata.branch}${dirtySuffix}${worktreeSuffix} (${gitMetadata.lastCommit})`;
}

function normalizeFilterQuery(filterQuery: string | undefined): string | undefined {
	if (filterQuery === undefined) {
		return undefined;
	}

	const normalizedValue = filterQuery.trim().toLowerCase();
	return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function applyProjectFilter(projects: Project[], filterQuery: string | undefined): Project[] {
	if (!filterQuery) {
		return projects;
	}

	return projects.filter((project) => projectMatchesFilter(project, filterQuery));
}

function projectMatchesFilter(project: Project, filterQuery: string): boolean {
	const syntaxMatch = /^(tag|type|collection):(.+)$/i.exec(filterQuery);
	if (syntaxMatch) {
		const value = syntaxMatch[2].trim();
		switch (syntaxMatch[1].toLowerCase()) {
			case 'tag':
				return (project.tags ?? []).some((tag) => tag.toLowerCase().includes(value));
			case 'type':
				return project.type.toLowerCase().includes(value);
			case 'collection':
				return (project.collection ?? '').toLowerCase().includes(value);
		}
	}
	return (
		project.name.toLowerCase().includes(filterQuery) ||
		(project.aliases ?? []).some((alias) => alias.toLowerCase().includes(filterQuery)) ||
		project.path.toLowerCase().includes(filterQuery) ||
		project.type.toLowerCase().includes(filterQuery) ||
		(project.collection ?? '').toLowerCase().includes(filterQuery) ||
		(project.tags ?? []).some((tag) => tag.toLowerCase().includes(filterQuery))
	);
}

function normalizeCollectionName(collection: string | undefined): string {
	if (!collection || collection.trim().length === 0) {
		return UNCATEGORIZED_COLLECTION;
	}

	return collection;
}
