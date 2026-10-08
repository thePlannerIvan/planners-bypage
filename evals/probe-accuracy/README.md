# Interface Accuracy Regression

This suite runs actual CLI accuracy probes against fictional project fixtures. It is included in the public Bypage suite runner.

```bash
node evals/probe-accuracy/run.mjs
```

The module uses Bypage's existing module resolver with auto-install disabled. Set `PLANNERS_MODULES_HOME` to the intended local flat dependency directory, especially while testing candidate Fact Check rather than a runtime copy. Without explicit root arguments it assumes it lives inside `evals/probe-accuracy/`.

Optional real continuous handoff:

```bash
node evals/probe-accuracy/run.mjs --handoff true --proposal-root /absolute/Proposal --ppt-root /absolute/PPT-Hell
```

Core accuracy checks are mandatory. Handoff is explicit because a standalone public Bypage repository need not contain Proposal/PPT Hell; when selected, missing implementations cause failure rather than a silent skip. This does not add any production state protocol or PPT visual rendering requirement.

`--fact-root`, `--library-root`, `--python`, `--out` and `--keep true` are available. Dependencies must already be present. The test runner never installs them or starts a review host/browser. Successful runs clean their own temporary project; failures preserve exact calls, per-invocation script hashes and report files and return nonzero. `--keep true` also preserves successful evidence.

The underlying `probe-accuracy.mjs` supports diagnostic mode (without `--strict true`) and named `--only` execution. CI uses strict mode: false-green, false-red, ownership risk, misleading hint, partial false-green or harness error fails the run. A zero diagnostic exit is only execution success, not an accuracy verdict.

All facts, images, audit records and approvals are synthetic, explicitly marked as fixtures. Semantic findings were independently established by reading the whole fictional source and artifact; replay tests those judgments' interface handling, not fresh model semantic skill or real human approval.

Simulated approval from a generated review uses its actual `review-context.sourceSha256`. Legacy fixtures with no review context retain the historic copy-plus-audit formula. The asset mutation test changes neither the earlier feedback bytes nor its Hash after replacing assets or regenerating the review, so it cannot silently fabricate approval of the new asset version.
