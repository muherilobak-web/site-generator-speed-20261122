# makefun-site 1.0.0

[![make.fun · site-generator-speed-01-run-20261122](https://make.fun/badge/site-generator-speed-01-run-20261122.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![rank](https://make.fun/badge/site-generator-speed-01-run-20261122/muherilobak-web/site-generator-speed-20261122/rank.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![reward](https://make.fun/badge/site-generator-speed-01-run-20261122/muherilobak-web/site-generator-speed-20261122/reward.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)

A drop-in static site generator, rewritten from scratch in plain JavaScript
(No dependencies, Node 22+) to be byte-for-byte identical to the reference
program while using far less CPU.

`solve.js` exports a single function `run(input)` that builds a whole site:
front matter parsing, slug/permalink rules, Markdown rendering, link
resolution, post collections and tags, template rendering (variables, raw
output, `for`, `if`, `include`), index/tag pages, static files and the
build report. `main.ts` reads `cases.json` from the input directory
(`MAKEFUN_INPUT_DIR` / `MAKEFUN_OUTPUT_DIR`, else `/input` / `/output`),
answers each case in order with `run`, and writes `answers.json`.

Speed notes: hand-written character scanners instead of regexes on hot
paths, templates parsed once per case into a node tree, output built by
joining string arrays, and slugs / dates / word counts computed once per
source and reused. No caching between cases; output depends only on input.
