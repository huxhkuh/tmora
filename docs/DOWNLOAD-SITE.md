# Download website

The public website is served by GitHub Pages from `/docs` on `main`:

- Hebrew: https://huxhkuh.github.io/tmora/
- English: https://huxhkuh.github.io/tmora/en.html

Edit copy and shared markup in `scripts/build-download-site.mjs`, styles in
`docs/style.css`, and playback behavior in `docs/site.js`. Run `npm run build:site`
to regenerate both pages from the package version. There is no runtime framework,
tracking, account, external font request, or paid service. The two language pages
and all download links work without JavaScript.

## Recordings and fonts

The timer, floating project switcher and checklist GIFs are genuine captures of
Temura 1.5.3, in Hebrew and English, using isolated profiles and example data.
They are 6.5–7 seconds long. Playback is manual, stops at the end, and stops when
switching demonstrations or leaving the page/viewport. GIF errors restore the
static image and show a localized message. Nothing autoplays, including when
reduced motion is requested. The example hourly-return calculation is explicitly
labeled as an example. The installer screenshot remains Hebrew in both pages.

To recapture on Windows after a production build:

1. Run `node scripts/security-test-copy.mjs` to prepare the isolated inspector
   copy used by existing desktop tests. Do not publish that copy.
2. Run `node scripts/capture-download-demos.mjs`. It creates disposable profiles
   under workspace `work`, captures the app controls, and writes frames under
   repository `work/site-frames`. It never opens the real user profile.
3. Run `python scripts/encode-download-demos.py` with Pillow installed. This only
   scales, pads and encodes the captured frames; it does not invent UI. Generated
   GIFs and posters go to `docs/assets/demos`.
4. Review the recordings visually before committing. Only public demonstration
   assets belong in Git; test profiles and binaries stay ignored.

Headings use Frank Ruhl Libre, with Heebo for body text. Both are self-hosted,
unmodified Fontsource WOFF2 subsets licensed under SIL OFL 1.1. The full licenses
and credits are under `docs/assets`. Tel Aviv and its private license are not
included.

## Verification

Run `npm run test:site` (requires installed Google Chrome). The test serves `/docs`
on an ephemeral loopback port and verifies Hebrew/English direction and navigation,
320/390/768/1024/1440-pixel layouts, image loading, keyboard tabs, GIF playback and
automatic/manual stopping, error recovery, FAQ keyboard interaction, all local
references and navigation without JavaScript. Screenshots go to ignored
`work/download-site-qa`. Image bytes are compared to the local assets: an HTTP 200
placeholder from a network filter must not count as a verified recording. Inspect
the screenshots as well as the running page.

For a deployed check in PowerShell:

```powershell
$env:SITE_URL='https://huxhkuh.github.io/tmora/'
npm run test:site
Remove-Item Env:SITE_URL
```

Website-only changes do not need a new application version or replacement release
assets. After pushing, wait for the Pages deployment, run the public test and
verify GitHub download responses. The full setup and portable links are versioned;
the small installer uses the latest-release alias. Keep all compatibility file
names intact. Do not describe checksums as publisher signatures.

## Search visibility

The primary search intent is personal time tracking for freelancers: Hebrew
`מעקב שעות עבודה`, `תוכנה למעקב שעות בעברית`, and client work reports; English
`free time tracking for freelancers`. Keep claims aligned with actual Windows
features. This is not an employee attendance system or a cloud team service.

`npm run build:site` generates both pages and `docs/sitemap.xml`. Each language
has its own title, description and canonical URL. The HTML and sitemap use the
same reciprocal Hebrew/English hreflang links and Hebrew fallback (`x-default`).
Titles, H1s, introductory copy and FAQ answers describe the product naturally.
Do not add keyword lists, hidden search text, fabricated reviews or doorway pages.

JSON-LD describes the visible free Windows application and each landing page.
There are no real app reviews yet, so this markup does not satisfy Google's
rating/review requirement for SoftwareApplication rich results. Do not invent
a rating to remove that eligibility warning. FAQ content is ordinary visible
HTML, not a claim to a Google FAQ rich result.

Submit `https://huxhkuh.github.io/tmora/sitemap.xml` in the verified URL-prefix
Search Console property, then request indexing for `/tmora/` and `/tmora/en.html`.
Keep `docs/googled08e15c4d370b13b.html` in place. Submission and indexing requests
do not guarantee indexing or ranking. Monitor actual queries and impressions in
Search Console; this project has no analytics or Search Console credentials.

Google reads robots.txt only at the host root (`https://huxhkuh.github.io/robots.txt`),
not `/tmora/robots.txt`. The host-root file currently returns 404, so there is no
robots.txt crawl block. Do not add an ineffective project-subdirectory robots.txt
or modify a separate host-root repository as part of this site. Search Console
is the sitemap submission path for this project.

Run `node --test tests/download-seo.test.js` to check canonical/hreflang consistency,
metadata, truthful JSON-LD, sitemap membership and the verification file.

### Publication check, 2026-09-10

The redesign was deployed successfully. Public language navigation, layouts and
controls passed browser checks. The small installer was downloaded and matched
the release SHA-256; setup and portable links returned HTTP 200 with expected
sizes. Both Frank Ruhl Libre font files matched their local bytes.

The current network's NetFree image filter replaces the new screenshots and GIFs
with review-pending placeholders, even though it returns HTTP 200. Actual assets
were visually verified locally; their public visual verification on this network
remains blocked pending that external review. Do not treat the initial browser
load checks as proof that the public GIF frames were visible.
