import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const site = 'https://huxhkuh.github.io/tmora/';
const pages = { he: 'index.html', en: 'en.html' };
const alternates = { he: site, en: site + 'en.html', 'x-default': site };

for (const [lang, file] of Object.entries(pages)) {
  test(`${lang} landing page has crawlable, consistent search metadata`, async () => {
    const html = await fs.readFile('docs/' + file, 'utf8');
    const canonical = lang === 'he' ? site : site + file;
    const title = html.match(/<title>(.*?)<\/title>/s)?.[1];
    const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
    const heading = html.match(/<h1>(.*?)<\/h1>/s)?.[1];
    assert(title && description && heading);
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
    assert.match(title, lang === 'he' ? /מעקב שעות עבודה/ : /Time Tracking/);
    assert.match(heading.replace(/<[^>]+>/g, ''), lang === 'he' ? /מעקב שעות עבודה/ : /Track your time/);
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
    assert(html.includes(`<link rel="canonical" href="${canonical}">`));
    assert(html.includes(`<meta property="og:url" content="${canonical}">`));
    assert(!/noindex|nofollow/i.test(html));
    for (const [locale, url] of Object.entries(alternates)) {
      assert(html.includes(`<link rel="alternate" hreflang="${locale}" href="${url}">`));
    }
    const jsonLd = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1]);
    const page = jsonLd['@graph'].find(item => item['@type'] === 'WebPage');
    const app = jsonLd['@graph'].find(item => item['@type'] === 'SoftwareApplication');
    assert.equal(page.url, canonical);
    assert.equal(page.inLanguage, lang);
    assert.equal(page.description, description);
    assert.equal(page.mainEntity['@id'], app['@id']);
    assert.equal(app.offers.price, 0);
    assert.equal(app.isAccessibleForFree, true);
    assert.equal(app.softwareVersion, JSON.parse(await fs.readFile('package.json', 'utf8')).version);
    assert.match(app.operatingSystem, /Windows/);
    assert.equal(app.downloadUrl, 'https://github.com/huxhkuh/tmora/releases/latest/download/Temura-Install.exe');
    assert(!('aggregateRating' in app) && !('review' in app), 'Never invent reviews for rich results');
    for (const url of [app.screenshot, page.primaryImageOfPage.url]) {
      assert(url.startsWith(site));
      await fs.access('docs/' + url.slice(site.length));
    }
    assert.equal((html.match(/<details>/g) || []).length, 9);
  });
}

test('sitemap contains only canonical landing pages with reciprocal language links', async () => {
  const xml = await fs.readFile('docs/sitemap.xml', 'utf8');
  assert(xml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
  assert(xml.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'));
  assert.deepEqual([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]), [site, site + 'en.html']);
  for (const entry of xml.matchAll(/<url>(.*?)<\/url>/gs)) {
    for (const [locale, url] of Object.entries(alternates)) {
      assert(entry[1].includes(`<xhtml:link rel="alternate" hreflang="${locale}" href="${url}"/>`));
    }
  }
  assert(!xml.includes('googled08e15c4d370b13b.html'));
  assert(!xml.includes('index.html'));
});

test('Search Console verification remains intact', async () => {
  assert.equal((await fs.readFile('docs/googled08e15c4d370b13b.html', 'utf8')).trim(),
    'google-site-verification: googled08e15c4d370b13b.html');
});
