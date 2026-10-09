import { spawnSync } from 'child_process'

// Launch the executable directly on every platform. On timeout, Node kills
// this process rather than a shell that could leave FFmpeg running behind it.
export function runBoundedProcess(executable: string, args: string[], timeoutMs: number) {
  const result = spawnSync(executable, args, { shell: false, stdio: 'inherit', timeout: timeoutMs, killSignal: 'SIGKILL' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${executable} exited with ${result.status ?? result.signal}`)
}
