# Project Vault

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript\&logoColor=white)](https://www.typescriptlang.org/)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-007ACC?logo=visual-studio-code\&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=TBL.project-vault)

Project Vault adds a dedicated Activity Bar view to manage saved projects, workspace files, collections, and recent history in VS Code.

You can find this extension in the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=TBL.project-vault).

## Version History

### 0.0.1 - Initial release

The initial release introduced the core Project Vault library:

- Save workspace folders and `.code-workspace` files.
- Track recently opened projects.
- Organize projects with pins, tags, collections, aliases, and sorting.
- Open projects in different windows, splits, or workspaces.
- Detect project types, package managers, and Git metadata.
- Run configurable terminal actions.
- Import and export project data with portable path mappings.
- Preserve and identify stale project paths.

### 0.0.2 - Project metadata and startup actions

This release adds:

- Short descriptions for saved projects, displayed in tooltips and searchable with `description:`.
- Per-project startup action selection.
- Safe startup action execution after opening a project.
- Trust checks, confirmation prompts, project compatibility filtering, and five-minute expiry for pending startup actions.


## Features

- Save the current workspace folder or `.code-workspace` file as a project.
- Auto-track opened workspace folders/files as recent history.
- Organize saved projects using **tags** and **collections**.
- Group saved projects by collection in the tree view.
- Choose sort mode: **last accessed**, **name**, **type**, or **path**.
- Open projects in multiple ways: current window, new window, split, or new workspace.
- Run configurable **custom terminal actions** per project.
- Open an integrated terminal, reveal a project in the OS file manager, or open its Git repository.
- Edit display names and aliases; search with `tag:`, `type:`, and `collection:` syntax.
- Add a short project description, shown in tooltips and searchable with `description:`.
- Configure confirmed startup actions that run after opening a saved project.
- Add your own startup commands from **Configure Startup Actions**; commands run in a terminal at the project root.
- Show Git branch, dirty state, remote, worktree, and last commit metadata.
- Detect common Java, .NET, PHP, Ruby, Kotlin, Docker, Terraform, monorepo, and package-manager markers.
- Preserve multi-root workspaces when adding the current workspace.
- Quick-open saved/history projects via command palette with fuzzy matching.
- Export and import project data as JSON, including optional `$PROJECT_ROOT` path mappings.
- Keep missing projects as clearly marked **stale** entries instead of silently deleting them.

## Security and trust

Custom project actions execute commands in an integrated terminal. They are disabled
for untrusted workspaces and require confirmation before execution. Treat commands
configured in `projectLauncher.customActions` like any other shell script: review
them before enabling or running them, especially when they come from workspace
settings.

Imports are validated and paths are resolved on the local machine. Exports use absolute paths by default. The export command can optionally replace a
selected root with `$PROJECT_ROOT`; on import, choose the local folder that should
replace that token. Missing projects remain in the library and are marked stale.
Project list updates keep a last-value backup in extension global state so a
malformed update can be recovered without silently losing data.

## Commands

- `Project Vault: Add Current Project`
- `Project Vault: Add Project from File or Folder`
- `Project Vault: Open Project`
- `Project Vault: Open in Current Window`
- `Project Vault: Open in New Window`
- `Project Vault: Open in Split`
- `Project Vault: Open in New Workspace`
- `Project Vault: Quick Open`
- `Project Vault: Remove Saved Project`
- `Project Vault: Pin Saved Project`
- `Project Vault: Unpin Saved Project`
- `Project Vault: Edit Project Tags`
- `Project Vault: Set Project Collection`
- `Project Vault: Remove History Entry`
- `Project Vault: Clear History`
- `Project Vault: Filter Projects`
- `Project Vault: Clear Project Filter`
- `Project Vault: Set Sort Mode`
- `Project Vault: Import Projects`
- `Project Vault: Export Projects`
- `Project Vault: Run Project Action`
- `Project Vault: Open Integrated Terminal`
- `Project Vault: Reveal Project in File Manager`
- `Project Vault: Edit Project Display Name`
- `Project Vault: Edit Project Aliases`
- `Project Vault: Edit Project Description`
- `Project Vault: Configure Startup Actions`
- `Project Vault: Refresh`

## Extension Settings

- `projectLauncher.maxHistoryEntries`: Maximum number of recent history entries retained.
- `projectLauncher.maxProjectScanDepth`: Maximum folder depth for project type detection.
- `projectLauncher.maxProjectScanDirectories`: Maximum number of directories scanned during detection.
- `projectLauncher.skipDirectories`: Directory names excluded from deep scanning.
- `projectLauncher.openInNewWindow`: Default behavior for `Open Project`.
- `projectLauncher.enableTypeDetectionCache`: Enable/disable project type detection cache.
- `projectLauncher.typeDetectionCacheTtlMs`: Cache lifetime for project type detection.
- `projectLauncher.sortMode`: Sort mode for tree and quick-open lists.
- `projectLauncher.groupSavedByCollection`: Group saved projects by collection.
- `projectLauncher.showGitMetadata`: Show Git metadata in tree descriptions/tooltips.
- `projectLauncher.gitMetadataCacheTtlMs`: Cache lifetime for Git metadata.
- `projectLauncher.customActions`: Custom terminal actions for projects.
- `projectLauncher.confirmStartupActions`: Ask for confirmation before running startup actions.
- `projectLauncher.projectMarkers`: Additional filename markers mapped to a
  project type.
- `projectLauncher.enableDiagnosticLogging`: Opt-in error diagnostics in the
  Project Vault output channel. No telemetry is collected.

Custom actions can also be added interactively with **Project Vault: Configure Startup Actions**.
Choose **Add custom action**, enter a label and command, and the action is saved to the
global VS Code settings. Commands may use `${projectPath}`, `${projectName}`,
`${projectType}`, `${projectTarget}`, `${projectCollection}`, and `${projectTags}`.
They run only in trusted workspaces and require confirmation.

## Import/Export Format

Exports create a JSON file with:

- `version`
- `exportedAt`
- `savedProjects`
- `historyProjects`

You can import with **merge** or **replace** strategy.

Contributions are welcome!
If you'd like to contribute to this project create a pull request!
