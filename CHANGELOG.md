# Changelog

## [0.1.2] - 2026-09-19

### Added
- Folder scope for monorepos: opening a package inside a larger repository now limits the Changes panel, history and commit file lists to that folder.
- New `celes.scope` setting (`workspace` | `repository`) and the **Celes: Toggle Folder Scope** command, also available from the More panel.
- Brand header with the Celes logo in the Changes and Commit panels.

### Fixed
- Commit context menu now opens on right-click in the More panel history (the menu element was missing from the markup).
- Expanded commits no longer get stuck on "Loading..." when the file list fails to load.

## [0.1.1] - 2026-09-19

### Fixed
- History: expanding a commit now shows its changed files. Commit items were created without a commit reference, so the tree never loaded children.
- History: renamed and copied files now display correctly (`R100 old -> new` format).
- History: the first (root) commit now lists files (`diff-tree --root`).
- Commit diffs: the first commit no longer fails to open a diff; an empty tree is used as the left side.

### Added
- New **Changes** tree view with Staged, Changes (unstaged), and Untracked sections rendered as an expandable folder tree.
- Inline stage/unstage/discard actions on file items and stage all/unstage all on section headers in the Changes tree.

## [0.1.0] - 2026-09-19

### Added
- Activity Bar view container for Celes.
- Overview panel showing repository name, current branch, changes summary, ahead/behind, and remote.
- Changes panel with staged, unstaged, and untracked sections.
- Stage, unstage, stage all, unstage all, discard, open file, and open diff actions.
- Commit and amend commit flows with validation and feedback.
- Fetch, pull, push, and publish branch operations.
- Branches panel with create, checkout, rename, and safe delete.
- History panel with last 50 commits and commit details.
- Stashes panel with create, apply, pop, and delete actions.
- Educational tooltips and notifications showing equivalent Git commands.
- Humanized error messages with an output channel for debugging details.
- Automatic refresh on file save, focus changes, and after Git operations.
- Unit and integration tests for parsers, GitCommandRunner, and GitService.
- README and product plan documentation.

### Security
- All Git commands executed with argument arrays via `execFile`, never shell strings.
- Destructive operations require confirmation.
- Branch deletion uses safe `git branch -d`; force delete is not implemented.
- User input validated before being passed to Git.
