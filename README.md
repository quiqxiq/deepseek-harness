# DeepSeek Harness

English | [中文](README.zh.md)

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

It is built on an **everything-is-a-plugin** architecture and powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Documentation: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## Developer preview

DeepSeek Harness is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

Review the [safety notice](SAFETY.md) before running the project.

## Run

### Run from `npm`

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh web
```

The command starts the Web UI at `http://127.0.0.1:3080` by default and opens it in the default browser for a local launch. An SSH launch only prints the host URL because the SSH client or editor owns the local forwarded address. Pass `--no-open` to run the server without opening a browser. See [Web UI guide](docs/user/guide/index.md).

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` prepares the repository artifacts. `pnpm dsh web` uses those built artifacts without rebuilding.

### Network operations profile

This checkout ships a first-class `netops` profile. It replaces the coding preset with a network-operations assistant, keeps chat, device workspaces, files, and the SSH terminal, and removes coding, document, feedback, and automation chrome:

```sh
pnpm start:netops
```

The profile mounts `@deepseek-ai/dsh-netops-app` over the web surface. Connection facts come from environment variables:

| Variable | Purpose | Default |
|---|---|---|
| `POLYGLOT_API_URL` | Polyglot HTTP API base URL | `http://127.0.0.1:8080` |
| `POLYGLOT_WS_URL` | Device console WebSocket base URL | derived from the API URL |
| `POLYGLOT_API_TOKEN` | Inventory bearer token | none |
| `POLYGLOT_MCP_URL` | MCP endpoint | `<api>/mcp` |
| `POLYGLOT_MCP_TOKEN` | MCP bearer token | none |
| `POLYGLOT_WS_TOKEN` | Device console token | the MCP token |

The Polyglot MCP server name becomes the `mcp__polyglot__<tool>` tool namespace. One optional second MCP server can be configured with `NETOPS_MCP_URL`, `NETOPS_MCP_SERVER_NAME`, and `NETOPS_MCP_TOKEN`.

Device workspaces are adopted from the inventory picker. Each keeps its artifacts under `$DSH_HOME/devices/<device-id>` and opens its SSH console by default. A session's model context names the active device; the assistant still asks for confirmation before a disruptive action.

`pnpm dsh web` remains the upstream coding surface; the two profiles are independent bundle compositions.

## Community and support

- Submit feedback or bug reports through [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.
- Join <a href="https://discord.gg/4MrtZUhpxg">DeepSeek Harness Discord community</a>.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

`pnpm run dev:web` builds, serves, and rebuilds client bundles on source edits in one terminal, and `make help` lists the matching Make targets for Web and Desktop; the guide's application commands section owns the full table.

For agents, follow [AGENTS.md](AGENTS.md).

## Citation

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
