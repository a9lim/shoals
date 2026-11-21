# Shoals

The singularity, priced from a derivatives desk. You trade Halcyon, the frontier AI lab, through a four-year term at Meridian Capital while a hidden AI race runs underneath the market, and each run ends in one of six outcomes for the world.

**[Play it](https://a9l.im/shoals)** · part of [a9l.im](https://a9l.im) · what it models and how to play: [about.md](about.md)

## Running locally

Shoals has no build step of its own; it loads the shared design system from the parent site by absolute path. From a checkout of [a9lim.github.io](https://github.com/a9lim/a9lim.github.io) with submodules:

    npm install && npm run build
    python3 -m http.server --directory dist 8000   # http://localhost:8000/shoals/

The tests need only Node: `node --test 'tests/*.test.mjs'`. [AGENTS.md](AGENTS.md) is the map for contributors.

## License

[AGPL-3.0](LICENSE)
