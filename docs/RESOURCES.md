# Resource utilisation — metric 4

**20% of the evaluation score. The question is "what does this cost the
laptop?", and it has to be answerable with figures rather than an impression.**

This file is the protocol and the results. The protocol comes first because the
numbers are worthless if two people collect them differently, and because most
of what matters cannot be measured from inside the extension.

---

## What the extension can and cannot measure about itself

`performance.memory` reports the JavaScript heap of one context. Shield's two
largest costs are not on it:

| Cost | Where it lives | Visible to the page? |
|---|---|---|
| ONNX Runtime WASM module + tensors | WebAssembly linear memory | **No** |
| WebGPU buffers | GPU | **No** |
| Our own objects, frames, element maps | JS heap | Yes |

So `[shield] offscreen, model ready heap …MB` is real but partial, and must
never be quoted as the footprint. It answers one narrow question well — whether
repeated runs leak, which shows up as a heap that climbs and does not come back
— and nothing else.

Everything else comes from Chrome's own task manager, which measures the
process and therefore sees all three rows above.

---

## Protocol

Run the whole sequence in one sitting, on an otherwise idle machine.

**Setup**

1. Restart Chrome. Close every other tab; a shared process muddies the reading.
2. Load the extension unpacked from `extension/dist` (an ordinary build, not
   `SHIELD_DEV=1`).
3. Open the task manager: **Shift+Esc**.
4. Right-click any column header and enable **JavaScript Memory** and
   **GPU Memory** alongside the default Memory footprint and CPU.
5. Find the rows named for the extension. There are normally two — the service
   worker and, once a run starts, the offscreen document. **Record them
   separately.** Summing them hides which half is expensive.

**Readings**

Take each reading after the figure settles for ~3 seconds. CPU is a moving
number; record the peak you actually see and the steady value it returns to.

| # | Moment | Why this moment |
|---|---|---|
| 1 | Extension loaded, no run yet | The cost of being installed at all |
| 2 | Immediately after the first run's model init | The resident cost of having a model |
| 3 | During a run, at peak | What one screen costs |
| 4 | Run finished, settled | What a run leaves behind |
| 5 | During a whole-page scan on a long page | The heaviest path there is |
| 6 | Two minutes idle after a scan | The offscreen document closes itself here — confirms it actually does |

**Repeat reading 3 five times.** A single run includes one-off costs; the
spread is more informative than any one number.

**Machines.** At least two, and one must have **no discrete GPU** — that
machine exercises the WASM fallback, which is the path most judges' laptops
will take. Record CPU model, RAM, GPU and Chrome version for each.

---

## Results

### Machine A — integrated graphics, which is the common case

| | |
|---|---|
| CPU | Intel Core i5-13500H, 12 cores / 16 threads |
| RAM | 15.7 GB |
| GPU | **Intel Iris Xe — integrated, no discrete GPU** |
| Chrome | Task manager readings, build stamp 2026-09-14 17:12:41 |
| Backend selected | **WebGPU** |

That last row is the headline. WebGPU is available and chosen on integrated
Intel graphics, which is the hardware most people bringing a laptop to a demo
actually have. The WASM fallback exists and is proved on every start, but it is
not the path this class of machine takes.

**The extension process** (`Extension: Shield`, one PID throughout):

| # | Moment | Memory footprint | JS memory | GPU memory | CPU % |
|---|---|---|---|---|---|
| 1 | Idle, loaded, no run | *not recorded* | 8,336K (5,990K live) | **0K** | 0.0 |
| 2 | Model ready | *not recorded* | 8,160K (6,094K live) | 8,814K | 0.0 |
| 3 | Run, peak | *not recorded* | 20,584K (12,882K live) | **18,970K** | 0.1 |
| 5 | Whole-page scan | **217,140K** | 18,536K (12,676K live) | **12,379K** | 0.4 |
| 5 | Whole-page scan (earlier run) | *not recorded* | 21,096K (13,297K live) | 7,326K | **1.1** |
| 4a | Settled after a scan, host still alive | 146,072K | 8,672K (4,815K live) | 1,056K | 1.0 |
| 4b | Settled after a run, host still alive | **122,684K** | 4,576K (4,123K live) | 1,154K | 2.1 |
| 6 | Settled, offscreen document gone | *not recorded* | 10,600K (9,161K live) | **0K** | 0.0 |

Readings 4a and 4b were taken with the vision host still resident - two
`Extension: Shield` rows in the task manager - which is why their footprint is
far above the JS heap. Reading 6 was taken before the footprint column existed,
so the one figure still missing is the footprint *after* the host disposes of
itself. That is the number that says whether the WASM arena is genuinely
returned or merely idle.

### The JS heap was showing 8% of the cost

The scan reading is the one to look at twice. The JavaScript heap says
**18,536K**; the process footprint says **217,140K**. The heap was reporting
roughly **8%** of what Shield actually occupies, and the missing 198MB is
almost entirely ONNX Runtime's WebAssembly linear memory - the compiled module
plus its tensors and arena - which no page-visible counter reports.

This is the concrete form of the warning at the top of this file, and it is why
`lib/resource.ts` prints "JS only - excludes WASM and GPU" on every line it
emits. A resource table built from `performance.memory` would have understated
this extension by an order of magnitude while looking like a measurement.

For scale, taken in the same moment: the income-tax tab alone was **290,460K**.
Shield at its heaviest costs roughly what one ordinary web page costs, which is
the honest comparison to offer rather than a raw megabyte count.

### GPU memory comes back. Process footprint does not, and the readings disagree

| Moment | PID | Footprint | GPU | JS heap |
|---|---|---|---|---|
| Whole-page scan, peak | 33380 | 217,140K | 12,379K | 18,536K |
| Settled after a scan, host alive | 33380 | 146,072K | 1,056K | 8,672K |
| Settled after a run, host alive | 33380 | 122,684K | 1,154K | 4,576K |
| **After a scan, host disposed** | 25036 | **215,644K** | **0K** | 11,368K |

The last row is the one that matters and it is not what the three above
predicted. The vision host had gone - one `Extension: Shield` row, GPU memory
back to **0K**, JS heap down to 11MB - and the process footprint was still
**215MB**. Roughly 204MB of that is not JavaScript and not GPU, which makes it
the WASM arena: freed inside the process, not returned to the operating system.

On the earlier process the footprint did fall, to 122MB. These two observations
disagree, and the difference is not explained by anything recorded here - the
processes differ, so they are not strictly comparable. Rather than pick the
flattering one:

**What is established.** GPU memory is genuinely released; the host does
dispose of itself; the JS heap returns to single-figure megabytes.

**What was not, and now is: it is not a leak.** The test named here was run on
2026-09-16, build 23:13:53 - five whole-page scans back to back, then five
task runs back to back, on the same page:

| Repeated action, 5x | Peak footprint |
|---|---|
| Whole-page scan | **280,000-290,000K** |
| Task run | **~144,000K** |

The peak stayed inside a ~10MB band across all five scans rather than climbing.
That is the distinction this section was waiting on: a scan that retained its
working set would have added roughly 70MB per pass and finished somewhere past
500MB. It did not, so **repeated scans do not push the footprint up without
bound, and the second possibility - a leak - is ruled out.** The first -
allocator retention, freed inside the process but not returned to the OS - is
what the readings show, and it is ordinary.

**The rise from 217MB to ~285MB is the upscale, and it was predicted.** These
scans ran at 2.0x (DECISIONS.md 212), so each stop draws a 3840x1890 canvas:
3840 x 1890 x 4 bytes = **29.0MB**, and this page takes two stops. Roughly 58MB
of canvas plus the engine's own copy accounts for the ~65-70MB increase almost
exactly. The cost is transient and lands on the scan path, which transmits
nothing; the run path does no full-frame recognition and peaks at 144MB, half
the scan figure, which is the same split showing up from the other side.

**What is still not established.** The steady value the footprint settles to
after repeated scans. The protocol above asks for the peak *and* the value it
returns to, and only the peak was recorded. That figure would separate "held
briefly" from "held for the life of the host" - it does not change the leak
verdict, but it is the difference between a footprint that recovers and one
that merely stops growing.

For scale, unchanged by any of this: the income-tax tab alone measured
290,460K in the same session. Shield at its heaviest still costs about what
one ordinary web page costs.

**Stage latency, one run** (against the budgets in ARCHITECTURE.md 6):

| Stage | Measured | Budget |
|---|---|---|
| Screen capture | 27.4ms | 100ms |
| DOM scan | 4.4ms | 100ms |
| Local inference | 52.0ms (WebGPU itself 31.7ms) | 500ms |
| Redaction | 40.2ms | 200ms |
| Server round trip | 10.5ms | 1000ms |
| **End to end** | **~135ms** | — |

CPU fallback, proved on this machine by the start-up self-test: 135ms init,
17ms inference. Roughly half the WebGPU inference time on a 320x240 self-test
input, which says the fallback is viable rather than merely present.

### What these numbers say

- **Installed and idle costs 8MB of JS heap and no GPU memory at all.** The
  model is not loaded until something asks for it.
- **Having a model resident costs ~8.8MB of GPU memory**, and using it peaks at
  **~19MB**. On a machine with 15.7GB of RAM and shared graphics memory, that
  is not a number anyone will notice.
- **CPU never exceeded 1.1%**, and that peak was the whole-page scan, which is
  the heaviest path Shield has.
- **The offscreen document really does dispose of itself.** Reading 6 is the
  one that proves DECISIONS.md 141 rather than assuming it: two minutes after
  the last work, the second process row is gone and GPU memory is back to
  **0K**. That is the design's claim, measured.
- **A small residue remains.** JS heap settles at 10,600K against an 8,336K
  baseline - about 2.3MB that did not come back. Over one cycle that is within
  the noise Chrome's bucketing introduces, but it is the number to watch: if it
  climbs with every run it is a leak, and the way to find out is to repeat
  readings 3 and 6 several times rather than argue about it.

### Gaps in this run, stated rather than smoothed over

- **Repeated scans, to separate allocator retention from a leak.** The single
  most valuable remaining reading, and the only open question in the table
  above.
- **The superseded note: the footprint after the host disposes of itself.**
  Everything recorded with a footprint was taken while the vision host was
  still resident. GPU memory is known to return to 0K at that point, which is
  strong evidence the teardown works. That reading has now been taken: the GPU
  memory goes, the WASM arena appears not to.
- **The offscreen document's own row is only partly legible** in the capture;
  one reading of about 12,033K was visible. The table above is the extension
  process, which is the one that persists.
- **Reading 3 was taken once, not five times.** The spread is unknown, so the
  peak figures are a single sample rather than a range.
- **Machine B does not exist yet.** This machine covers the integrated-graphics
  case well. What is missing for contrast is either a discrete GPU or an older
  and slower laptop.

## What the numbers have to answer

These are the questions a judge asks, and the reason each reading exists.

- **"What does it cost to just have installed?"** Reading 1.
- **"What does the model cost you?"** Reading 2 minus reading 1.
- **"What does it cost while working?"** Reading 3, with the five-run spread.
- **"Does it give the memory back?"** Reading 4 against 1, and reading 6 against
  1. A worker that never returns to baseline is a leak and should be reported as
  one rather than averaged away.
- **"What about a laptop with no GPU?"** Machine B, and the honest comparison
  of its run latency against Machine A's.

## Known costs already recorded

- The offscreen document holds a compiled 26MB WASM module and, on the WebGPU
  path, GPU buffers. It closes itself after two minutes idle rather than being
  torn down per run, because building the session costs about a second and the
  original per-run teardown made a 84ms inference pay ~1000ms of setup
  (DECISIONS.md 141).
- On Firefox nothing disposes of the host at all, because the idle timer's
  `window.close()` is a no-op in the context it ends up in. Firefox support is
  parked and that cost is recorded rather than measured (DECISIONS.md 206, 208).
