import * as assert from 'assert';
import { ProjectLauncherConfig, ProjectConfigProvider } from '../config';
import { GitMetadataService } from '../gitMetadataService';
import { ProjectProvider, ProjectTreeItem } from '../projectProvider';
import { Project } from '../projectService';

class FakeProjectQueryService {
	public constructor(
		private readonly savedProjects: Project[],
		private readonly historyProjects: Project[]
	) {}

	public async getSavedProjects(): Promise<Project[]> {
		return this.savedProjects;
	}

	public async getHistoryProjects(): Promise<Project[]> {
		return this.historyProjects;
	}
}

class StaticConfigProvider implements ProjectConfigProvider {
	public constructor(private readonly config: ProjectLauncherConfig) {}

	public getConfig(): ProjectLauncherConfig {
		return this.config;
	}
}

class NoopGitMetadataService extends GitMetadataService {
	public override async getMetadata(): Promise<undefined> {
		return undefined;
	}
}

suite('ProjectProvider', () => {
	function createProject(
		id: string,
		name: string,
		type: Project['type'],
		lastAccessed: number,
		options: Partial<Project> = {}
	): Project {
		return {
			id,
			name,
			type,
			path: `/tmp/${name}`,
			target: 'folder',
			lastAccessed,
			pinned: false,
			tags: [],
			...options
		};
	}

	function createConfig(overrides: Partial<ProjectLauncherConfig> = {}): ProjectLauncherConfig {
		return {
			maxHistoryEntries: 100,
			maxProjectScanDepth: 2,
			maxProjectScanDirectories: 250,
			skipDirectories: ['node_modules', '.git'],
			openInNewWindow: false,
			enableTypeDetectionCache: true,
			typeDetectionCacheTtlMs: 300000,
			sortMode: 'lastAccessed',
			groupSavedByCollection: true,
			showGitMetadata: false,
			gitMetadataCacheTtlMs: 30000,
			customActions: [],
			...overrides
		};
	}

	function createProvider(
		savedProjects: Project[],
		historyProjects: Project[],
		configOverrides: Partial<ProjectLauncherConfig> = {}
	): ProjectProvider {
		return new ProjectProvider(
			new FakeProjectQueryService(savedProjects, historyProjects),
			new StaticConfigProvider(createConfig(configOverrides)),
			new NoopGitMetadataService()
		);
	}

	test('returns section nodes at root', async () => {
		const provider = createProvider([], []);
		const rootItems = await provider.getChildren();

		assert.strictEqual(rootItems.length, 2);
		assert.strictEqual(rootItems[0].nodeType, 'section');
		assert.strictEqual(rootItems[1].nodeType, 'section');
		assert.strictEqual(rootItems[0].section, 'saved');
		assert.strictEqual(rootItems[1].section, 'history');
	});

	test('groups saved projects by collection', async () => {
		const saved = [
			createProject('1', 'frontend-react', 'React', 20, { collection: 'Client A' }),
			createProject('2', 'service-rust', 'Rust', 10, { collection: 'Platform' }),
			createProject('3', 'misc', 'Generic', 9)
		];
		const provider = createProvider(saved, []);
		const savedSection = new ProjectTreeItem('section', 'saved');

		const groups = await provider.getChildren(savedSection);
		assert.strictEqual(groups.length, 3);
		assert.strictEqual(groups[0].nodeType, 'collection');
		assert.strictEqual(groups[0].collectionName, 'Client A');
		assert.strictEqual(groups[2].collectionName, 'Uncategorized');
	});

	test('filters projects by query across tags and collection', async () => {
		const saved = [
			createProject('1', 'frontend-react', 'React', 20, { tags: ['frontend'], collection: 'Client A' }),
			createProject('2', 'service-rust', 'Rust', 10, { tags: ['backend'], collection: 'Platform' })
		];
		const provider = createProvider(saved, [], { groupSavedByCollection: false });
		const savedSection = new ProjectTreeItem('section', 'saved');

		provider.setFilter('client a');
		const filteredByCollection = await provider.getChildren(savedSection);
		assert.strictEqual(filteredByCollection.length, 1);
		assert.strictEqual(filteredByCollection[0].project?.name, 'frontend-react');

		provider.setFilter('backend');
		const filteredByTag = await provider.getChildren(savedSection);
		assert.strictEqual(filteredByTag.length, 1);
		assert.strictEqual(filteredByTag[0].project?.name, 'service-rust');
	});

	test('filters projects by description syntax', async () => {
		const saved = [
			createProject('1', 'frontend', 'React', 20, { description: 'Customer portal' }),
			createProject('2', 'service', 'Rust', 10, { description: 'Internal API' })
		];
		const provider = createProvider(saved, [], { groupSavedByCollection: false });
		provider.setFilter('description:portal');
		const results = await provider.getChildren(new ProjectTreeItem('section', 'saved'));
		assert.strictEqual(results.length, 1);
		assert.strictEqual(results[0].project?.name, 'frontend');
	});

	test('applies dedicated context values for pinned and unpinned saved projects', () => {
		const pinnedProjectItem = new ProjectTreeItem(
			'project',
			'saved',
			createProject('saved-1', 'alpha', 'React', Date.now(), { pinned: true })
		);
		const unpinnedProjectItem = new ProjectTreeItem(
			'project',
			'saved',
			createProject('saved-2', 'beta', 'Python', Date.now(), { pinned: false })
		);

		assert.strictEqual(pinnedProjectItem.contextValue, 'project.saved.pinned');
		assert.strictEqual(unpinnedProjectItem.contextValue, 'project.saved.unpinned');
	});
});
