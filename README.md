# jupyterlab_commands_toolkit

[![Github Actions Status](https://github.com/jupyter-ai-contrib/jupyterlab-commands-toolkit/workflows/Build/badge.svg)](https://github.com/jupyter-ai-contrib/jupyterlab-commands-toolkit/actions/workflows/build.yml)

A Jupyter extension that provides an AI toolkit for JupyterLab commands.

This extension is composed of a Python package named `jupyterlab_commands_toolkit`
for the server extension and a NPM package named `jupyterlab-commands-toolkit`
for the frontend extension.

## Features

- **Command Discovery**: List all available JupyterLab commands with their metadata
- **Command Execution**: Execute any JupyterLab command programmatically from Python

## Requirements

- JupyterLab >= 4.5.0a3

## Install

To install the extension, execute:

```bash
pip install jupyterlab_commands_toolkit
```

## Usage

Use the toolkit to execute any JupyterLab command from Python:

```python
import asyncio
from jupyterlab_commands_toolkit.tools import execute_command, list_all_commands

# Execute a command (requires running in an async context)
async def main():
    # List all available commands
    commands = await list_all_commands()

    # Toggle the file browser
    result = await execute_command("filebrowser:toggle-main")

    # Run notebook cells
    result = await execute_command("notebook:run-all-cells")

# Run in JupyterLab environment
asyncio.run(main())
```

For a full list of available commands in JupyterLab, refer to the [JupyterLab Command Registry documentation](https://jupyterlab.readthedocs.io/en/latest/user/commands.html#commands-list).

## Uninstall

To remove the extension, execute:

```bash
pip uninstall jupyterlab_commands_toolkit
```

## Troubleshoot

If you are seeing the frontend extension, but it is not working, check
that the server extension is enabled:

```bash
jupyter server extension list
```

If the server extension is installed and enabled, but you are not seeing
the frontend extension, check the frontend extension is installed:

```bash
jupyter labextension list
```

## Contributing

### Development install

Note: You will need NodeJS to build the extension package.

The `jlpm` command is JupyterLab's pinned version of
[yarn](https://yarnpkg.com/) that is installed with JupyterLab. You may use
`yarn` or `npm` in lieu of `jlpm` below.

```bash
# Clone the repo to your local environment
# Change directory to the jupyterlab_commands_toolkit directory
# Install package in development mode
pip install -e "."
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Server extension must be manually installed in develop mode
jupyter server extension enable jupyterlab_commands_toolkit
# Rebuild extension Typescript source after making changes
jlpm build
```

You can watch the source directory and run JupyterLab at the same time in different terminals to watch for changes in the extension's source and automatically rebuild the extension.

```bash
# Watch the source directory in one terminal, automatically rebuilding when needed
jlpm watch
# Run JupyterLab in another terminal
jupyter lab
```

With the watch command running, every saved change will immediately be built locally and available in your running JupyterLab. Refresh JupyterLab to load the change in your browser (you may need to wait several seconds for the extension to be rebuilt).

By default, the `jlpm build` command generates the source maps for this extension to make it easier to debug using the browser dev tools. To also generate source maps for the JupyterLab core extensions, you can run the following command:

```bash
jupyter lab build --minimize=False
```

### Development uninstall

```bash
# Server extension must be manually disabled in develop mode
jupyter server extension disable jupyterlab_commands_toolkit
pip uninstall jupyterlab_commands_toolkit
```

In development mode, you will also need to remove the symlink created by `jupyter labextension develop`
command. To find its location, you can run `jupyter labextension list` to figure out where the `labextensions`
folder is located. Then you can remove the symlink named `jupyterlab-commands-toolkit` within that folder.

### Packaging the extension

See [RELEASE](RELEASE.md)
