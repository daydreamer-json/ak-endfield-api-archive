<h1 align="center">ak-endfield-api-archive</h1>

<p align="center">
  <a href="https://github.com/palmcivet/awesome-arknights-endfield"><img src="https://raw.githubusercontent.com/palmcivet/awesome-arknights-endfield/refs/heads/main/assets/badge-for-the-badge.svg" alt="Awesome Arknights Endfield" /></a>
</p>
<p align="center">
  <a href="https://github.com/daydreamer-json/ak-endfield-api-archive/actions/workflows/main.yml"><img src="https://github.com/daydreamer-json/ak-endfield-api-archive/actions/workflows/main.yml/badge.svg" alt="GitHub Actions" /></a>
  <img src="https://api.cron-job.org/jobs/7183534/5f3f37a732a92096/status-0.svg" alt="Cron Job" />
</p>

This repository monitors and records changes to various Arknights: Endfield API responses.

Updates are checked approximately every 5 minutes and automatically pushed via GitHub Actions.  
API outputs are stored in the [`output`](/output/) directory.

## [Download Library](https://ak-endfield-api-archive.daydreamer-json.cc/)

For a historical overview of game packages and other resources, please click the link above.

## Contents of the Archive

The following APIs are currently being monitored:
- Launcher
  - Get latest game (Global, China)
  - Get latest game resources (Global, China)
  - Get latest launcher (Global, China)
  - Get launcher web resources (Global, China)
    - Announcements
    - Banners
    - Main background images
    - Single Ent.
    - Sidebar
- Raw
  - Game resource manifests (index, patch)
  - Launcher image resources

Most raw data is provided "as-is" without modification. Some files (e.g., `index_*.json`) have been decrypted for readability.

The following data is archived in an external repository:
- Game packages (.zip)
- Game patch packages (.zip)
- Game hotfix resources
  - To avoid the overhead of managing numerous small files, these are bundled into larger chunk files.
- Launcher packages (.exe, .zip)

For a full list of externally archived files, please refer to the mirror list JSON in the `output` directory. (Note: `*_pending` files are temporary files used during the archiving process.)

For users in Asia (including China, Japan, Korea): To speed up downloads, use any GitHub proxy service (such as [`gh-proxy.org`](https://gh-proxy.org/), which is cached by Cloudflare).

## Contributing

As I can only test the game on the platforms and operating systems available to me, some data may contain inaccuracies. If you have information—particularly regarding **Chinese regional data** or beta versions—or if you would like to improve the code, please feel free to submit an issue or a pull request.

## Thanks

- [Vivi029](https://github.com/Vivi029): Added Windows Google Play Games channel support.

## Disclaimer

This project is not affiliated with Hypergryph (GRYPHLINE) and was created solely for **private use, educational, and research purposes.**

The author assumes no responsibility for any consequences arising from the use of this project. **USE AT YOUR OWN RISK.**
