# SEO Checklist: every Evergreen Digital client build

Walk this every time a new client site is built from the Evergreen Digital Website Template
base (Karl, Tegan, or Claude): what the template already automates vs.
what needs a manual pass from Karl/Tegan before or after launch.

## Handled automatically by the template

- [x] Title/meta description via `lib/seo.ts` (reads from `site-config.ts`)
- [x] Open Graph + Twitter card tags
- [x] LocalBusiness JSON-LD structured data
- [x] `robots.ts` + `sitemap.ts` (native Next.js routes)
- [x] Canonical URL per page
- [x] Security headers (HSTS, nosniff, frame-options, referrer, permissions)
- [x] Semantic landmarks + skip-to-content link
- [x] GA4 `generate_lead` event wired to the contact form

## Needs a manual pass: Claude can draft, but flag these for Karl/Tegan

- [ ] **`lib/site-config.ts` accuracy**: business name, phone, address/service
      area, social links. Wrong NAP (name/address/phone) data actively hurts
      local SEO, so this needs a human sanity check, not just AI-filled copy.
- [ ] **`og-image.png`**: real 1200×630 image per client, not the template default
- [ ] **Favicon / apple-touch-icon**: swap the stock Next.js icon set per brand
- [ ] **Schema.org type**: confirm `LocalBusiness` in `structured-data.ts` should be
      swapped for a more specific type (e.g. `HairSalon`, `AutoRepair`)
- [ ] **Real page copy**: title tags and meta descriptions are only as good as
      the content behind them; review before launch, not after
- [ ] **Alt text on every image**: template can draft it, but review for accuracy
- [ ] **Google Search Console**: verify domain, submit sitemap
- [ ] **Google Business Profile**: link to the site, confirm NAP matches exactly
- [ ] **GA4 property**: create it, drop the measurement ID into `.env.local`
      (and Vercel env vars), confirm `generate_lead` events are firing
- [ ] **Social profile links**: fill in `site-config.ts` once real accounts exist
- [ ] **Initial backlinks/citations**: industry directories, Yelp, etc. (marketing
      task, not something the codebase can do)
- [ ] **Post-launch page speed check**: run Lighthouse/PageSpeed Insights once
      real images/content are in place (placeholder content skews the numbers)
