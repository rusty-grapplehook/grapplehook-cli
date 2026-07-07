#!/usr/bin/env node
import { parseArgs } from "node:util";
import path from "node:path";
import { download, CancelledError } from "grapplehook-core";
import { color } from "./utils.js";
import { attachProgress } from "./progress-renderer.js";

function printHelp(): void {
  console.log(`
${color.bold("grapplehook")} — download videos by URL (via yt-dlp)

By default it downloads the best video and best audio and merges them, so you
get full resolution. Add --mp4 to convert the result to editor-friendly mp4.

${color.bold("Usage:")}
  grapplehook <url> [options]

${color.bold("Options:")}
  -o, --output <dir>     Output directory (default: current directory)
  -q, --quality <q>      best | worst | a max height like 2160p / 1080p / 720p (default: best)
  -a, --audio            Download audio only (native format, usually .m4a)
  -m, --muxed            Single combined stream — skip merging (fast, lower res)
      --mp4              Transcode to H.264/AAC .mp4 at ANY resolution (re-encodes VP9/AV1)
      --crf <n>          x264 quality for --mp4, lower = better/larger (default: 18)
      --preset <p>       x264 preset for --mp4: ultrafast … veryslow (default: medium)
      --connections <n>  Parallel connections to beat throttling (default: 8)
      --aria2c           Force aria2c downloader (auto-used if it's installed)
      --no-aria2c        Force yt-dlp's native downloader (skip aria2c)
  -n, --name <filename>  Custom output filename (no extension)
      --verbose          Stream raw yt-dlp/ffmpeg output instead of a progress bar
  -h, --help             Show this help

${color.bold("Examples:")}
  grapplehook "https://youtu.be/dQw4w9WgXcQ"
  grapplehook "https://youtu.be/dQw4w9WgXcQ" -q 2160p --mp4
  grapplehook "https://youtu.be/dQw4w9WgXcQ" --mp4 --crf 20 --preset slow
  grapplehook "https://youtu.be/dQw4w9WgXcQ" --audio
`);
}

async function main(): Promise<void> {
  // Some runners (notably `npm start -- …`) forward the `--` separator itself
  // into argv. parseArgs treats `--` as end-of-options, which would make every
  // following token (URL and flags like --mp4) a positional. Drop the first
  // standalone `--` so options parse normally however the app is launched.
  const rawArgs = process.argv.slice(2);
  const sep = rawArgs.indexOf("--");
  const cliArgs =
    sep === -1 ? rawArgs : [...rawArgs.slice(0, sep), ...rawArgs.slice(sep + 1)];

  const { values, positionals } = parseArgs({
    args: cliArgs,
    allowPositionals: true,
    options: {
      output: { type: "string", short: "o" },
      quality: { type: "string", short: "q" },
      audio: { type: "boolean", short: "a" },
      muxed: { type: "boolean", short: "m" },
      mp4: { type: "boolean" },
      crf: { type: "string" },
      preset: { type: "string" },
      connections: { type: "string" },
      aria2c: { type: "boolean" },
      "no-aria2c": { type: "boolean" },
      name: { type: "string", short: "n" },
      verbose: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || positionals.length === 0) {
    printHelp();
    process.exit(values.help ? 0 : 1);
  }

  const crf = values.crf !== undefined ? Number(values.crf) : 18;
  if (Number.isNaN(crf) || crf < 0 || crf > 51) {
    console.error(color.red("✖ --crf must be a number between 0 and 51."));
    process.exit(1);
  }

  const connections = values.connections !== undefined ? Number(values.connections) : 8;
  if (!Number.isInteger(connections) || connections < 1 || connections > 64) {
    console.error(color.red("✖ --connections must be an integer between 1 and 64."));
    process.exit(1);
  }

  const task = download({
    url: positionals[0],
    outputDir: path.resolve(values.output ?? "."),
    audioOnly: Boolean(values.audio),
    muxed: Boolean(values.muxed),
    toMp4: Boolean(values.mp4),
    crf,
    preset: values.preset ?? "medium",
    connections,
    aria2c: Boolean(values.aria2c),
    noAria2c: Boolean(values["no-aria2c"]),
    quality: values.quality ?? "best",
    filename: values.name,
  });

  // --verbose streams the raw tool output (the old inherited-stdio view);
  // otherwise render a clean progress bar from structured events.
  let finalize = (): void => {};
  if (values.verbose) {
    task.on("log", (line) => process.stderr.write(color.gray(line) + "\n"));
  } else {
    finalize = attachProgress(task);
  }

  // Ctrl+C cancels gracefully (tree-kills subprocesses, cleans partial files).
  // A second Ctrl+C forces an immediate exit.
  let cancelling = false;
  const onSigint = (): void => {
    if (cancelling) process.exit(130);
    cancelling = true;
    task.cancel();
  };
  process.on("SIGINT", onSigint);

  try {
    const { outputPath } = await task.done;
    finalize();
    console.log(color.green(`\u2714 Done: ${outputPath}`));
  } catch (err) {
    finalize();
    if (err instanceof CancelledError) {
      console.error(color.yellow("Cancelled."));
      process.exit(130);
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(color.red(`\n\u2716 ${message}`));
    console.error(
      color.gray(
        "Tip: keep yt-dlp current with `yt-dlp -U` (YouTube changes often), " +
          "and make sure ffmpeg is installed (needed for merging and --mp4). " +
          "Re-run with --verbose to see the raw output."
      )
    );
    process.exit(1);
  } finally {
    process.off("SIGINT", onSigint);
  }
}

main();
