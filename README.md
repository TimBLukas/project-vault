# Project Vault

Project Vault adds a dedicated Activity Bar view to manage saved projects, workspace files, collections, and recent history.
(in vs code)

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
- `projectLauncher.projectMarkers`: Additional filename markers mapped to a
  project type.
- `projectLauncher.enableDiagnosticLogging`: Opt-in error diagnostics in the
  Project Vault output channel. No telemetry is collected.

## Import/Export Format

Exports create a JSON file with:

- `version`
- `exportedAt`
- `savedProjects`
- `historyProjects`

You can import with **merge** or **replace** strategy.
