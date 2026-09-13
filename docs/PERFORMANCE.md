# Memory and packaging

## Version 1.5.5 — second measured pass

- Load `electron-updater` only after an explicit update check. Opening settings
  does not load it. Once needed, it remains available for the rest of that app
  session; none of its download, checksum, cancellation or restart checks change.
- Give the native floating window a separate entry point. It does not load the
  approximately 70 KB main UI chunk, run the main dashboard's effects/clock, or
  retain saved entries/tasks in its React state. The same transactional store
  still performs all timer mutations, and long-timer correction opens the main
  window. Browser Picture-in-Picture and focus mode retain their existing paths.
- Reuse the current language's two number formatters for hours/currency. In a
  20,000-amount Node microbenchmark, formatting fell from 459 ms to 23 ms with an
  identical output checksum. This is not an application-wide speed multiplier.
- The NSIS installer uses Windows `compact /EXE:XPRESS16K` for an explicit list of
  installed application files. There is no recursive directory compression,
  AppData access, wildcard traversal, OS compression setting or elevated task.
  Failure is nonfatal: an unsupported filesystem keeps a normal installation.

Windows [documents executable compression](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/compact)
for frequently read, infrequently modified files on NTFS. This reduces physical
**size on disk**, not logical file lengths or installer download size. It adds
compression work at installation and decompression work through Windows when
reading. The initial 340 MB test copy took about four seconds to compress to
181 MB; its executable hash and hardened startup were unchanged. Use the
installed-build QA measurements below for delivery verification. Portable builds
do not run this installer hook; their extraction remains unchanged. User data,
the updater's installer cache and temporary extraction are outside these totals.

### Additional RAM savings

Mean of two fresh-profile runs per version on this machine, same 1,000-entry
fixture and protocol as below; USS in MiB. Measurements precede any explicit
update check. These small differences are subject to Windows/GC variation.

| Scenario | 1.5.4 | 1.5.5 | Additional reduction |
| --- | ---: | ---: | ---: |
| Empty, idle | 141.84 | 137.92 | 3.92 MiB / 2.8% |
| 1,000 entries, idle | 187.04 | 184.25 | 2.79 MiB / 1.5% |
| 1,000 entries, running | 185.27 | 182.81 | 2.46 MiB / 1.3% |
| Running + floating | 207.13 | 203.47 | 3.66 MiB / 1.8% |
| Main minimized + floating | 202.93 | 195.28 | 7.65 MiB / 3.8% |

Raw files: `work/performance/1.5.4-round2-before.json`, `1.5.4-confirm.json`,
`1.5.5-final-after.json`, `1.5.5-confirm.json`. The intermediate run without lazy
updater loading did not show a clear aggregate RAM improvement; we do not claim
that the floating-window split alone reduces overall RAM by a measured percentage.

Trying `build.compression=maximum` did not reduce downloads: this builder already
uses level 9 for 7z. That configuration experiment was discarded. Version 1.5.5
downloads remain about 103 MB; no large download-size reduction is claimed.

### Verification and reproduction

49 unit tests include exact Hebrew/English numeric output and lazy-updater
initialization, concurrency, safeguards and failure recovery. All 17 browser
scenarios passed; a focus test timed out on its initial button click in the first
parallel run and the entire four-test focus suite passed when rerun alone.
Packaged compact-window tests inspect the actual loaded script inventory and
verify both directions of timer/language/theme synchronization. The packaged
lazy-updater test checks absence at startup/settings and a real public feed check.
The prior 1.5.4 history profile was opened by old/new production code: all 1,000
entries, prices, projects, clients and the active timer matched exactly.

For installer compression QA, set `BOU_QA_BASELINE_ASAR` to the previous release's
ASAR, build with `node scripts/build-update-qa.mjs`, and run
`node tests/desktop-updates.mjs --install` with `BOU_VERIFY_COMPRESSION=1` and
`BOU_PERF_PYTHON` set to a Windows Python executable. This verifies actual update,
physical compression, file hashes, and reinstalling over already-compressed files.
Use `python scripts/windows-disk.py <isolated-install-directory>` to read logical
and physical sizes without changing files. Non-NTFS fallback is handled by the
nonfatal hook; no separate FAT/exFAT installation was performed on this machine.

The actual isolated NSIS upgrade and reinstall passed: 339.85 MB logical versus
181.31 MB physical (46.6% less space). This includes the separate QA identity's
small wrapper/installer files. Client/project/task/timer state and bundled file
hashes remained unchanged, and automatic relaunch succeeded. Evidence is in
`../../work/update-qa-GqTyPR/result.json` and `disk.json`. The update's differential
download transferred 1.02 MB in this particular QA run; this is not a general
promise about public updates. The final production setup is 103,364,669 bytes,
portable is 103,148,219 bytes. Hardened production/portable startup, native
visibility, compact clock, security/ASAR-tamper checks, bootstrapper validation
and release metadata validation also passed. No personal installation was replaced.

## Version 1.5.4

No storage schema, app identity, feature, security fuse, updater validation or
timer accounting was removed. The app still uses Electron 44.2.0.

## Changes

- Reuse a single Israel `Intl.DateTimeFormat` instance for date/time parts.
  Recreating it for each conversion repeatedly allocated native ICU resources.
  The localized header formatter is also reused until the language changes.
- Cache the dashboard's saved day/week history until entries or the Israel day
  change. Only the active session is sliced on each display update. Recent
  project ordering uses a single history pass instead of rescanning all entries
  inside every sort comparison.
- Paint visible running clocks once per second. Idle/paused displays refresh on
  minute boundaries (including midnight), and immediately on focus/visibility.
  Hidden documents cancel their display timeout. Time is always calculated from
  persisted timestamps; this scheduling never accrues or saves work time.
- Restore Electron's background throttling. Separate visible floating windows
  keep their own display scheduler.
- Keep React, ReactDOM, Lucide, and Heebo as build dependencies. Vite already
  includes the needed code/fonts in `dist`; their source packages were duplicated
  in the installed ASAR. `electron-updater` remains a runtime dependency.
- Package Chromium UI locales `he`, `en-US` and `en-GB`, matching supported app
  languages. All ICU timezone/Unicode data, application translations, fonts,
  rendering libraries and license notices remain. When adding an app language,
  add its Chromium locale to `build.electronLanguages` too.

## Measured sizes

Decimal MB, actual x64 build artifacts on the same machine:

| Item | 1.5.3 | 1.5.4 | Reduction |
| --- | ---: | ---: | ---: |
| Installed application files | 417.81 MB | 339.56 MB | 78.24 MB / 18.7% |
| App ASAR | 32.29 MB | 2.70 MB | 29.58 MB / 91.6% |
| Full setup download | 114.27 MB | 103.36 MB | 10.91 MB / 9.5% |
| Portable download | 114.05 MB | 103.15 MB | 10.91 MB / 9.6% |

Installed size excludes personal data, updater cache, and temporary portable
extraction. Electron's executable/rendering engine accounts for most remaining
disk use; the ASAR reduction is not the percentage reduction of the entire app.

## RAM measurement

Unique physical memory (USS), summed across only the application's process IDs,
using Windows `psutil.memory_full_info().uss`. Values are MiB (2^20 bytes).

| Scenario | 1.5.3 | 1.5.4 | Reduction |
| --- | ---: | ---: | ---: |
| Empty workspace, idle | 156.6 | 141.2 | 9.8% |
| 1,000 entries, idle | 203.6 | 188.8 | 7.3% |
| 1,000 entries, running timer | 206.9 | 193.3 | 6.5% |
| 1,000 entries, running + floating window | 222.5 | 205.0 | 7.9% |
| Main minimized, floating window open | 221.7 | 204.0 | 8.0% |

These are controlled, short QA samples, not universal memory limits. Both builds
used separate fresh profiles and the same synthetic history/UI sequence. Only
the main-process inspector fuse was enabled in isolated copies for Playwright;
the production ASAR was unchanged. Debugging, Windows caching, screen resolution,
data volume and other activity affect results. These figures should not be
directly compared to a user's Task Manager screenshot from another session.
The metrics run retains Playwright's default focus emulation for repeatability;
`desktop-visibility.mjs` uses only the main-process inspector for a separate
native minimize/restore test, without renderer focus emulation. The compact
window suite separately checks continued tracking while the main is minimized.

Renderer task time over a five-second sample fell from 0.151 s to 0.070 s while
tracking with 1,000 entries, and from 0.145 s to 0.015 s while idle. These are
renderer task durations, not total-process CPU percentages. Keeping RAM below a
fixed threshold cannot be guaranteed by these optimizations.

## Reproduction

After building each version, run `node scripts/security-test-copy.mjs`, then set
`BOU_TEST_EXE` to the instrumented copy and `PERF_LABEL` to an output label.
Optionally set `BOU_PERF_PYTHON` to a Python executable with psutil installed for
physical RAM measurements. Run `node tests/desktop-performance.mjs`. It uses only
isolated QA profiles, reports five Electron metrics samples per stage, captures
renderer task time, then takes a Windows USS snapshot. Raw results remain under
ignored `work/performance`; never publish the profiles.

Run `node tests/packaged-runtime.mjs` to verify the pruned archive. The unit suite
tests display scheduling, hide/show/sleep catch-up, midnight and timer accuracy;
the existing browser/native suites cover UI behavior and data persistence.

For a real isolated NSIS upgrade from old production code, set
`BOU_QA_BASELINE_ASAR` to that build's `resources/app.asar` before running
`node scripts/build-update-qa.mjs`, then `node tests/desktop-updates.mjs --install`.
This retains the disposable QA identity; it does not replace the user's install.

Verified for 1.5.4: 46 unit tests, 17 browser scenarios, 21 bootstrapper validation
checks, packaged smoke/compact/checklist/security tests, native visibility,
unchanged-production and portable startup, ASAR-tamper rejection, and lean package
inspection. The isolated NSIS upgrade from 1.5.3 code to 1.5.4 code passed actual
download, install, relaunch and full state comparison. A separate
`node tests/desktop-upgrade-data.mjs` comparison preserved all 1,000 saved entries,
their timestamps/descriptions/prices, clients/projects and the active timer.

The larger archive replacement exposed stale ASAR-header caching in the QA
reader; the test now clears its metadata cache before inspecting each replaced
archive. This was a test-reader issue, not an installation or data migration.
