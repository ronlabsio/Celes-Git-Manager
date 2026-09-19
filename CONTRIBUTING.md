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

## Testing

`npm run test:unit` runs the parser and service tests under Node. `npm test` runs
the integration tests inside a VS Code instance.

The UI never constructs arbitrary Git commands: user input is validated and passed
to `execFile` as separate arguments. Keep it that way when adding operations.
