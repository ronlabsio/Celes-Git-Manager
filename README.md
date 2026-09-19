# Celes – Git Manager

Visual Git management inside VS Code.

Celes is a VS Code extension that provides a complete visual interface for **local Git operations**, reducing the need to type Git commands in the terminal. It does not reimplement Git — it invokes the system's `git` executable through safe subprocess calls.

## Features

- **Changes panel**: write the commit message, commit and push, and stage, unstage or discard files inline — all in one sidebar view. Files can be shown grouped by folder or as a flat list.
- **Commit editor**: a wider commit view in an editor tab, for when the sidebar is too narrow.
- **More panel**: tabs for History, Branches, Stashes and Repository Overview.
- **History**: expand any commit to see changed files (including renames); click a file to open a native side-by-side diff inside the editor.
- **Remote Operations**: fetch, pull, push, and publish a local branch to origin.
- **Branches**: list, create, checkout, rename, and safely delete local and remote branches.
- **Stashes**: create, apply, pop, and delete stashes.
- **Commit context actions**: rename the latest commit, undo the latest commit while keeping changes staged, and open the full commit diff.
- **Monorepo folder scope**: when you open a package inside a larger repository, Celes only shows changes, commits and diffs for that folder.
- **Educational UI**: every non-obvious operation is explained, and equivalent Git commands are shown when useful.
- **Humanized Errors**: Git errors are translated into clear messages while preserving raw details in the Celes output channel.

## Requirements

- Visual Studio Code 1.84 or newer.
- Git installed and available in the system PATH.

You can optionally configure a custom Git path:

```json
{
  "celes.gitPath": "/usr/local/bin/git"
}
```

### Working in a monorepo

If you open a subfolder of a repository (for example `packages/api` inside a monorepo), Celes scopes the
Changes panel, the commit history and commit file lists to that folder by default. Hovering the branch badge
shows the active scope.

```json
{
  "celes.scope": "workspace"
}
```

- `workspace` (default): only the opened folder.
- `repository`: the entire repository, even when a subfolder is opened.

You can also toggle it from the command palette with **Celes: Toggle Folder Scope**, or from the **Scope**
button in the More panel under Overview.

## Usage

1. Open a workspace that contains a Git repository.
2. Click the **Celes** icon in the Activity Bar.
3. Use the **Changes** panel to stage files, write a message and commit.
4. Expand commits in the **History** tab of the **More** panel to see changed files and open diffs.
5. Switch between History, Branches, Stashes and Overview in the **More** panel.

If the workspace is not a Git repository, Celes shows an **Initialize Repository** button that runs `git init` after confirmation.

## Development Setup

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode
npm run watch

# Run unit tests
npm run test:unit

# Run lint
npm run lint

# Package the extension
npx @vscode/vsce package
```

## Architecture

```
UI (Webviews / Commands) → GitService → GitCommandRunner → git
```

- `GitCommandRunner`: central, safe execution layer using `execFile` with argument arrays.
- `GitService`: domain operations such as commit, branch management, and stash handling.
- `Parsers`: convert raw Git output into typed models.
- `Webviews`: the Changes and More sidebar views plus the commit editor tab; they post messages to the extension host rather than running Git themselves.
- `Views`: text document content providers backing the diff editors.
- `Commands`: handle user actions from the Command Palette and the webviews.

The UI never constructs arbitrary Git commands. All user input is validated and passed as separate arguments.

## Security Considerations

- No shell string concatenation; all commands use `execFile` with an argument array.
- Destructive actions (discard, delete branch, delete stash) require explicit confirmation.
- Branch deletion uses `git branch -d` only; force delete is not implemented in v0.1.
- User-supplied paths are resolved safely against the repository root.
- Out of scope for v0.1: force push, reset --hard, clean -fd, and other destructive operations.

## Roadmap

### v0.2
- Commit graph visualization.
- Cherry-pick and revert.
- Merge and merge conflict dashboard.
- Tags manager.
- Remotes manager.

### v0.3
- Interactive rebase UI.
- Worktrees support.
- Git configuration UI.

### v0.4
- GitHub integration: authentication, pull requests, issues, repository information.

### v0.5
- GitHub Actions, workflow logs, releases, and tags/releases management.

## License

MIT
