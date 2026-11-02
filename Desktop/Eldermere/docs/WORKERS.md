# Workers and threading

All background threads live in `src/game/workers/`. Read this before adding or moving work to a worker.

## The rules
1. **One pool.** Always use `getApplicationWorkerPool()` from `workerPool.js`. Never call `createWorkerPool` in game systems (only the F2 stress test does, and it closes its own pool). The shared pool ignores `close()`.
2. **Fixed size.** cores − 2, between 1 and 6. Workers start as work arrives and then stay alive. Don't add "grow/shrink" logic.
3. **Only offload big jobs.** A worker round trip (copy in, run, copy out) costs ~0.1–1 ms and the answer arrives a frame or more late. Offload a job only if it does more than ~0.5 ms of CPU work. Small per-frame maths stays on the main thread.
4. **Send big inputs once.** Pass read-only arrays with `cache: { key, data }`. Each worker gets the data the first time and reuses it by key afterwards. Call `pool.evict(prefix)` when that data is thrown away (for example, on leaving a map).
5. **Return typed arrays.** Pack results into a `Float32Array` / `Int32Array` and transfer its buffer (`self.postMessage(msg, [arr.buffer])`). Don't return arrays of small arrays or objects.
6. **Bulk work is `low: true`.** Latency-sensitive jobs go first; low-priority jobs are guaranteed a turn after every 3.
7. **Everything can fail.** Jobs time out after 4 s by default (`timeoutMs`). A hung or crashed worker is replaced. Always handle the rejected promise and fall back to the main thread.
8. **Worker code is pure.** `compute.worker.js` has no DOM or Three.js access. It receives plain data and returns plain data.
9. **Few big jobs, not many small ones.** The main thread only reads worker replies between frames, so a chain of small jobs costs about a frame each. Pack an update into at most one job per worker.

## API
```js
const pool = getApplicationWorkerPool(); await pool.ready();
pool.run(type, payload, { cache, transfer, timeoutMs, low })   // → Promise<result> (result.__timing has queue/worker/round-trip ms)
pool.runBatch([{ type, payload, cache, low }, ...], concurrency) // → results in order
pool.evict('trees3:')
pool.snapshot()                                                  // for the F2 monitor
```
To add a job type, add a branch to `compute.worker.js` (use `cached` for data sent through `cache`).

## What runs where (Nov 2026)
| Work | Where | Why |
|---|---|---|
| Tree LOD culling (`tree-cull-multi`) | Worker (auto/worker modes) | Thousands of trees per update. All ranges are packed into **one job per worker** (hundreds of tiny jobs made each update take ~3 s of round trips); positions cached per worker; results packed |
| Creature AI sense, creature presentation plan | Main thread (`auto`); worker only in explicit `worker` mode | A few µs of maths; the round trip cost more than it saved |
| NPC AI sense, NPC presentation plan | Same as creatures | Same |

The F7 scheduler's `worker` mode is still available for these small jobs, for measuring. Compare "CPU" with the round-trip time in F2: if the round trip is bigger, the job isn't worth a worker.

## F2 process monitor
`reportProcess()` does nothing while the monitor is closed, so systems can call it freely. If building the report itself costs time (snapshots, string building), check `monitorEnabled()` first.
