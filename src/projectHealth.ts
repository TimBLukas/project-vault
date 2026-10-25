import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Project } from './projectService';
import { ProjectLauncherCustomAction } from './config';

export type ProjectHealthStatus = 'healthy' | 'warning' | 'critical';

export interface ProjectHealthIssue {
	code: 'missing-path' | 'invalid-workspace' | 'missing-package-manager-file' | 'missing-startup-action';
	message: string;
}

export interface ProjectHealth {
	status: ProjectHealthStatus;
	issues: ProjectHealthIssue[];
}

export interface ProjectHealthOptions {
	customActions: ProjectLauncherCustomAction[];
}

const packageManagerMarkers: Record<string, string[]> = {
	npm: ['package-lock.json'],
	pnpm: ['pnpm-lock.yaml'],
	yarn: ['yarn.lock'],
	bun: ['bun.lockb'],
	pipenv: ['Pipfile.lock'],
	poetry: ['poetry.lock'],
	bundler: ['Gemfile.lock'],
	composer: ['composer.lock']
};

export class ProjectHealthService {
	public async getHealth(project: Project, options: ProjectHealthOptions): Promise<ProjectHealth> {
		const issues: ProjectHealthIssue[] = [];
		const targetValid = await this.isValidTarget(project);
		if (!targetValid) {
			issues.push({
				code: project.target === 'workspace' ? 'invalid-workspace' : 'missing-path',
				message:
					project.target === 'workspace'
						? 'Workspace file is missing or invalid.'
						: 'Project folder is missing or inaccessible.'
			});
			return { status: 'critical', issues };
		}

		if (project.packageManager && project.target === 'folder') {
			const markers = packageManagerMarkers[project.packageManager];
			if (markers && !(await hasAnyFile(project.path, markers))) {
				issues.push({
					code: 'missing-package-manager-file',
					message: `Expected ${project.packageManager} lockfile was not found.`
				});
			}
		}

		const configuredActionIds = new Set(options.customActions.map((action) => action.id ?? action.label));
		for (const actionId of project.startupActions ?? []) {
			if (!configuredActionIds.has(actionId)) {
				issues.push({
					code: 'missing-startup-action',
					message: `Startup action "${actionId}" is no longer configured.`
				});
			}
		}

		return { status: issues.length > 0 ? 'warning' : 'healthy', issues };
	}

	public async isValidTarget(project: Pick<Project, 'path' | 'target'>): Promise<boolean> {
		try {
			const stat = await fs.stat(project.path);
			if (project.target === 'folder') {
				return stat.isDirectory();
			}

			if (!stat.isFile() || !project.path.toLowerCase().endsWith('.code-workspace')) {
				return false;
			}

			const content = await fs.readFile(project.path, 'utf8');
			const parsed = JSON.parse(stripJsonComments(content).replace(/,\s*([}\]])/g, '$1')) as unknown;
			return isWorkspaceDocument(parsed);
		} catch {
			return false;
		}
	}
}

function isWorkspaceDocument(value: unknown): boolean {
	if (!isRecord(value) || !Array.isArray(value.folders)) {
		return false;
	}

	return value.folders.every((folder) => isRecord(folder) && typeof folder.path === 'string' && folder.path.trim().length > 0);
}

async function hasAnyFile(directory: string, fileNames: string[]): Promise<boolean> {
	for (const fileName of fileNames) {
		try {
			const stat = await fs.stat(path.join(directory, fileName));
			if (stat.isFile()) {
				return true;
			}
		} catch {
			// A missing marker is expected while checking project health.
		}
	}
	return false;
}

function stripJsonComments(value: string): string {
	return value.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
