# Vinci

Your own bots, on your own server. For a small team, or just for you.

Vinci runs on a Linux server with Docker. Each person gets their own container, and each bot is a persistent [Pi](https://github.com/earendil-works/pi) agent. The install's Laravel API handles the login, with email and password.

It is an early version, meant for people who trust each other.

## Install

Read the [install overview](docs/team-workspace/README.md), then follow the [install guide](docs/team-workspace/install.md).

## Develop

You need [Bun](https://bun.sh) 1.4.

```bash
git clone git@github.com:meetvinci/vinci.git && cd vinci
bun install
cp .env.example .env
bun run dev:web
```

Open the login link it prints. Before a pull request, run `bun run check` and `bun run lint`.

## License

MIT. See [LICENSE](LICENSE).

Vinci started as a fork of [orbs](https://github.com/nikuscs/orbs) by [nikuscs](https://github.com/nikuscs). Thank you.

The avatar blob engine in `packages/avatar-blobs/` is by Jérémy Perret, also MIT.
