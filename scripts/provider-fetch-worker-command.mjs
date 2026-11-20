export function providerFetchWorkerCommand(args) {
  return { command: process.execPath, args: ['scripts/download-local-data.mjs', ...args] }
}
