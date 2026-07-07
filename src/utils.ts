// Small ANSI color helpers so we don't need an external color dependency.
const wrap = (code: number) => (s: string): string => `\x1b[${code}m${s}\x1b[0m`;

export const color = {
  green: wrap(32),
  red: wrap(31),
  yellow: wrap(33),
  cyan: wrap(36),
  gray: wrap(90),
  bold: wrap(1),
};