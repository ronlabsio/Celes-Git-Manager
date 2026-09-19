# Contributing

Source: [github.com/ronlabsio/Celes-Git-Manager](https://github.com/ronlabsio/Celes-Git-Manager)

## Development Setup

```bash
# Clone the repository
git clone git@github.com:ronlabsio/Celes-Git-Manager.git
cd Celes-Git-Manager

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

## Releasing

CI runs on every push to `main` and on pull requests: compile, lint and the unit
suite. Releases are cut by pushing a tag, not by pushing to `main`.

```bash
# 1. bump "version" in package.json and commit it
# 2. push the branch first, so the tag points at a commit the remote already has
git push

# 3. tag and push the tag
git tag v0.1.4
git push origin v0.1.4
```

The release workflow refuses a tag whose name disagrees with `version` in
`package.json`, then packages the extension and creates a GitHub release with the
`.vsix` attached. Publishing to the Marketplace stays manual, because a published
version can never be overwritten.

### Redoing a release

A tag that already exists has to be removed from both places before it can be
recreated, and deleting it does **not** delete a release that was already
published under that name — remove the release first, or `gh release create`
fails on the duplicate.

```bash
git tag -d v0.1.4
git push origin --delete v0.1.4

# fix whatever was wrong (usually the version field), commit, then
git push
git tag v0.1.4
git push origin v0.1.4
```

Wait for CI on `main` to go green before pushing the tag: the release packages
the extension through `vscode:prepublish`, which runs compile and lint again.

## Testing

`npm run test:unit` runs the parser and service tests under Node. `npm test` runs
the integration tests inside a VS Code instance.

Both suites must pass on a machine with no git configuration at all. The temp
repositories created in `setupRepo` set their own `user.name`, `user.email` and
branch name, because a CI runner has no global identity and `init.defaultBranch`
varies by machine and git version.
