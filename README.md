# grapplehook-cli

A command-line app that downloads a YouTube video (or its audio) from a URL, with
an optional second stage that transcodes the result to an editor-friendly `.mp4`.
It's a TypeScript wrapper around [**yt-dlp**](https://github.com/yt-dlp/yt-dlp)
(download), **ffmpeg** (transcode), and - when installed -
[**aria2**](https://aria2.github.io/) for fast, parallel downloads.

The pipeline:

1. **Download** - yt-dlp fetches the best video + audio and merges them (into
   `.mp4`, `.webm`, or `.mkv`, whichever fits the codecs).
2. **Transcode** _(optional, `--mp4`)_ - ffmpeg converts that to H.264/AAC `.mp4`.
   Streams that are already H.264 / AAC are **copied** (fast, lossless); VP9, AV1,
   or Opus are **re-encoded**.

The heavy lifting - building and running yt-dlp/ffmpeg/aria2c, structured
progress events, and cancellation - lives in
[`grapplehook-core`](https://www.npmjs.com/package/grapplehook-core), a
framework-agnostic package shared with the
[desktop GUI](https://github.com/rusty-grapplehook/grapplehook-ui). This repo
is the thin terminal front-end: argument parsing and a progress-bar renderer.

> **Please note:** Downloading YouTube content is governed by YouTube's Terms of
> Service and by copyright law. Use this only for videos you have the right to
> download - your own uploads, Creative Commons content, or videos where you
> have the creator's permission.

## Requirements

- **Node.js 24 or newer**
- **yt-dlp** on your `PATH` (or set `YTDLP_PATH`)
- **ffmpeg** (and **ffprobe**, which ships with it) on your `PATH` - needed to
  merge HD tracks and for the `--mp4` transcode
- **aria2c** _(recommended)_ on your `PATH` (or set `ARIA2C_PATH`) - used
  automatically when present to get past YouTube's per-connection throttling.
  Without it, downloads fall back to yt-dlp's native downloader, which is much
  slower on YouTube (see [Speeding up downloads](#speeding-up-downloads)).

### Install yt-dlp, ffmpeg, and aria2c

- **macOS:** `brew install yt-dlp ffmpeg aria2`
- **Windows:** `winget install yt-dlp.yt-dlp` · `winget install Gyan.FFmpeg` ·
  `winget install aria2.aria2`
- **Linux / pipx:** `pipx install yt-dlp` plus `sudo apt install ffmpeg aria2`

**Keep yt-dlp updated:** `yt-dlp -U`. Most breakage is fixed by updating.

## Install

Install it globally to get the `grapplehook` command:

```bash
npm install -g grapplehook-cli
grapplehook "https://youtu.be/<id>" -q 1080p --mp4
```

Or run it without installing:

```bash
npx grapplehook-cli "https://youtu.be/<id>"
```

The npm package is only the CLI - you still need yt-dlp, ffmpeg, and aria2c
installed as described above. In the usage examples below, `npm start -- <args>`
is the run-from-source form; the installed equivalent is `grapplehook <args>`.

## Run from source (development)

```bash
npm install
```

## Usage

```bash
npm start -- "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

Everything after `--` is passed to the app:

```bash
# 4K, converted to an mp4 your editor will accept
npm start -- "https://youtu.be/dQw4w9WgXcQ" -q 2160p --mp4

# mp4 with a smaller file / higher quality knobs
npm start -- "https://youtu.be/dQw4w9WgXcQ" --mp4 --crf 20 --preset slow

# Audio only (native format, no ffmpeg needed)
npm start -- "https://youtu.be/dQw4w9WgXcQ" --audio
```

### Options

| Flag                | Description                                                         | Default     |
| ------------------- | ------------------------------------------------------------------- | ----------- |
| `-o, --output`      | Output directory                                                    | current dir |
| `-q, --quality`     | `best`, `worst`, or a max height like `2160p` / `1080p` / `720p`    | `best`      |
| `-a, --audio`       | Download audio only (native format)                                 | off         |
| `-m, --muxed`       | Single combined stream - skip merging (fast, lower res)             | off         |
| `--mp4`             | Transcode result to H.264/AAC `.mp4` (copies if already compatible) | off         |
| `--crf <n>`         | x264 quality for `--mp4`; lower = better/larger (0–51)              | `18`        |
| `--preset <p>`      | x264 preset for `--mp4`: `ultrafast` … `veryslow`                   | `medium`    |
| `--connections <n>` | Parallel connections/fragments to beat throttling (1–64)            | `8`         |
| `--aria2c`          | Force the aria2c downloader (auto-used if installed)                | auto        |
| `--no-aria2c`       | Force yt-dlp's native downloader                                    | off         |
| `-n, --name`        | Custom filename (without extension)                                 | video title |
| `--verbose`         | Stream raw yt-dlp/ffmpeg output instead of the progress bar         | off         |
| `-h, --help`        | Show help                                                           |             |

By default the CLI renders a single clean progress bar covering both stages
(download, then transcode if `--mp4` is on). Pass `--verbose` to see the raw
yt-dlp/ffmpeg output instead - useful for debugging format or throttling
issues.

**Cancelling:** press `Ctrl+C` once to cancel gracefully - subprocesses are
tree-killed and partial files are cleaned up. Press it a second time to force
an immediate exit.

## About `--mp4`

Why it's needed: yt-dlp keeps high-resolution VP9/AV1 streams in `.webm`/`.mkv` to
avoid a lossy re-encode, but many editors want `.mp4` (H.264). `--mp4` normalizes
the output to H.264/AAC `.mp4`.

It applies at **every resolution**, uniformly - the transcode step decides copy vs.
re-encode from the source _codec_, not the resolution:

- If the downloaded stream is already **H.264 + AAC**, ffmpeg just **remuxes** it
  into `.mp4` - instant and lossless.
- Otherwise (**VP9 / AV1 / Opus**, which is what YouTube uses for most quality
  tiers), it **re-encodes** to H.264/AAC using your `--crf` and `--preset`.

So in practice `--mp4` re-encodes at essentially every resolution, and your `--crf`
/ `--preset` take effect throughout - a 1080p clip is handled the same way as a 4K
one, just faster. Re-encoding is CPU-heavy (most so at 4K); use a faster `--preset`
or cap with `-q` if it's too slow.

Two caveats: re-encoding to H.264 can produce large files (raise `--crf` to shrink
them), and **HDR** sources aren't tone-mapped - they're converted to 8-bit SDR
as-is, which can look flat. HDR grading is out of scope here.

## Speeding up downloads

YouTube throttles each connection to roughly the video's bitrate (often ~300 kB/s),
so a single-threaded 4K download crawls. The way around it is to fetch over
multiple connections.

**aria2c is what actually works here, and it's used automatically when installed.**
It splits the stream's single URL across several connections (`-x`/`-s`, capped at
16), bypassing the per-connection throttle - typically several MB/s instead of a
few hundred kB/s. Install it once:

- macOS: `brew install aria2` · Debian/Ubuntu: `sudo apt install aria2` ·
  Windows: `winget install aria2.aria2`

yt-dlp's **native `-N`** (concurrent _fragments_) is left as the fallback, but note
it barely helps YouTube: these streams are a single byte-range URL, not many DASH
fragments, so there's nothing for `-N` to parallelize. That's why `--connections`
alone (without aria2c) won't move the needle on YouTube.

```bash
# aria2c auto-used if installed; tune connections up to 16
npm start -- "https://youtu.be/<id>" -q 2160p --mp4 --connections 16

# force native downloader (rarely useful for YouTube)
npm start -- "https://youtu.be/<id>" --no-aria2c
```

`--connections` feeds aria2c's `-x`/`-s` (or `-N` in native mode). If speeds are
_still_ low with aria2c, it's your own bandwidth or an IP YouTube is rate-limiting;
4–16 connections is the sweet spot (very high counts can trigger more throttling).
Set `ARIA2C_PATH` if aria2c isn't on your `PATH`.

## Optional: build to plain JS

```bash
npm run build          # compiles to ./dist
node dist/index.js "https://youtu.be/dQw4w9WgXcQ" --mp4
```

## Troubleshooting

- **"Could not find yt-dlp / ffmpeg / ffprobe":** install them (see above), or set
  `YTDLP_PATH` / `FFMPEG_PATH` / `FFPROBE_PATH`.
- **Format/HTTP errors or "Sign in to confirm you're not a bot":** `yt-dlp -U`.
- **Downloads still slow (~300 kB/s):** aria2c isn't being used. Install it (see
  above), set `ARIA2C_PATH` if it's not on your `PATH`, or pass `--aria2c` to force
  it (which also surfaces a clear "not found" error). The printed command line shows
  `--downloader aria2c …` when it's active.
- **`--mp4` is slow:** that's a 4K H.264 re-encode. Use a faster `--preset`
  (e.g. `veryfast`), cap resolution with `-q 1080p`, or drop `--mp4` and edit the
  `.mkv`/`.webm` directly if your editor supports it.

## Releasing (maintainers)

CI (`.github/workflows/ci.yml`) runs on every push and PR to `main`: build,
type-check, and a CLI smoke test on Node 24. Publishing is automated by
`.github/workflows/publish.yml` and runs when you publish a GitHub Release.

One-time setup:

1. Create an **npm access token** with publish rights (an _Automation_ token if
   your account uses 2FA): npmjs.com → Access Tokens → Generate New Token.
2. Add it to the repo as a secret named **`NPM_TOKEN`**: GitHub → Settings →
   Secrets and variables → Actions → New repository secret.
3. Generate and commit a lockfile - `npm install`, then commit
   `package-lock.json`. CI uses `npm ci`, which requires it.

Cutting a release:

```bash
npm version patch        # or minor / major - bumps package.json and tags the commit
git push --follow-tags
```

Then draft a GitHub Release for that tag and publish it (Releases → Draft a new
release → pick the tag → Publish). The workflow checks that the tag matches
`package.json`, builds, and runs `npm publish`.

> **Provenance (optional):** on a public repo you can add supply-chain provenance
> by changing the publish step to `npm publish --access public --provenance`
> (the workflow already grants the `id-token` permission). It requires the
> `repository` field to point at your repo.

## Project structure

```text
grapplehook-cli/
├── .github/workflows/
│   ├── ci.yml                  # build + type-check + smoke test on push/PR
│   └── publish.yml             # publish to npm on GitHub Release
├── package.json
├── tsconfig.json
├── LICENSE
├── README.md
└── src/
    ├── index.ts                # CLI entry: parses args, calls grapplehook-core's download()
    ├── progress-renderer.ts    # renders the two-stage progress bar from task events
    └── utils.ts                # ANSI color helper
```

The download/transcode pipeline itself lives in
[`grapplehook-core`](https://github.com/rusty-grapplehook/grapplehook-core).
