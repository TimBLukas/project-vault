import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Integration', () => {
	test('registers project launcher commands on activation', async () => {
		const extension = vscode.extensions.all.find((entry) => entry.packageJSON?.name === 'project-vault');
		assert.ok(extension, 'Expected project-vault extension to be available in test host');

		await extension.activate();

		const commands = await vscode.commands.getCommands(true);
		const expectedCommandIds = [
			'projectLauncher.addCurrentProject',
			'projectLauncher.openProject',
			'projectLauncher.openProjectCurrentWindow',
			'projectLauncher.openProjectNewWindow',
			'projectLauncher.openProjectSplit',
			'projectLauncher.openProjectNewWorkspace',
			'projectLauncher.quickOpenProject',
			'projectLauncher.removeProject',
			'projectLauncher.pinProject',
			'projectLauncher.unpinProject',
			'projectLauncher.editProjectTags',
			'projectLauncher.setProjectCollection',
			'projectLauncher.removeHistoryProject',
			'projectLauncher.clearHistory',
			'projectLauncher.filterProjects',
			'projectLauncher.clearFilter',
			'projectLauncher.setSortMode',
			'projectLauncher.exportProjects',
			'projectLauncher.importProjects',
			'projectLauncher.runProjectAction',
			'projectLauncher.refresh'
		];

		for (const commandId of expectedCommandIds) {
			assert.ok(commands.includes(commandId), `Expected command ${commandId} to be registered`);
		}
	});

	test('refresh and clear-filter commands execute without throwing', async () => {
		await vscode.commands.executeCommand('projectLauncher.refresh');
		await vscode.commands.executeCommand('projectLauncher.clearFilter');
	});
});
