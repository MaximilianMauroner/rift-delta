import { resolve } from 'node:path'
import { rawSourceWorkerExecArgv } from './refresh-worker-memory.mjs'

export function rawSourceWorkerCommand(inputPath, outputPath) {
  return {
    command: process.execPath,
    args: [...rawSourceWorkerExecArgv(process.execArgv), resolve('scripts/raw-source-worker.mjs'), inputPath, outputPath],
  }
}
