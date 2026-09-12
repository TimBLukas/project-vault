import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ProjectType } from './projectService';
import { normalizePath } from './pathUtils';

export interface ProjectTypeDetectionOptions {
	maxDepth: number;
	maxScanDirectories: number;
	skipDirectories: string[];
	useCache: boolean;
	cacheTtlMs: number;
	projectMarkers?: Record<string, ProjectType>;
}

interface DetectionCacheEntry {
	type: ProjectType;
	expiresAt: number;
}

export class ProjectTypeDetector {
	private readonly cache = new Map<string, DetectionCacheEntry>();

	public async detect(rootPath: string, options: ProjectTypeDetectionOptions): Promise<ProjectType> {
		const normalizedRootPath = normalizePath(rootPath);
		const now = Date.now();
		const cachedEntry = options.useCache ? this.cache.get(normalizedRootPath) : undefined;

		if (cachedEntry && cachedEntry.expiresAt > now) {
			return cachedEntry.type;
		}

		if (cachedEntry && cachedEntry.expiresAt <= now) {
			this.cache.delete(normalizedRootPath);
		}

		const detectedType = await detectProjectTypeWithoutCache(normalizedRootPath, options);
		if (options.useCache) {
			this.cache.set(normalizedRootPath, {
				type: detectedType,
				expiresAt: now + options.cacheTtlMs
			});
		}

		return detectedType;
	}
}

async function detectProjectTypeWithoutCache(
	rootPath: string,
	options: ProjectTypeDetectionOptions
): Promise<ProjectType> {
	const rootMarker = await detectMarkerAtDirectory(rootPath, options.projectMarkers);
	if (rootMarker !== undefined) {
		return rootMarker;
	}

	const skipDirectorySet = new Set(options.skipDirectories.map((entry) => entry.toLowerCase()));
	const queue: Array<{ directory: string; depth: number }> = [{ directory: rootPath, depth: 0 }];
	let queueIndex = 0;
	let scannedDirectories = 0;

	while (queueIndex < queue.length && scannedDirectories < options.maxScanDirectories) {
		const current = queue[queueIndex++];
		if (current === undefined || current.depth >= options.maxDepth) {
			continue;
		}

		const childDirectories = await readChildDirectories(current.directory, skipDirectorySet);

		for (const childDirectory of childDirectories) {
			scannedDirectories += 1;
			if (scannedDirectories > options.maxScanDirectories) {
				break;
			}

			const detectedMarker = await detectMarkerAtDirectory(childDirectory, options.projectMarkers);
			if (detectedMarker !== undefined) {
				return detectedMarker;
			}

			queue.push({ directory: childDirectory, depth: current.depth + 1 });
		}
	}

	return 'Generic';
}

async function detectMarkerAtDirectory(
	directoryPath: string,
	customMarkers: Record<string, ProjectType> | undefined
): Promise<ProjectType | undefined> {
	for (const [marker, type] of Object.entries(customMarkers ?? {})) {
		if (await fileExists(path.join(directoryPath, marker))) {
			return type;
		}
	}
	const packageJsonPath = path.join(directoryPath, 'package.json');
	if (await fileExists(packageJsonPath)) {
		return detectNodeProjectType(packageJsonPath);
	}

	const requirementsPath = path.join(directoryPath, 'requirements.txt');
	if (await fileExists(requirementsPath)) {
		return 'Python';
	}

	const pyprojectPath = path.join(directoryPath, 'pyproject.toml');
	if (await fileExists(pyprojectPath)) {
		return 'Python';
	}

	const cargoTomlPath = path.join(directoryPath, 'Cargo.toml');
	if (await fileExists(cargoTomlPath)) {
		return 'Rust';
	}

	const goModPath = path.join(directoryPath, 'go.mod');
	if (await fileExists(goModPath)) {
		return 'Go';
	}

	const markers: Array<[string, ProjectType]> = [
		['pom.xml', 'Java'],
		['build.gradle', 'Java'],
		['build.gradle.kts', 'Kotlin'],
		['*.csproj', '.NET'],
		['*.sln', '.NET'],
		['composer.json', 'PHP'],
		['Gemfile', 'Ruby'],
		['Dockerfile', 'Docker'],
		['docker-compose.yml', 'Docker'],
		['docker-compose.yaml', 'Docker'],
		['main.tf', 'Terraform']
	];
	for (const [marker, type] of markers) {
		if (marker.startsWith('*.')) {
			const entries = await safeReadDirectory(directoryPath);
			if (entries.some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(marker.slice(1).toLowerCase()))) {
				return type;
			}
		} else if (await fileExists(path.join(directoryPath, marker))) {
			return type;
		}
	}

	if (await fileExists(path.join(directoryPath, 'pnpm-workspace.yaml')) || await fileExists(path.join(directoryPath, 'lerna.json'))) {
		return 'Monorepo';
	}

	return undefined;
}

async function safeReadDirectory(directoryPath: string): Promise<import('node:fs').Dirent[]> {
	try {
		return await fs.readdir(directoryPath, { withFileTypes: true });
	} catch (error: unknown) {
		if (isDirectoryReadError(error)) {
			return [];
		}
		throw error;
	}
}

async function detectNodeProjectType(packageJsonPath: string): Promise<ProjectType> {
	const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
	let parsedPackage: unknown = undefined;

	try {
		parsedPackage = JSON.parse(packageJsonContent);
	} catch (error: unknown) {
		if (error instanceof SyntaxError) {
			return 'Generic';
		}

		throw error;
	}

	const dependencies = {
		...readDependencyMap(parsedPackage, 'dependencies'),
		...readDependencyMap(parsedPackage, 'devDependencies')
	};

	if (hasOwn(dependencies, 'react') || hasOwn(dependencies, 'next')) {
		return 'React';
	}

	return 'Generic';
}

function readDependencyMap(packageJson: unknown, key: 'dependencies' | 'devDependencies'): Record<string, string> {
	if (!isRecord(packageJson)) {
		return {};
	}

	const rawDependencies = packageJson[key];
	if (!isRecord(rawDependencies)) {
		return {};
	}

	const dependencies: Record<string, string> = {};
	for (const [name, version] of Object.entries(rawDependencies)) {
		if (typeof version === 'string') {
			dependencies[name] = version;
		}
	}

	return dependencies;
}

async function readChildDirectories(directoryPath: string, skipDirectories: Set<string>): Promise<string[]> {
	try {
		const entries = await fs.readdir(directoryPath, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isDirectory() && !shouldSkipDirectory(entry.name, skipDirectories))
			.map((entry) => path.join(directoryPath, entry.name));
	} catch (error: unknown) {
		if (isDirectoryReadError(error)) {
			return [];
		}

		throw error;
	}
}

function shouldSkipDirectory(directoryName: string, skipDirectories: Set<string>): boolean {
	return skipDirectories.has(directoryName.toLowerCase());
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch (error: unknown) {
		if (isDirectoryReadError(error)) {
			return false;
		}

		throw error;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isDirectoryReadError(error: unknown): boolean {
	return isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EACCES' || error.code === 'EPERM');
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === 'object' && error !== null && 'code' in error;
}

function hasOwn(record: Record<string, string>, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(record, key);
}
