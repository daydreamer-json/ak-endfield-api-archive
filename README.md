# ak-endfield-api-archive

Monitor changes to responses from various Arknights Endfield APIs and record them in this repository.

Updates are checked about every 30 minutes and automatically pushed to GitHub Actions.  
API outputs are stored in the [`output`](/output/) directory.

The APIs currently being monitored are as follows:
- Launcher
  - Get latest game
  - Get latest game resources
  - Get latest launcher

## Download Library

To easily view information about past versions of game packages and other items, please refer to the following page.

- [**Game packages**](/output/akEndfield/launcher/game/6/list.md)
- [**Game patch packages**](/output/akEndfield/launcher/game/6/list_patch.md)
- [**Game resources**](/output/akEndfield/launcher/game_resources/6/list.md)

## Disclaimer

This project has no affiliation with Hypergryph and was created solely for private use, educational, and research purposes.

I assume no responsibility whatsoever. Please use it at your own risk.

---

This project was created using `bun init` in bun v1.3.5. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
