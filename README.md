# Project Launcher

Project Launcher adds a dedicated Activity Bar view to manage saved projects, workspace files, collections, and recent history.
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
- `Project Launcher: Add Current Project`
- `Project Launcher: Add Project from File or Folder`
- `Project Launcher: Open Project`
- `Project Launcher: Open in Current Window`
- `Project Launcher: Open in New Window`
- `Project Launcher: Open in Split`
- `Project Launcher: Open in New Workspace`
- `Project Launcher: Quick Open`
- `Project Launcher: Remove Saved Project`
- `Project Launcher: Pin Saved Project`
- `Project Launcher: Unpin Saved Project`
- `Project Launcher: Edit Project Tags`
- `Project Launcher: Set Project Collection`
- `Project Launcher: Remove History Entry`
- `Project Launcher: Clear History`
- `Project Launcher: Filter Projects`
- `Project Launcher: Clear Project Filter`
- `Project Launcher: Set Sort Mode`
- `Project Launcher: Import Projects`
- `Project Launcher: Export Projects`
- `Project Launcher: Run Project Action`
- `Project Launcher: Open Integrated Terminal`
- `Project Launcher: Reveal Project in File Manager`
- `Project Launcher: Edit Project Display Name`
- `Project Launcher: Edit Project Aliases`
- `Project Launcher: Refresh`

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
  Project Launcher output channel. No telemetry is collected.

## Import/Export Format

Exports create a JSON file with:
- `version`
- `exportedAt`
- `savedProjects`
- `historyProjects`

You can import with **merge** or **replace** strategy.

## Development

```bash
npm ci
npm run compile
npm run lint
npm test
```

Create a VSIX package:

```bash
npm run package:vsix
```

Install the generated VSIX locally with:

```bash
code --install-extension project-launcher-0.0.1.vsix
```

You can also use **Extensions: Install from VSIX...** from the VS Code Command
Palette. The extension requires VS Code 1.137 or newer.
