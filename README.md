# Celes – Git Manager

**Git scoped to the package you are working on.** A visual Git panel for VS Code, built for monorepos.

## The problem

You open `packages/api` to work on one service. Every Git tool in the editor still shows you the whole
repository: 40 changed files from four other packages, a history where your commits are buried under
everyone else's, and a commit box that happily includes files you never looked at.

Celes scopes the panel to the folder you opened. Changes, history and commit file lists show that package
and nothing else.

## What scoping actually covers

- **Changes**: only files under the opened folder. Stage All and Unstage All stay inside it too.
- **History**: `git log` filtered to commits that touched the folder, so the list is your package's history.
- **Commit files and diffs**: expanding a commit lists only the files in your scope.
- **Commit safety**: `git commit` always takes the whole index, which is exactly how a file from another
  package rides along invisibly. Celes detects anything staged outside the scope and asks before committing
  it, naming the files.

Scoping is on by default whenever the opened folder is below the repository root. It turns itself off when
you open the repository root, so a single-package repo behaves like any other Git client.

```json
{
  "celes.scope": "workspace"
}
```

- `workspace` (default): only the opened folder.
- `repository`: the entire repository, even when a subfolder is opened.

Toggle it from the command palette with **Celes: Toggle Folder Scope**, or from the **Scope** button in the
More panel under Overview. Hovering the branch badge shows the active scope.

## Everything else it does

Scoping is the reason Celes exists, but you still need the rest of the daily loop in the same panel:

- **Changes panel**: write the message, commit and push, and stage, unstage or discard files inline. Files
  can be grouped by folder or listed flat.
- **Commit editor**: a wider commit view in an editor tab, for when the sidebar is too narrow.
- **History**: expand any commit to see changed files (including renames); click one for a native
  side-by-side diff.
- **Branches**: list, create, checkout, rename and safely delete local and remote branches.
- **Stashes**: create, apply, pop and delete. Celes verifies the stash still is the one you selected before
  acting, because `stash@{n}` shifts when the list changes.
- **Remote operations**: fetch, pull, push, and publish a local branch to origin.
- **Commit actions**: rename or undo the latest commit, and open the full commit diff. Both refuse to run
  when the commit you picked is not actually the latest one on the branch.
- **Humanized errors**: Git errors become readable messages, with the raw output kept in the Celes output
  channel.

Celes does not reimplement Git. It invokes the system's `git` executable through argument arrays, never a
shell string.

## Requirements

- Visual Studio Code 1.84 or newer.
- Git installed and available in the system PATH.

You can optionally configure a custom Git path:

```json
{
  "celes.gitPath": "/usr/local/bin/git"
}
```

## Usage

1. Open a workspace that contains a Git repository.
2. Click the **Celes** icon in the Activity Bar.
3. Use the **Changes** panel to stage files, write a message and commit.
4. Expand commits in the **History** tab of the **More** panel to see changed files and open diffs.
5. Switch between History, Branches, Stashes and Overview in the **More** panel.

If the workspace is not a Git repository, Celes shows an **Initialize Repository** button that runs `git init` after confirmation.

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup and the internal architecture.

## License

MIT
