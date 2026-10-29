import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** Run a program, capturing stdout/stderr. Never rejects on non-zero; callers decide. */
export function run(cmd, args, { timeout = 180_000, maxBuffer = 8 * 1024 * 1024, cwd } = {}) {
  return new Promise((resolve) => {
    const child = execFile(
      cmd,
      args,
      { timeout, maxBuffer, windowsHide: true, cwd, encoding: 'utf8' },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          code: error?.code ?? 0,
          timedOut: Boolean(error?.killed),
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          message: error?.message ?? '',
        });
      },
    );
    child.on('error', () => {});
  });
}

/** Locate an executable on PATH (Windows included). */
export function which(cmd) {
  if (!cmd) return null;
  if (path.isAbsolute(cmd)) return existsSync(cmd) ? cmd : null;
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';')
    : [''];
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, process.platform === 'win32' && !cmd.includes('.') ? cmd + ext.toLowerCase() : cmd);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function shellEscapeArg(value) {
  return value;
}

export function kb(bytes) {
  return Math.round((bytes / 1024) * 10) / 10;
}
