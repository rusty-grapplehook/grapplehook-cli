import type { DownloadStage, DownloadTask, ProgressEvent } from 'grapplehook-core';
import { color } from './utils.js';

const STAGE_LABEL: Record<DownloadStage, string> = {
  info: 'Fetching info',
  download: 'Downloading',
  transcode: 'Transcoding',
  done: 'Done',
};
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) {
    return '?';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];

  let v = n;
  let i = 0;

  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }

  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatSpeed(bps: number | null): string {
  return bps == null ? '' : `${formatBytes(bps)}/s`;
}

function formatEta(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) {
    return '';
  }

  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');

  return h > 0 ? `${h}:${m}:${ss}` : `${m}:${ss}`;
}

function bar(percent: number, width = 24): string {
  const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)));

  return '[' + '='.repeat(filled) + ' '.repeat(width - filled) + ']';
}

/**
 * Render a DownloadTask's progress to the terminal. On a TTY this is a single
 * updating status line per stage; when piped/non-TTY it just prints each stage
 * transition (no spam). Returns a finalize() the caller runs when the task
 * settles, to close off any open line.
 */
export function attachProgress(task: DownloadTask): () => void {
  const isTTY = Boolean(process.stdout.isTTY);

  let lastStage: DownloadStage | null = null;
  let lineOpen = false;
  let spin = 0;

  const endLine = (): void => {
    if (lineOpen) {
      process.stdout.write('\n');
      lineOpen = false;
    }
  };

  task.on('progress', (p: ProgressEvent) => {
    if (p.stage === 'done') {
      endLine();

      return;
    }

    if (p.stage !== lastStage) {
      endLine();
      lastStage = p.stage;

      // Info is momentary, and non-TTY output gets one line per stage.
      if (p.stage === 'info' || !isTTY) {
        process.stdout.write(color.gray(`${STAGE_LABEL[p.stage]}…`) + '\n');

        return;
      }
    }

    if (!isTTY) {
      return;
    }

    const label = STAGE_LABEL[p.stage].padEnd(11);

    let line: string;

    if (p.percent == null) {
      spin = (spin + 1) % SPINNER.length;

      const extra = p.downloadedBytes != null ? `  ${formatBytes(p.downloadedBytes)}` : '';

      line = `${color.cyan(SPINNER[spin])} ${label}${extra}`;
    } else {
      const parts = [color.cyan(bar(p.percent)), `${p.percent.toFixed(0)}%`.padStart(4)];
      const spd = formatSpeed(p.speed);
      const eta = formatEta(p.eta);

      if (spd) {
        parts.push(spd.padStart(10));
      }

      if (eta) {
        parts.push(`ETA ${eta}`);
      }

      line = `${label}${parts.join('  ')}`;
    }

    process.stdout.write(`\r${line}\x1b[K`);
    lineOpen = true;
  });

  return endLine;
}
