import assert from 'node:assert/strict'
import { runBoundedProcess } from './lib/bounded-process'

// Arguments containing spaces and shell metacharacters must reach the child
// unchanged on Linux and native Windows.
const argument = 'path with spaces & $literal; "quoted"'
runBoundedProcess(process.execPath, ['-e', 'require("node:assert/strict").equal(process.argv[1], process.argv[2])', argument, argument], 10000)
assert.throws(() => runBoundedProcess(process.execPath, ['-e', 'process.exit(7)'], 10000), /exited with 7/)
const started = Date.now()
assert.throws(() => runBoundedProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], 1000), /ETIMEDOUT/)
assert(Date.now() - started < 5000, 'Child did not stop within the timeout budget')
console.log('Direct process arguments, exit failure, and timeout tests passed')
