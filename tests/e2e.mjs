// End-to-end test run for the storefront and the CRM.
//
//   npm run test:e2e
//
// Drives one Chromium tab through every test case in order (later cases build on
// earlier ones: the order placed by the customer is what the CRM tests manage),
// and writes:
//   testing_ss/          one screenshot per test step
//   testing_recording/   MP4 screen recording of the whole run
//   TEST_CASES.md        test cases with steps, expected and actual results
//   test_results.xlsx    the same, as a spreadsheet with PASS / FAIL
//
// Settings and credentials come from .env: BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD,
// CUSTOMER_EMAIL, CUSTOMER_PASSWORD, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import ExcelJS from 'exceljs';
import ffmpegPath from 'ffmpeg-static';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env');
const env = process.env;
const BASE = (env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ADMIN = { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD };
const CUSTOMER = { email: env.CUSTOMER_EMAIL, password: env.CUSTOMER_PASSWORD };
for (const [k, v] of Object.entries({ ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password, CUSTOMER_EMAIL: CUSTOMER.email, CUSTOMER_PASSWORD: CUSTOMER.password })) {
  if (!v) throw new Error(`${k} is missing from .env`);
}

const SS_DIR = 'testing_ss';
const VIDEO_DIR = 'testing_recording';
const VIEWPORT = { width: 1280, height: 800 };

// ---------------------------------------------------------------------------
// Reference data straight from Supabase, so expectations follow the real catalog
// ---------------------------------------------------------------------------
const db = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: categories } = await db.from('categories').select('*').order('sort_order');
const { data: products } = await db.from('products').select('*').order('id');
if (!categories?.length || !products?.length) throw new Error('Could not load catalog from Supabase');
const productBySlug = (slug) => products.find((p) => p.slug === slug);
const inCategory = (slug) => products.filter((p) => p.category_id === categories.find((c) => c.slug === slug).id);

// Admin client, used only to restore product edits if a CRM test fails midway.
const adminDb = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await adminDb.auth.signInWithPassword(ADMIN);

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------
const cases = [];
const test = (meta, fn) => cases.push({ ...meta, fn });
const state = {}; // shared between cases: placed order id, cart contents, ...

let page;
let current;

const pad = (n) => String(n).padStart(2, '0');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
const price = (s) => Number(String(s).replace(/[^\d.]/g, ''));
const inr = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
const firstLine = (msg) => String(msg).split('\n')[0].replace(/\u001b\[[0-9;]*m/g, '').slice(0, 300);

function check(cond, message) {
  if (!cond) throw new Error(message);
}

async function eventually(fn, message, timeout = 10000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch {
      // keep polling
    }
    await page.waitForTimeout(200);
  }
  throw new Error(message);
}

const tid = (id) => page.getByTestId(id);
const visible = (locator, timeout = 10000) => locator.first().waitFor({ state: 'visible', timeout });
const text = async (locator) => ((await locator.first().textContent()) ?? '').trim();
const go = (path) => page.goto(BASE + path, { waitUntil: 'domcontentloaded' });

// One test step: runs, records actual result, and screenshots the page.
async function step(action, expected, fn) {
  const s = { no: current.steps.length + 1, action, expected, actual: '', status: 'PASS', screenshot: '' };
  current.steps.push(s);
  try {
    const observed = await fn();
    s.actual = observed ?? 'As expected';
  } catch (e) {
    s.status = 'FAIL';
    s.actual = firstLine(e.message);
    throw e;
  } finally {
    await page.waitForTimeout(250);
    s.screenshot = `${current.id}_${pad(s.no)}_${slug(action)}${s.status === 'FAIL' ? '_FAILED' : ''}.png`;
    await page.screenshot({ path: join(SS_DIR, s.screenshot) }).catch(() => (s.screenshot = ''));
  }
}

// Full-screen title card between tests so the recording is easy to follow.
async function titleCard(c) {
  await page.setContent(`
    <body style="margin:0;height:100vh;display:grid;place-items:center;background:#2b2118;color:#fbf7f2;font-family:system-ui,sans-serif">
      <div style="text-align:center;max-width:900px;padding:24px">
        <div style="font-size:18px;opacity:.7;letter-spacing:.08em;text-transform:uppercase">${c.module}</div>
        <div style="font-size:56px;font-weight:700;margin:8px 0 12px;color:#e07b4c">${c.id}</div>
        <div style="font-size:28px;line-height:1.3">${c.title}</div>
      </div>
    </body>`);
  await page.waitForTimeout(1100);
}

async function signOutEverywhere() {
  await go('/');
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('sb-')) localStorage.removeItem(k);
  });
}

async function clearCart() {
  await go('/');
  await page.evaluate(() => localStorage.removeItem('bakery-cart'));
}

async function customerLogin() {
  await go('/login');
  await tid('auth-email').fill(CUSTOMER.email);
  await tid('auth-password').fill(CUSTOMER.password);
  await tid('auth-submit').click();
  await visible(tid('nav-orders'));
}

async function adminLogin() {
  await go('/admin/login');
  await tid('admin-email').fill(ADMIN.email);
  await tid('admin-password').fill(ADMIN.password);
  await tid('admin-login-submit').click();
  await visible(tid('kpi-revenue'), 15000);
}

const cardSlugs = () => page.getByTestId('product-card').evaluateAll((els) => els.map((e) => e.dataset.productSlug));
const cardPrices = async () => (await page.getByTestId('product-price').allTextContents()).map(price);
const badge = async () => Number(await text(tid('cart-count')));

// ---------------------------------------------------------------------------
// Storefront
// ---------------------------------------------------------------------------
const featured = products.filter((p) => p.is_featured);

test({
  module: 'Storefront', title: 'Home page loads with hero, categories and featured products', priority: 'High',
  preconditions: 'Visitor is signed out.', data: '—',
  expected: 'Hero, every category tile and every featured product are shown; header shows guest links.',
}, async () => {
  await signOutEverywhere();
  await step('Open the home page', 'Hero heading "Fresh from our oven to your table" and a "Shop now" button are visible', async () => {
    await go('/');
    await visible(page.getByRole('heading', { name: 'Fresh from our oven to your table' }));
    await visible(tid('hero-shop-now'));
  });
  await step('Look at the "Browse by category" section', `${categories.length} category tiles in this order: ${categories.map((c) => c.name).join(', ')}`, async () => {
    const names = await eventually(async () => {
      const t = await tid('category-tile').allTextContents();
      return t.length === categories.length && t;
    }, 'Category tiles did not load');
    check(names.join('|') === categories.map((c) => c.name).join('|'), `Got ${names.join(', ')}`);
    return `${names.length} tiles: ${names.join(', ')}`;
  });
  await step('Scroll to "Customer favourites"', `${featured.length} featured product cards are shown`, async () => {
    await page.getByRole('heading', { name: 'Customer favourites' }).scrollIntoViewIfNeeded();
    const n = await eventually(async () => (await tid('product-card').count()) === featured.length && featured.length, `Expected ${featured.length} featured cards`);
    return `${n} featured cards shown`;
  });
  await step('Check the header for a guest', '"Shop", "Sign in" and "Cart 0" are visible; "My orders" and "Account" are not', async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await visible(tid('nav-shop'));
    await visible(tid('nav-login'));
    check((await badge()) === 0, 'Cart badge is not 0');
    check((await tid('nav-orders').count()) === 0, '"My orders" is visible to a guest');
    return 'Guest navigation shown, cart badge 0';
  });
});

test({
  module: 'Storefront', title: '"Shop now" opens the full catalog', priority: 'High',
  preconditions: 'On the home page.', data: '—',
  expected: 'Shop page lists every product with the "All" filter selected.',
}, async () => {
  await go('/');
  await step('Click "Shop now" in the hero', 'Browser goes to /shop and the "Shop" heading is shown', async () => {
    await tid('hero-shop-now').click();
    await page.waitForURL(/\/shop$/);
    await visible(page.getByRole('heading', { name: 'Shop', exact: true }));
    return `URL is ${page.url()}`;
  });
  await step('Count the products and check the active filter', `${products.length} products are listed and "All" is selected`, async () => {
    await eventually(async () => (await tid('product-card').count()) === products.length, `Expected ${products.length} products`);
    check((await tid('filter-all').getAttribute('aria-selected')) === 'true', '"All" is not selected');
    return `${products.length} products, "All" selected`;
  });
});

test({
  module: 'Storefront', title: 'Category tile on home page opens a filtered shop', priority: 'Medium',
  preconditions: 'On the home page.', data: `Category: ${categories[0].name}`,
  expected: `Only ${categories[0].name} products are listed and the matching filter chip is selected.`,
}, async () => {
  const cat = categories[0];
  const expected = inCategory(cat.slug);
  await go('/');
  await step(`Click the "${cat.name}" category tile`, `URL becomes /shop?category=${cat.slug} and the "${cat.name}" chip is selected`, async () => {
    await tid('category-tile').filter({ hasText: cat.name }).click();
    await page.waitForURL(new RegExp(`category=${cat.slug}`));
    await eventually(async () => (await tid(`filter-${cat.slug}`).getAttribute('aria-selected')) === 'true', 'Chip not selected');
    return `URL is ${page.url()}`;
  });
  await step('Check the listed products', `Exactly ${expected.length} products, all from ${cat.name}`, async () => {
    const slugs = await eventually(async () => {
      const s = await cardSlugs();
      return s.length === expected.length && s;
    }, `Expected ${expected.length} products`);
    check(slugs.every((s) => expected.some((p) => p.slug === s)), 'A product from another category is listed');
    return `${slugs.length} products: ${slugs.map((s) => productBySlug(s).name).join(', ')}`;
  });
});

test({
  module: 'Storefront', title: 'Category filter chips on the shop page', priority: 'Medium',
  preconditions: 'On /shop.', data: `Category: ${categories[1].name}`,
  expected: 'Selecting a chip shows only that category; "All" brings everything back.',
}, async () => {
  const cat = categories[1];
  await go('/shop');
  await visible(tid('product-card'));
  await step(`Click the "${cat.name}" chip`, `${inCategory(cat.slug).length} ${cat.name} products are listed`, async () => {
    await tid(`filter-${cat.slug}`).click();
    await eventually(async () => (await tid('product-card').count()) === inCategory(cat.slug).length, 'Wrong product count');
    return `${inCategory(cat.slug).length} products listed`;
  });
  await step('Click the "All" chip', `All ${products.length} products are listed again`, async () => {
    await tid('filter-all').click();
    await eventually(async () => (await tid('product-card').count()) === products.length, 'Wrong product count');
    return `${products.length} products listed`;
  });
});

test({
  module: 'Storefront', title: 'Search finds products by name or description', priority: 'High',
  preconditions: 'On /shop.', data: 'Search term: "croissant"',
  expected: 'Only products whose name or description mentions croissant are listed.',
}, async () => {
  const term = 'croissant';
  const expected = products.filter((p) => p.name.toLowerCase().includes(term) || p.description.toLowerCase().includes(term));
  await go('/shop');
  await visible(tid('product-card'));
  await step(`Type "${term}" in the search box`, `${expected.length} products are listed: ${expected.map((p) => p.name).join(', ')}`, async () => {
    await tid('search-input').pressSequentially(term, { delay: 60 });
    const slugs = await eventually(async () => {
      const s = await cardSlugs();
      return s.length === expected.length && s;
    }, `Expected ${expected.length} results`);
    check(page.url().includes(`q=${term}`), 'Search term not in URL');
    return `${slugs.length} results: ${slugs.map((s) => productBySlug(s).name).join(', ')}`;
  });
});

test({
  module: 'Storefront', title: 'Search with no matches shows an empty message', priority: 'Low',
  preconditions: 'On /shop.', data: 'Search term: "pizza-xyz"',
  expected: '"No products match your search." is shown and no cards are listed.',
}, async () => {
  await go('/shop');
  await visible(tid('product-card'));
  await step('Search for "pizza-xyz"', '"No products match your search." message and zero products', async () => {
    await tid('search-input').fill('pizza-xyz');
    await visible(tid('no-results'));
    check((await tid('product-card').count()) === 0, 'Products are still listed');
    return await text(tid('no-results'));
  });
});

test({
  module: 'Storefront', title: 'Sort by price (low to high, high to low) and by name', priority: 'Medium',
  preconditions: 'On /shop with all products.', data: 'Sort options',
  expected: 'Products are re-ordered correctly for each sort option.',
}, async () => {
  await go('/shop');
  await eventually(async () => (await tid('product-card').count()) === products.length, 'Products did not load');
  await step('Choose "Price: low to high"', 'Prices never decrease down the list; first is the cheapest product', async () => {
    await tid('sort-select').selectOption('price-asc');
    const p = await eventually(async () => {
      const list = await cardPrices();
      return list.every((v, i) => i === 0 || list[i - 1] <= v) && list;
    }, 'Prices are not ascending');
    return `First ${inr(p[0])}, last ${inr(p.at(-1))}`;
  });
  await step('Choose "Price: high to low"', 'Prices never increase down the list; first is the most expensive product', async () => {
    await tid('sort-select').selectOption('price-desc');
    const p = await eventually(async () => {
      const list = await cardPrices();
      return list.every((v, i) => i === 0 || list[i - 1] >= v) && list;
    }, 'Prices are not descending');
    return `First ${inr(p[0])}, last ${inr(p.at(-1))}`;
  });
  await step('Choose "Name"', 'Products are in A–Z order', async () => {
    await tid('sort-select').selectOption('name');
    const names = await eventually(async () => {
      const n = await tid('product-name').allTextContents();
      return n.every((v, i) => i === 0 || n[i - 1].localeCompare(v) <= 0) && n;
    }, 'Names are not in A–Z order');
    return `First "${names[0]}", last "${names.at(-1)}"`;
  });
});

test({
  module: 'Storefront', title: 'Product detail page', priority: 'High',
  preconditions: 'On /shop.', data: `Product: ${featured[0].name}`,
  expected: 'Detail page shows the product name, price, description, quantity and breadcrumb back to its category.',
}, async () => {
  const p = featured[0];
  const cat = categories.find((c) => c.id === p.category_id);
  await go('/shop');
  await step(`Click "${p.name}" in the product grid`, `Browser goes to /product/${p.slug}`, async () => {
    await page.locator(`[data-product-slug="${p.slug}"]`).getByTestId('product-name').click();
    await page.waitForURL(new RegExp(`/product/${p.slug}$`));
    return `URL is ${page.url()}`;
  });
  await step('Check the product details', `Title "${p.name}", price ${inr(p.price)}, quantity 1, "Add to cart" button`, async () => {
    check((await text(tid('product-title'))) === p.name, 'Wrong title');
    check(price(await text(tid('product-detail-price'))) === Number(p.price), 'Wrong price');
    check((await tid('quantity-input').inputValue()) === '1', 'Quantity is not 1');
    await visible(tid('add-to-cart'));
    return `${p.name} · ${await text(tid('product-detail-price'))}`;
  });
  await step(`Click the "${cat.name}" breadcrumb`, `Shop opens filtered to ${cat.name}`, async () => {
    await page.locator('.breadcrumb').getByRole('link', { name: cat.name }).click();
    await page.waitForURL(new RegExp(`category=${cat.slug}`));
    return `URL is ${page.url()}`;
  });
});

test({
  module: 'Storefront', title: 'Unknown product and unknown page', priority: 'Low',
  preconditions: '—', data: '/product/does-not-exist, /no-such-page',
  expected: 'Friendly "not found" pages with a way back.',
}, async () => {
  await step('Open /product/does-not-exist', '"Product not found" with a "Back to the shop" link', async () => {
    await go('/product/does-not-exist');
    await visible(page.getByRole('heading', { name: 'Product not found' }));
    await visible(page.getByRole('link', { name: 'Back to the shop' }));
  });
  await step('Open /no-such-page', '"Page not found" with a "Go home" button', async () => {
    await go('/no-such-page');
    await visible(page.getByRole('heading', { name: 'Page not found' }));
  });
  await step('Click "Go home"', 'Home page opens', async () => {
    await page.getByRole('link', { name: 'Go home' }).click();
    await page.waitForURL(BASE + '/');
    return `URL is ${page.url()}`;
  });
});

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------
const FOOTER_SECTIONS = [['footer-about', 'About us'], ['footer-faq', 'FAQs'], ['footer-contact', 'Contact'], ['footer-social', 'Follow us']];

test({
  module: 'Footer', title: 'Footer shows About us, FAQs, Contact and Follow us on store pages', priority: 'Medium',
  preconditions: 'Visitor is signed out.', data: '/, /shop, /admin/login',
  expected: 'Every store page has the footer with its four sections; the CRM sign-in page has no store footer.',
}, async () => {
  await signOutEverywhere();
  for (const path of ['/', '/shop']) {
    await step(`Scroll to the footer on ${path}`, `Footer shows: ${FOOTER_SECTIONS.map(([, h]) => h).join(', ')}`, async () => {
      await go(path);
      await tid('footer').scrollIntoViewIfNeeded();
      for (const [id, heading] of FOOTER_SECTIONS) {
        await visible(tid(id).getByRole('heading', { name: heading }));
      }
      const copyright = await text(tid('footer').locator('.footer-bottom'));
      check(copyright.includes(`© ${new Date().getFullYear()} Crumb & Co. Bakery`), `Copyright line is "${copyright}"`);
      return `All four sections shown; "${copyright}"`;
    });
  }
  await step('Open the CRM sign-in page', 'Store footer is not shown', async () => {
    await go('/admin/login');
    await visible(tid('admin-login-form'));
    check((await tid('footer').count()) === 0, 'Store footer is shown on the CRM sign-in page');
  });
});

test({
  module: 'Footer', title: 'FAQ answers open and close', priority: 'Medium',
  preconditions: 'On the home page.', data: '—',
  expected: 'All FAQs start closed; clicking a question shows its answer, clicking again hides it.',
}, async () => {
  await go('/');
  const faqs = tid('footer-faq').locator('details');
  const first = faqs.first();
  await step('Scroll to the FAQs', '5 questions, all closed', async () => {
    await tid('footer-faq').scrollIntoViewIfNeeded();
    await visible(first);
    const n = await faqs.count();
    check(n === 5, `Expected 5 FAQs, got ${n}`);
    const open = await faqs.evaluateAll((els) => els.filter((e) => e.open).length);
    check(open === 0, `${open} FAQs are open on load`);
    return `${n} questions, none open`;
  });
  await step('Click "When will my order arrive?"', 'Answer mentions the 8 pm cut-off and next-morning delivery', async () => {
    await first.locator('summary').click();
    const answer = first.locator('p');
    await visible(answer);
    const t = await text(answer);
    check(t.includes('8 pm') && t.includes('next morning'), `Answer is "${t}"`);
    return `Answer shown: "${t}"`;
  });
  await step('Click the question again', 'Answer is hidden', async () => {
    await first.locator('summary').click();
    await first.locator('p').waitFor({ state: 'hidden' });
    check(!(await first.evaluate((e) => e.open)), 'FAQ is still open');
  });
});

test({
  module: 'Footer', title: 'Footer contact, social and quick links', priority: 'Medium',
  preconditions: 'Visitor is signed out.', data: '—',
  expected: 'Phone and email are tap-to-call / tap-to-mail links, social links open in a new tab, quick links navigate.',
}, async () => {
  await signOutEverywhere();
  await go('/');
  await step('Check the Contact section', 'Address, a tel: phone link, a mailto: email link and opening hours', async () => {
    const contact = tid('footer-contact');
    await contact.scrollIntoViewIfNeeded();
    await visible(contact.getByText('12 Baker Street, Springfield'));
    const tel = await contact.locator('a[href^="tel:"]').getAttribute('href');
    const mail = await contact.locator('a[href^="mailto:"]').getAttribute('href');
    check(tel === 'tel:+15550123456', `Phone link is ${tel}`);
    check(mail === 'mailto:hello@crumbandco.example', `Email link is ${mail}`);
    await visible(contact.getByText(/Open Mon–Sat/));
    return `${tel}, ${mail}`;
  });
  await step('Check the Follow us links', 'Instagram, Facebook, X and TikTok, each opening in a new tab', async () => {
    const links = await tid('footer-social').getByRole('link').evaluateAll((els) =>
      els.map((a) => ({ label: a.getAttribute('aria-label'), href: a.href, target: a.target, rel: a.rel })));
    check(links.length === 4, `Expected 4 social links, got ${links.length}`);
    for (const [name, host] of [['Instagram', 'instagram.com'], ['Facebook', 'facebook.com'], ['X', 'x.com'], ['TikTok', 'tiktok.com']]) {
      const l = links.find((x) => x.label?.startsWith(`${name}:`));
      check(l, `No ${name} link`);
      check(new URL(l.href).hostname === host, `${name} link points to ${l.href}`);
      check(l.target === '_blank' && l.rel.includes('noopener'), `${name} link does not open safely in a new tab`);
    }
    return links.map((l) => l.label).join(', ');
  });
  await step('Click "Shop" in the footer', 'Shop page opens', async () => {
    await tid('footer-about').getByRole('link', { name: 'Shop' }).click();
    await page.waitForURL(/\/shop$/);
    return `URL is ${page.url()}`;
  });
  await step('Click "My orders" in the footer as a guest', 'Redirected to /login?next=%2Forders', async () => {
    await tid('footer-about').getByRole('link', { name: 'My orders' }).click();
    await page.waitForURL(/\/login\?next=%2Forders/);
    return `URL is ${page.url()}`;
  });
});

test({
  module: 'Footer', title: 'Footer on a phone-sized screen', priority: 'Low',
  preconditions: '—', data: 'Viewport 390 × 844',
  expected: 'Footer sections stack in one column and the page does not scroll sideways.',
}, async () => {
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await step('Open the home page at phone width and scroll to the footer', 'Sections stacked top to bottom; no horizontal scroll', async () => {
      await go('/');
      await tid('footer').scrollIntoViewIfNeeded();
      await visible(tid('footer-social'));
      const layout = await page.evaluate((ids) => ({
        lefts: ids.map((id) => Math.round(document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect().left)),
        tops: ids.map((id) => document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect().top),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }), FOOTER_SECTIONS.map(([id]) => id));
      check(new Set(layout.lefts).size === 1, `Sections are not in one column (left edges ${layout.lefts.join(', ')})`);
      check(layout.tops.every((t, i) => i === 0 || t > layout.tops[i - 1]), 'Sections are not stacked in order');
      check(layout.overflow <= 0, `Page scrolls sideways by ${layout.overflow}px`);
      return 'One column, no horizontal scroll';
    });
  } finally {
    await page.setViewportSize(VIEWPORT);
  }
});

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------
test({
  module: 'Cart', title: 'Add to cart from the product grid', priority: 'High',
  preconditions: 'Cart is empty.', data: 'First two products in the grid',
  expected: 'Button confirms "Added ✓" and the header cart badge counts up.',
}, async () => {
  await clearCart();
  await go('/shop');
  await visible(tid('product-card'));
  const slugs = (await cardSlugs()).slice(0, 2);
  state.cart = {};
  await step(`Click "Add to cart" on "${productBySlug(slugs[0]).name}"`, 'Button changes to "Added ✓" and the cart badge shows 1', async () => {
    const btn = page.locator(`[data-product-slug="${slugs[0]}"]`).getByTestId('add-to-cart');
    await btn.click();
    await eventually(async () => (await btn.textContent()).includes('Added'), 'Button did not confirm');
    await eventually(async () => (await badge()) === 1, 'Badge is not 1');
    state.cart[slugs[0]] = 1;
    return 'Button shows "Added ✓", badge 1';
  });
  await step(`Click "Add to cart" on "${productBySlug(slugs[1]).name}"`, 'Cart badge shows 2', async () => {
    await page.locator(`[data-product-slug="${slugs[1]}"]`).getByTestId('add-to-cart').click();
    await eventually(async () => (await badge()) === 2, 'Badge is not 2');
    state.cart[slugs[1]] = 1;
    return 'Badge 2';
  });
});

test({
  module: 'Cart', title: 'Add several of one product from its detail page', priority: 'High',
  preconditions: 'Cart has 2 items.', data: 'Quantity 3 of a third product',
  expected: 'Confirmation message appears and the badge goes up by 3.',
}, async () => {
  const p = products.find((x) => x.is_available && !state.cart[x.slug]);
  await go(`/product/${p.slug}`);
  await step(`Set quantity to 3 on "${p.name}"`, 'Quantity field shows 3', async () => {
    await tid('quantity-input').fill('3');
    check((await tid('quantity-input').inputValue()) === '3', 'Quantity not 3');
  });
  await step('Click "Add to cart"', '"Added to your cart. View cart →" is shown and the badge shows 5', async () => {
    await tid('add-to-cart').click();
    await visible(tid('added-message'));
    await eventually(async () => (await badge()) === 5, 'Badge is not 5');
    state.cart[p.slug] = 3;
    return `${await text(tid('added-message'))} · badge 5`;
  });
});

const cartSubtotal = () => Object.entries(state.cart).reduce((s, [sl, q]) => s + Number(productBySlug(sl).price) * q, 0);

test({
  module: 'Cart', title: 'Cart page lists items with correct totals', priority: 'High',
  preconditions: 'Cart has 3 products (1 + 1 + 3).', data: 'Prices from Supabase',
  expected: 'Each item, its quantity and the subtotal (sum of price × quantity) are correct; delivery is free.',
}, async () => {
  await go('/');
  await step('Click the cart link in the header', 'Cart page "Your cart" opens with 3 line items', async () => {
    await tid('nav-cart').click();
    await page.waitForURL(/\/cart$/);
    await eventually(async () => (await tid('cart-item').count()) === 3, 'Expected 3 items');
  });
  await step('Check names, quantities and totals', `Subtotal and total are ${inr(cartSubtotal())}`, async () => {
    const names = await tid('cart-item-name').allTextContents();
    for (const [sl, q] of Object.entries(state.cart)) {
      const row = tid('cart-item').filter({ hasText: productBySlug(sl).name });
      check(names.includes(productBySlug(sl).name), `${productBySlug(sl).name} missing`);
      check((await text(row.getByTestId('cart-item-qty'))) === String(q), `Wrong quantity for ${productBySlug(sl).name}`);
    }
    check(price(await text(tid('cart-subtotal'))) === cartSubtotal(), `Subtotal is ${await text(tid('cart-subtotal'))}`);
    check(price(await text(tid('cart-total'))) === cartSubtotal(), 'Total differs from subtotal');
    return `Subtotal ${await text(tid('cart-subtotal'))}, total ${await text(tid('cart-total'))}`;
  });
});

test({
  module: 'Cart', title: 'Change quantity with + and − buttons', priority: 'High',
  preconditions: 'On the cart page.', data: 'First cart item',
  expected: 'Quantity and totals update; "−" is disabled at quantity 1.',
}, async () => {
  await go('/cart');
  const [sl] = Object.keys(state.cart);
  const row = tid('cart-item').filter({ hasText: productBySlug(sl).name });
  await step(`Click "+" on "${productBySlug(sl).name}"`, 'Quantity becomes 2 and the subtotal goes up by one unit price', async () => {
    await row.getByTestId('qty-increase').click();
    state.cart[sl] = 2;
    await eventually(async () => (await text(row.getByTestId('cart-item-qty'))) === '2', 'Quantity not 2');
    await eventually(async () => price(await text(tid('cart-subtotal'))) === cartSubtotal(), 'Subtotal not updated');
    return `Qty 2, subtotal ${await text(tid('cart-subtotal'))}`;
  });
  await step('Click "−" once', 'Quantity is back to 1 and the "−" button is disabled', async () => {
    await row.getByTestId('qty-decrease').click();
    state.cart[sl] = 1;
    await eventually(async () => (await text(row.getByTestId('cart-item-qty'))) === '1', 'Quantity not 1');
    check(await row.getByTestId('qty-decrease').isDisabled(), '"−" is still enabled at quantity 1');
    return `Qty 1, "−" disabled, subtotal ${await text(tid('cart-subtotal'))}`;
  });
});

test({
  module: 'Cart', title: 'Remove an item and cart survives a page reload', priority: 'High',
  preconditions: 'Cart has 3 products.', data: 'Last cart item',
  expected: 'Removed item disappears, totals update, and the cart is still there after reloading.',
}, async () => {
  await go('/cart');
  const sl = Object.keys(state.cart).at(-1);
  await step(`Click "Remove" on "${productBySlug(sl).name}"`, '2 items remain and the badge drops to 2', async () => {
    await tid('cart-item').filter({ hasText: productBySlug(sl).name }).getByTestId('remove-item').click();
    delete state.cart[sl];
    await eventually(async () => (await tid('cart-item').count()) === 2, 'Expected 2 items');
    await eventually(async () => (await badge()) === 2, 'Badge not 2');
    return `2 items, subtotal ${await text(tid('cart-subtotal'))}`;
  });
  await step('Reload the page', 'Same 2 items and subtotal are still shown (cart saved in the browser)', async () => {
    await page.reload();
    await eventually(async () => (await tid('cart-item').count()) === 2, 'Cart lost after reload');
    check(price(await text(tid('cart-subtotal'))) === cartSubtotal(), 'Subtotal changed after reload');
    return `2 items, subtotal ${await text(tid('cart-subtotal'))}`;
  });
});

test({
  module: 'Cart', title: 'Empty cart state', priority: 'Low',
  preconditions: 'Cart has 2 items.', data: '—',
  expected: 'After removing everything, "Your cart is empty" with a link back to the shop.',
}, async () => {
  await go('/cart');
  await step('Remove every item', '"Your cart is empty" message and the badge shows 0', async () => {
    while ((await tid('remove-item').count()) > 0) {
      await tid('remove-item').first().click();
      await page.waitForTimeout(200);
    }
    state.cart = {};
    await visible(tid('cart-empty'));
    check((await badge()) === 0, 'Badge not 0');
  });
  await step('Click "Browse the shop"', 'Shop page opens', async () => {
    await page.getByRole('link', { name: 'Browse the shop' }).click();
    await page.waitForURL(/\/shop$/);
  });
});

// ---------------------------------------------------------------------------
// Customer account
// ---------------------------------------------------------------------------
test({
  module: 'Customer Auth', title: 'Signed-out visitor is sent to sign-in for protected pages', priority: 'High',
  preconditions: 'Signed out.', data: '/orders, /account',
  expected: 'Both pages redirect to /login with a "next" parameter.',
}, async () => {
  await signOutEverywhere();
  await step('Open /orders', 'Redirected to /login?next=%2Forders', async () => {
    await go('/orders');
    await page.waitForURL(/\/login\?next=%2Forders/);
    return `URL is ${page.url()}`;
  });
  await step('Open /account', 'Redirected to /login?next=%2Faccount', async () => {
    await go('/account');
    await page.waitForURL(/\/login\?next=%2Faccount/);
    return `URL is ${page.url()}`;
  });
});

test({
  module: 'Customer Auth', title: 'Sign-in with a wrong password is rejected', priority: 'High',
  preconditions: 'Signed out, on /login.', data: `${CUSTOMER.email} / wrong password`,
  expected: 'Error "Invalid login credentials"; user stays signed out.',
}, async () => {
  await go('/login');
  await step('Enter the customer email and a wrong password, click "Sign in"', '"Invalid login credentials" error is shown', async () => {
    await tid('auth-email').fill(CUSTOMER.email);
    await tid('auth-password').fill('wrong-password-123');
    await tid('auth-submit').click();
    await visible(tid('auth-error'));
    check(/invalid login credentials/i.test(await text(tid('auth-error'))), 'Unexpected error text');
    check((await tid('nav-orders').count()) === 0, 'User appears signed in');
    return await text(tid('auth-error'));
  });
});

test({
  module: 'Customer Auth', title: 'Create-account form validation', priority: 'Medium',
  preconditions: 'Signed out, on /login.', data: 'Password "123" (too short)',
  expected: 'Create-account tab adds a Full name field and blocks passwords under 6 characters.',
}, async () => {
  await go('/login');
  await step('Click the "Create account" tab', 'Full name field appears and the button reads "Create account"', async () => {
    await tid('tab-signup').click();
    await visible(tid('auth-name'));
    check((await text(tid('auth-submit'))) === 'Create account', 'Button text wrong');
  });
  await step('Fill name and email, enter password "123", click "Create account"', 'Browser blocks the form: password must be at least 6 characters; no account is created', async () => {
    await tid('auth-name').fill('Validation Check');
    await tid('auth-email').fill('validation-check@example.com');
    await tid('auth-password').fill('123');
    await tid('auth-submit').click();
    const msg = await tid('auth-password').evaluate((el) => (el.checkValidity() ? '' : el.validationMessage));
    check(msg, 'Short password was accepted');
    check((await tid('auth-info').count()) === 0, 'Form was submitted');
    return `Blocked: "${msg}"`;
  });
});

test({
  module: 'Customer Auth', title: 'Checkout asks guests to sign in, then returns them to checkout', priority: 'High',
  preconditions: 'Signed out, cart empty.', data: `${CUSTOMER.email} / valid password`,
  expected: 'Guest is redirected to sign-in; after signing in they land on the checkout form.',
}, async () => {
  const p = featured[1] ?? featured[0];
  await clearCart();
  await go(`/product/${p.slug}`);
  await step(`Add "${p.name}" (qty 2) to the cart`, 'Cart badge shows 2', async () => {
    await tid('quantity-input').fill('2');
    await tid('add-to-cart').click();
    await eventually(async () => (await badge()) === 2, 'Badge not 2');
    state.cart = { [p.slug]: 2 };
  });
  await step('Open the cart and click "Proceed to checkout"', 'Redirected to /login?next=%2Fcheckout', async () => {
    await go('/cart');
    await tid('checkout-button').click();
    await page.waitForURL(/\/login\?next=%2Fcheckout/);
    return `URL is ${page.url()}`;
  });
  await step('Sign in with the customer account', 'Checkout page with the "Delivery details" form opens', async () => {
    await tid('auth-email').fill(CUSTOMER.email);
    await tid('auth-password').fill(CUSTOMER.password);
    await tid('auth-submit').click();
    await page.waitForURL(/\/checkout$/);
    await visible(tid('checkout-form'));
    return `URL is ${page.url()}`;
  });
});

test({
  module: 'Customer Auth', title: 'Header for a signed-in customer', priority: 'Medium',
  preconditions: 'Signed in as the QA customer.', data: '—',
  expected: '"My orders", "Account" and "Sign out" are shown; "Sign in" and "CRM" are not.',
}, async () => {
  await step('Look at the header', 'Customer links visible, no "Sign in", no "CRM" link', async () => {
    await go('/');
    await visible(tid('nav-orders'));
    await page.waitForTimeout(1500); // let the admin check finish before asserting the CRM link is absent
    await visible(tid('nav-account'));
    await visible(tid('sign-out'));
    check((await tid('nav-login').count()) === 0, '"Sign in" still shown');
    check((await tid('nav-admin').count()) === 0, 'Non-admin sees the CRM link');
    return 'My orders · Account · Sign out (no CRM link)';
  });
});

test({
  module: 'Customer Account', title: 'Update account details', priority: 'Medium',
  preconditions: 'Signed in as the QA customer.', data: 'Phone 9876543210, address "QA Test Lane 12, Bengaluru 560001"',
  expected: 'Details save and are still there after reloading.',
}, async () => {
  state.phone = '9876543210';
  state.address = 'QA Test Lane 12, Bengaluru 560001';
  await go('/account');
  await step('Open the Account page', `"Signed in as ${CUSTOMER.email}" and the details form`, async () => {
    await visible(page.getByText(`Signed in as ${CUSTOMER.email}`));
    await visible(tid('account-form'));
  });
  await step('Enter name, phone and address, click "Save details"', '"Saved." confirmation', async () => {
    const form = tid('account-form');
    await form.getByLabel('Full name').fill('QA Customer');
    await form.getByLabel('Phone').fill(state.phone);
    await form.getByLabel('Default delivery address').fill(state.address);
    await page.getByRole('button', { name: 'Save details' }).click();
    await visible(page.getByText('Saved.'));
  });
  await step('Reload the page', 'Saved phone and address are still filled in', async () => {
    await page.reload();
    const form = tid('account-form');
    await eventually(async () => (await form.getByLabel('Phone').inputValue()) === state.phone, 'Phone not saved');
    check((await form.getByLabel('Default delivery address').inputValue()) === state.address, 'Address not saved');
    return `Phone ${state.phone}, address saved`;
  });
});

// ---------------------------------------------------------------------------
// Checkout and orders
// ---------------------------------------------------------------------------
test({
  module: 'Checkout', title: 'Checkout form is pre-filled and validates required fields', priority: 'High',
  preconditions: 'Signed in, cart has 1 product (qty 2), account details saved.', data: 'Saved profile',
  expected: 'Name, phone and address come from the profile; an empty address blocks the order.',
}, async () => {
  await go('/checkout');
  await step('Open checkout', 'Name "QA Customer", saved phone and address are pre-filled', async () => {
    await eventually(async () => (await tid('checkout-phone').inputValue()) === state.phone, 'Phone not pre-filled');
    check((await tid('checkout-name').inputValue()) === 'QA Customer', 'Name not pre-filled');
    check((await tid('checkout-address').inputValue()) === state.address, 'Address not pre-filled');
    return 'Name, phone and address pre-filled';
  });
  await step('Clear the address and click "Place order"', 'Browser blocks submission: address is required; still on /checkout', async () => {
    await tid('checkout-address').fill('');
    await tid('place-order').click();
    const msg = await tid('checkout-address').evaluate((el) => (el.checkValidity() ? '' : el.validationMessage));
    check(msg, 'Empty address accepted');
    check(page.url().endsWith('/checkout'), 'Left the checkout page');
    return `Blocked: "${msg}"`;
  });
});

test({
  module: 'Checkout', title: 'Place an order', priority: 'Critical',
  preconditions: 'On checkout with a valid form.', data: 'Note: "Automated test order – please ignore"',
  expected: 'Order is created in Supabase, confirmation page shows items and total, cart is emptied.',
}, async () => {
  const p = productBySlug(Object.keys(state.cart)[0]);
  const total = Number(p.price) * 2;
  await go('/checkout');
  await visible(tid('checkout-form'));
  await step('Fill the address and a note for the baker', 'Form is valid; button reads "Place order · ' + inr(total) + '"', async () => {
    await tid('checkout-address').fill(state.address);
    await tid('checkout-notes').fill('Automated test order – please ignore');
    check(price(await text(tid('place-order'))) === total, `Button shows ${await text(tid('place-order'))}`);
    return await text(tid('place-order'));
  });
  await step('Click "Place order"', 'Confirmation "Thank you! Your order is in." with order number, status Pending and the right total', async () => {
    await tid('place-order').click();
    await page.waitForURL(/\/orders\/[0-9a-f-]{36}\?placed=1/, { timeout: 15000 });
    await visible(tid('order-confirmation'));
    state.orderId = page.url().match(/orders\/([0-9a-f-]{36})/)[1];
    state.shortId = state.orderId.slice(0, 8).toUpperCase();
    state.orderTotal = total;
    check((await text(tid('order-status'))) === 'Pending', 'Status is not Pending');
    check(price(await text(tid('order-total'))) === total, 'Wrong total');
    check((await text(tid('order-item'))).includes(`2 × ${p.name}`), 'Item line wrong');
    return `Order #${state.shortId}, Pending, ${await text(tid('order-total'))}`;
  });
  await step('Check the header cart badge', 'Badge shows 0 (cart cleared)', async () => {
    await eventually(async () => (await badge()) === 0, 'Cart not cleared');
    state.cart = {};
  });
});

test({
  module: 'Orders', title: 'Order appears in "My orders" and its detail page', priority: 'High',
  preconditions: 'Order just placed.', data: 'The new order',
  expected: 'Order is listed with status Pending and total; detail page shows delivery info and the note.',
}, async () => {
  await go('/');
  await step('Click "My orders" in the header', `Order #${state.shortId} is listed as Pending with total ${inr(state.orderTotal)}`, async () => {
    await tid('nav-orders').click();
    const row = tid('order-row').filter({ hasText: state.shortId });
    await visible(row);
    check((await text(row.locator('.status'))) === 'Pending', 'Not Pending');
    check(price(await text(row.locator('.price'))) === state.orderTotal, 'Wrong total');
    return `#${state.shortId} · Pending · ${inr(state.orderTotal)}`;
  });
  await step('Open the order', 'Delivery card shows QA Customer, phone, address and the note', async () => {
    await tid('order-row').filter({ hasText: state.shortId }).click();
    await visible(page.getByText(`QA Customer · ${state.phone}`));
    await visible(page.getByText(state.address));
    await visible(page.getByText('Note: Automated test order – please ignore'));
  });
});

test({
  module: 'Customer Auth', title: 'Customer signs out', priority: 'Medium',
  preconditions: 'Signed in as the QA customer.', data: '—',
  expected: 'Header returns to guest links and protected pages require sign-in again.',
}, async () => {
  await go('/');
  await step('Click "Sign out" in the header', '"Sign in" link is back; "My orders" is gone', async () => {
    await tid('sign-out').click();
    await visible(tid('nav-login'));
    check((await tid('nav-orders').count()) === 0, '"My orders" still visible');
  });
  await step('Open /orders', 'Redirected to the sign-in page', async () => {
    await go('/orders');
    await page.waitForURL(/\/login\?next=/);
  });
});

test({
  module: 'CRM Access', title: 'Customer account cannot open the CRM', priority: 'Critical',
  preconditions: 'Signed in as the QA customer (not an admin).', data: `${CUSTOMER.email}`,
  expected: 'CRM refuses access with a clear message and offers to switch account.',
}, async () => {
  await customerLogin();
  await step('Open /admin', `CRM sign-in shows "${CUSTOMER.email} doesn't have CRM access."`, async () => {
    await go('/admin');
    await visible(tid('admin-denied'));
    check((await text(tid('admin-denied'))).includes("doesn't have CRM access"), 'Wrong message');
    check((await tid('kpi-revenue').count()) === 0, 'Dashboard visible to a customer');
    return await text(tid('admin-denied').locator('p'));
  });
  await step('Click "Sign in with another account"', 'Customer is signed out and the CRM sign-in form appears', async () => {
    await page.getByRole('button', { name: 'Sign in with another account' }).click();
    await visible(tid('admin-login-form'));
  });
});

// ---------------------------------------------------------------------------
// CRM sign-in
// ---------------------------------------------------------------------------
test({
  module: 'CRM Access', title: 'CRM pages require sign-in', priority: 'Critical',
  preconditions: 'Signed out.', data: '/admin, /admin/orders',
  expected: 'Redirected to /admin/login with the requested page kept in "next".',
}, async () => {
  await signOutEverywhere();
  for (const path of ['/admin', '/admin/orders']) {
    await step(`Open ${path}`, `Redirected to /admin/login?next=${encodeURIComponent(path)}`, async () => {
      await go(path);
      await page.waitForURL(new RegExp(`/admin/login\\?next=${encodeURIComponent(path)}$`));
      await visible(tid('admin-login-form'));
      return `URL is ${page.url()}`;
    });
  }
});

test({
  module: 'CRM Access', title: 'CRM sign-in page layout and password eye toggle', priority: 'Medium',
  preconditions: 'On /admin/login.', data: 'Any password text',
  expected: 'No "Back to store" link; "Forgot password?" is shown; eye button shows and hides the password.',
}, async () => {
  await go('/admin/login');
  await step('Look at the sign-in card', '"Forgot password?" link visible; "Back to store" link not present', async () => {
    await visible(tid('admin-forgot-link'));
    check((await page.getByText('Back to store').count()) === 0, '"Back to store" is still shown');
  });
  await step('Type a password and click the eye icon', 'Password becomes readable (field type "text"); icon label "Hide password"', async () => {
    await tid('admin-password').fill('Secret@123');
    check((await tid('admin-password').getAttribute('type')) === 'password', 'Not masked initially');
    await tid('admin-password-toggle').click();
    check((await tid('admin-password').getAttribute('type')) === 'text', 'Not revealed');
    check((await tid('admin-password-toggle').getAttribute('aria-label')) === 'Hide password', 'Label not updated');
    return 'type=text, aria-label "Hide password"';
  });
  await step('Click the eye icon again', 'Password is masked again (field type "password")', async () => {
    await tid('admin-password-toggle').click();
    check((await tid('admin-password').getAttribute('type')) === 'password', 'Not masked again');
    return 'type=password, aria-label "Show password"';
  });
});

test({
  module: 'CRM Access', title: 'CRM sign-in with a wrong password', priority: 'High',
  preconditions: 'On /admin/login.', data: `${ADMIN.email} / wrong password`,
  expected: '"Invalid login credentials" error; dashboard is not shown.',
}, async () => {
  await go('/admin/login');
  await step('Enter the admin email with a wrong password, click "Sign in"', '"Invalid login credentials" error', async () => {
    await tid('admin-email').fill(ADMIN.email);
    await tid('admin-password').fill('Wrong@Password1');
    await tid('admin-login-submit').click();
    await visible(tid('admin-login-error'));
    check(/invalid login credentials/i.test(await text(tid('admin-login-error'))), 'Unexpected error');
    return await text(tid('admin-login-error'));
  });
});

test({
  module: 'CRM Access', title: 'Forgot password request', priority: 'Medium',
  preconditions: 'On /admin/login.', data: 'qa-no-account@example.com (no account, so no email is sent)',
  expected: 'Form switches to "Send reset link", shows a neutral confirmation, and can go back to sign-in.',
}, async () => {
  await go('/admin/login');
  await step('Click "Forgot password?"', 'Password field hides and the button reads "Send reset link"', async () => {
    await tid('admin-forgot-link').click();
    await visible(tid('admin-forgot-form'));
    check((await tid('admin-password').count()) === 0, 'Password field still shown');
    check((await text(tid('admin-login-submit'))) === 'Send reset link', 'Wrong button text');
  });
  await step('Enter an email and click "Send reset link"', '"If that email has a CRM account, a reset link is on its way." is shown', async () => {
    await tid('admin-email').fill('qa-no-account@example.com');
    await tid('admin-login-submit').click();
    await eventually(async () => (await tid('admin-forgot-info').count()) || (await tid('admin-login-error').count()), 'No response');
    if (await tid('admin-login-error').count()) throw new Error(`Supabase returned: ${await text(tid('admin-login-error'))}`);
    return await text(tid('admin-forgot-info'));
  });
  await step('Click "← Back to sign in"', 'Sign-in form with password field is back', async () => {
    await tid('admin-back-to-signin').click();
    await visible(tid('admin-password'));
  });
});

test({
  module: 'CRM Access', title: 'Reset-password page without a valid link', priority: 'Low',
  preconditions: 'Signed out.', data: '/admin/reset-password',
  expected: '"This reset link is invalid or has expired." with a button to request a new link.',
}, async () => {
  await step('Open /admin/reset-password directly', 'Invalid-link message and "Request a new link" button', async () => {
    await go('/admin/reset-password');
    await visible(tid('reset-invalid'));
    return await text(tid('reset-invalid').locator('p'));
  });
  await step('Click "Request a new link"', 'CRM sign-in page opens', async () => {
    await page.getByRole('link', { name: 'Request a new link' }).click();
    await page.waitForURL(/\/admin\/login$/);
  });
});

test({
  module: 'CRM Access', title: 'Admin signs in to the CRM', priority: 'Critical',
  preconditions: 'On /admin/login.', data: `${ADMIN.email} / valid password`,
  expected: 'Dashboard opens; sidebar shows the admin email and navigation.',
}, async () => {
  await go('/admin/login');
  await step('Enter admin email and password, click "Sign in"', 'Dashboard opens at /admin', async () => {
    await tid('admin-email').fill(ADMIN.email);
    await tid('admin-password').fill(ADMIN.password);
    await tid('admin-login-submit').click();
    await visible(tid('kpi-revenue'), 15000);
    check(page.url() === BASE + '/admin', `URL is ${page.url()}`);
    return `URL is ${page.url()}`;
  });
  await step('Check the sidebar', 'Admin email, Dashboard / Orders / Customers / Products links and "Sign out"', async () => {
    check((await text(tid('admin-user'))) === ADMIN.email, 'Email not shown');
    for (const n of ['dashboard', 'orders', 'customers', 'products']) await visible(tid(`admin-nav-${n}`));
    await visible(tid('admin-sign-out'));
    return `Signed in as ${await text(tid('admin-user'))}`;
  });
});

// ---------------------------------------------------------------------------
// CRM features
// ---------------------------------------------------------------------------
test({
  module: 'CRM Dashboard', title: 'Dashboard KPIs and widgets reflect real data', priority: 'High',
  preconditions: 'Signed in as admin; the QA order exists.', data: 'The QA order placed earlier',
  expected: 'KPIs count the QA order and customer; recent orders list and status breakdown include it.',
}, async () => {
  await go('/admin');
  await visible(tid('kpi-orders'));
  await step('Read the KPI cards', 'Orders ≥ 1, Customers ≥ 1, Revenue ≥ the QA order total', async () => {
    const orders = Number(await text(tid('kpi-orders').locator('.kpi-value')));
    const customers = Number(await text(tid('kpi-customers').locator('.kpi-value')));
    const revenue = price(await text(tid('kpi-revenue').locator('.kpi-value')));
    check(orders >= 1, 'No orders counted');
    check(customers >= 1, 'No customers counted');
    check(revenue >= state.orderTotal, 'Revenue lower than the QA order');
    return `Revenue ${inr(revenue)}, orders ${orders}, customers ${customers}, open ${await text(tid('kpi-open').locator('.kpi-value'))}`;
  });
  await step('Check "Recent orders" and "Orders by status"', `#${state.shortId} is in recent orders; Pending count ≥ 1; revenue chart is drawn`, async () => {
    await visible(page.locator('.table').getByText(`#${state.shortId}`));
    check(Number(await text(tid('status-count-pending'))) >= 1, 'Pending count is 0');
    await visible(tid('revenue-chart'));
    return `Pending: ${await text(tid('status-count-pending'))}`;
  });
});

test({
  module: 'CRM Orders', title: 'Search and filter orders', priority: 'High',
  preconditions: 'Signed in as admin.', data: `Search: order number; filter: Pending`,
  expected: 'Search narrows to the QA order; status filter shows only matching orders.',
}, async () => {
  await go('/admin');
  await step('Click "Orders" in the sidebar', 'Orders table with at least one row', async () => {
    await tid('admin-nav-orders').click();
    await visible(tid('admin-order-row'));
    return `${await tid('admin-order-row').count()} orders`;
  });
  await step(`Search for "${state.shortId.toLowerCase()}"`, `Exactly one row: #${state.shortId}`, async () => {
    await tid('orders-search').fill(state.shortId.toLowerCase());
    await eventually(async () => (await tid('admin-order-row').count()) === 1, 'Expected 1 row');
    check((await text(tid('admin-order-row'))).includes(state.shortId), 'Wrong order');
    return `1 row: #${state.shortId}`;
  });
  await step('Clear search, choose status filter "Pending"', 'Every row is Pending and the URL has ?status=pending', async () => {
    await tid('orders-search').fill('');
    await tid('orders-status-filter').selectOption('pending');
    await page.waitForURL(/status=pending/);
    const values = await tid('order-status-select').evaluateAll((els) => els.map((e) => e.value));
    check(values.length > 0 && values.every((v) => v === 'pending'), `Statuses: ${values.join(', ')}`);
    return `${values.length} pending orders`;
  });
});

test({
  module: 'CRM Orders', title: 'Change order status from the list', priority: 'Critical',
  preconditions: 'On the Orders page.', data: 'Pending → Confirmed',
  expected: 'Status saves to Supabase and survives a reload.',
}, async () => {
  await go('/admin/orders');
  const row = () => tid('admin-order-row').filter({ hasText: state.shortId });
  await visible(row());
  await step(`Set #${state.shortId} to "Confirmed" in its status dropdown`, 'Dropdown shows Confirmed', async () => {
    await row().getByTestId('order-status-select').selectOption('confirmed');
    await page.waitForTimeout(800);
    check((await row().getByTestId('order-status-select').inputValue()) === 'confirmed', 'Not confirmed');
  });
  await step('Reload the page', 'Order is still Confirmed', async () => {
    await page.reload();
    await visible(row());
    check((await row().getByTestId('order-status-select').inputValue()) === 'confirmed', 'Status not saved');
    return 'Confirmed after reload';
  });
});

test({
  module: 'CRM Orders', title: 'Order detail page and status history', priority: 'High',
  preconditions: 'Order is Confirmed.', data: 'Confirmed → In the oven',
  expected: 'Detail shows items, customer and note; changing status adds to the history timeline.',
}, async () => {
  await go('/admin/orders');
  await step(`Click order #${state.shortId}`, 'Order detail page with items, customer and delivery note', async () => {
    await page.getByRole('link', { name: `#${state.shortId}` }).click();
    await visible(tid('admin-order-number'));
    await visible(tid('admin-order-item'));
    check((await text(tid('admin-order-customer'))) === 'QA Customer', 'Wrong customer');
    await visible(page.getByText('Note: Automated test order – please ignore'));
    return `${await text(tid('admin-order-number'))} · ${await text(tid('admin-order-item'))}`;
  });
  await step('Change status to "In the oven"', 'Status history lists Pending → Confirmed → In the oven', async () => {
    await tid('admin-order-status').selectOption('baking');
    const labels = await eventually(async () => {
      const l = await tid('status-history').locator('.status').allTextContents();
      return l.at(-1) === 'In the oven' && l;
    }, 'History not updated');
    check(labels.join(' → ') === 'Pending → Confirmed → In the oven', `History: ${labels.join(' → ')}`);
    return labels.join(' → ');
  });
});

test({
  module: 'CRM Customers', title: 'Customer list, search and staff exclusion', priority: 'High',
  preconditions: 'Signed in as admin.', data: 'Search "qa.customer"; search admin email',
  expected: 'QA customer listed with order count and spend; admin account is not listed as a customer.',
}, async () => {
  await go('/admin');
  await step('Click "Customers" in the sidebar', 'Customers table loads', async () => {
    await tid('admin-nav-customers').click();
    await visible(tid('customer-row'));
    return `${await tid('customer-row').count()} customers`;
  });
  await step('Search "qa.customer"', `One row: QA Customer, ${CUSTOMER.email}, ≥ 1 order, spend ≥ ${inr(state.orderTotal)}`, async () => {
    await tid('customers-search').fill('qa.customer');
    await eventually(async () => (await tid('customer-row').count()) === 1, 'Expected 1 row');
    const cells = await tid('customer-row').locator('td').allTextContents();
    check(cells[0].includes('QA Customer') && cells[0].includes(CUSTOMER.email), 'Wrong customer');
    check(Number(cells[2]) >= 1, 'Order count 0');
    check(price(cells[3]) >= state.orderTotal, 'Spend too low');
    return `Orders ${cells[2]}, spent ${cells[3]}`;
  });
  await step(`Search the admin email "${ADMIN.email}"`, '"No customers match." (staff are not customers)', async () => {
    await tid('customers-search').fill(ADMIN.email);
    await visible(page.getByText('No customers match.'));
  });
});

test({
  module: 'CRM Customers', title: 'Customer detail and staff notes', priority: 'High',
  preconditions: 'On the Customers page.', data: 'Note "Prefers eggless cakes (automated test)"',
  expected: 'Profile, KPIs and orders are shown; a note can be added and deleted.',
}, async () => {
  const note = `Prefers eggless cakes (automated test ${Date.now()})`;
  await go('/admin/customers');
  await step('Open "QA Customer"', 'Name, email, phone, address, and the QA order in the Orders table', async () => {
    await tid('customer-row').filter({ hasText: CUSTOMER.email }).getByRole('link').click();
    await visible(tid('customer-name'));
    check((await text(tid('customer-name'))) === 'QA Customer', 'Wrong name');
    await visible(page.getByRole('link', { name: CUSTOMER.email }));
    await visible(page.getByRole('link', { name: state.phone }));
    await visible(tid('customer-order-row').filter({ hasText: state.shortId }));
    return `Orders ${await text(tid('customer-order-count'))}, spent ${await text(tid('customer-spent'))}`;
  });
  await step('Type a note and click "Add note"', 'Note appears at the top of the notes list with a timestamp', async () => {
    await tid('note-input').fill(note);
    await tid('note-submit').click();
    await visible(tid('note').filter({ hasText: note }));
  });
  await step('Reload, then delete the note', 'Note is still there after reload, then disappears after "Delete"', async () => {
    await page.reload();
    const n = tid('note').filter({ hasText: note });
    await visible(n);
    await n.getByTestId('note-delete').click();
    await eventually(async () => (await tid('note').filter({ hasText: note }).count()) === 0, 'Note not deleted');
    return 'Note persisted, then deleted';
  });
});

test({
  module: 'CRM Products', title: 'Search products and toggle "Featured"', priority: 'Medium',
  preconditions: 'Signed in as admin.', data: 'A product that is not featured',
  expected: 'Toggle saves to Supabase (survives reload) and is switched back afterwards.',
}, async () => {
  const p = products.find((x) => !x.is_featured);
  try {
    await go('/admin');
    await step('Click "Products" in the sidebar', `${products.length} products in the table`, async () => {
      await tid('admin-nav-products').click();
      await eventually(async () => (await tid('product-row').count()) === products.length, 'Wrong product count');
    });
    await step(`Search "${p.name}"`, 'One matching row', async () => {
      await tid('products-search').fill(p.name);
      await eventually(async () => (await tid('product-row').count()) >= 1, 'No rows');
      return `${await tid('product-row').count()} row(s)`;
    });
    const row = () => tid('product-row').filter({ hasText: `/${p.slug}` });
    await step('Tick "Featured" and reload', 'Featured stays ticked after reload', async () => {
      await row().getByTestId('product-featured').click();
      await eventually(async () => await row().getByTestId('product-featured').isChecked(), 'Did not tick');
      await page.reload();
      await eventually(async () => await row().getByTestId('product-featured').isChecked(), 'Not saved');
    });
    await step('Untick "Featured" to restore it and reload', 'Featured is unticked and stays unticked after reload', async () => {
      await row().getByTestId('product-featured').click();
      await eventually(async () => !(await row().getByTestId('product-featured').isChecked()), 'Still ticked');
      await page.reload();
      await eventually(async () => !(await row().getByTestId('product-featured').isChecked()), 'Untick not saved');
    });
  } finally {
    await adminDb.from('products').update({ is_featured: p.is_featured }).eq('id', p.id);
  }
});

test({
  module: 'CRM Products', title: 'Edit a product price and see it in the store', priority: 'High',
  preconditions: 'Signed in as admin.', data: 'Price + ₹10, then restored',
  expected: 'New price shows in the CRM and on the storefront product page, then is restored.',
}, async () => {
  const p = products.find((x) => x.is_available);
  const newPrice = Number(p.price) + 10;
  const row = () => tid('product-row').filter({ hasText: `/${p.slug}` });
  try {
    await go('/admin/products');
    await visible(row());
    await step(`Click "Edit" on "${p.name}"`, 'Edit form opens with the current values', async () => {
      await row().getByTestId('product-edit').click();
      await visible(tid('product-form'));
      check((await tid('product-name').inputValue()) === p.name, 'Wrong product in form');
      check(Number(await tid('product-price').inputValue()) === Number(p.price), 'Wrong price in form');
    });
    await step(`Change price to ${newPrice} and click "Save"`, `Form closes and the table shows ${inr(newPrice)}`, async () => {
      await tid('product-price').fill(String(newPrice));
      await tid('product-save').click();
      await eventually(async () => (await tid('product-form').count()) === 0, 'Form did not close');
      await eventually(async () => price(await text(row().locator('.num'))) === newPrice, 'Price not updated');
    });
    await step(`Open the storefront page /product/${p.slug}`, `Store shows the new price ${inr(newPrice)}`, async () => {
      await go(`/product/${p.slug}`);
      await eventually(async () => price(await text(tid('product-detail-price'))) === newPrice, 'Store shows old price');
    });
    await step('Back in the CRM, set the price back', `Table shows the original ${inr(p.price)}`, async () => {
      await go('/admin/products');
      await row().getByTestId('product-edit').click();
      await tid('product-price').fill(String(Number(p.price)));
      await tid('product-save').click();
      await eventually(async () => price(await text(row().locator('.num'))) === Number(p.price), 'Not restored');
    });
  } finally {
    await adminDb.from('products').update({ price: p.price }).eq('id', p.id);
  }
});

test({
  module: 'CRM Products', title: 'New product form validation and cancel', priority: 'Low',
  preconditions: 'On the Products page.', data: 'Empty name',
  expected: 'Saving without a name is blocked; Cancel closes the form without creating anything.',
}, async () => {
  await go('/admin/products');
  await visible(tid('product-row'));
  await step('Click "+ New product"', '"New product" form opens with empty fields', async () => {
    await tid('product-new').click();
    await visible(tid('product-form'));
    check((await tid('product-name').inputValue()) === '', 'Name not empty');
  });
  await step('Click "Save" with no name', 'Browser blocks it: name is required; product count unchanged', async () => {
    await tid('product-save').click();
    const msg = await tid('product-name').evaluate((el) => (el.checkValidity() ? '' : el.validationMessage));
    check(msg, 'Empty name accepted');
    check((await tid('product-row').count()) === products.length, 'A product was created');
    return `Blocked: "${msg}"`;
  });
  await step('Click "Cancel"', 'Form closes', async () => {
    await page.getByRole('button', { name: 'Cancel' }).click();
    await eventually(async () => (await tid('product-form').count()) === 0, 'Form still open');
  });
});

test({
  module: 'CRM Layout', title: 'CRM works on a phone-sized screen', priority: 'Low',
  preconditions: 'Signed in as admin.', data: 'Viewport 390 × 844',
  expected: 'Sidebar becomes a top bar, content fits the screen without sideways scrolling.',
}, async () => {
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await step('Open the dashboard at phone width', 'Navigation sits above the content; no horizontal scroll', async () => {
      await go('/admin');
      await visible(tid('kpi-revenue'));
      const layout = await page.evaluate(() => ({
        sidebarBottom: document.querySelector('.admin-sidebar').getBoundingClientRect().bottom,
        mainTop: document.querySelector('.admin-main').getBoundingClientRect().top,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      check(layout.sidebarBottom <= layout.mainTop + 1, 'Sidebar is not above the content');
      check(layout.overflow <= 0, `Page scrolls sideways by ${layout.overflow}px`);
      return 'Top navigation, no horizontal scroll';
    });
    await step('Open Orders at phone width', 'Orders table scrolls inside its card; page itself does not', async () => {
      await tid('admin-nav-orders').click();
      await visible(tid('admin-order-row'));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(overflow <= 0, `Page scrolls sideways by ${overflow}px`);
    });
  } finally {
    await page.setViewportSize(VIEWPORT);
  }
});

test({
  module: 'CRM Access', title: 'Admin signs out', priority: 'High',
  preconditions: 'Signed in as admin.', data: '—',
  expected: 'Returns to CRM sign-in; CRM pages are locked again.',
}, async () => {
  await go('/admin');
  await visible(tid('admin-sign-out'));
  await step('Click "Sign out" in the sidebar', 'CRM sign-in page opens', async () => {
    await tid('admin-sign-out').click();
    await page.waitForURL(/\/admin\/login/);
    await visible(tid('admin-login-form'));
  });
  await step('Open /admin/customers', 'Redirected back to the CRM sign-in page', async () => {
    await go('/admin/customers');
    await page.waitForURL(/\/admin\/login\?next=/);
  });
});

test({
  module: 'End to End', title: 'Customer sees the status set by staff', priority: 'Critical',
  preconditions: 'Admin moved the QA order to "In the oven".', data: 'QA customer account',
  expected: 'Customer\'s "My orders" shows the order as "In the oven".',
}, async () => {
  await step('Sign in as the customer and open "My orders"', `Order #${state.shortId} shows "In the oven"`, async () => {
    await customerLogin();
    await tid('nav-orders').click();
    const row = tid('order-row').filter({ hasText: state.shortId });
    await visible(row);
    check((await text(row.locator('.status'))) === 'In the oven', `Status is ${await text(row.locator('.status'))}`);
    return `#${state.shortId} · In the oven`;
  });
  await step('Open the order', 'Order page status badge reads "In the oven"', async () => {
    await tid('order-row').filter({ hasText: state.shortId }).click();
    check((await text(tid('order-status'))) === 'In the oven', 'Wrong status');
  });
  await signOutEverywhere();
});

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
cases.forEach((c, i) => (c.id = `TC-${pad(i + 1)}`));

rmSync(SS_DIR, { recursive: true, force: true });
rmSync(VIDEO_DIR, { recursive: true, force: true });
mkdirSync(SS_DIR, { recursive: true });
mkdirSync(join(VIDEO_DIR, 'raw'), { recursive: true });

const browser = await chromium.launch({ slowMo: 120 });
const browserVersion = browser.version();
const context = await browser.newContext({ viewport: VIEWPORT, recordVideo: { dir: join(VIDEO_DIR, 'raw'), size: VIEWPORT } });
// Label in the corner of every page so screenshots and video show which case is running.
let currentLabel = '';
await context.exposeFunction('__qaLabel', () => currentLabel);
await context.addInitScript(() => {
  const label = async () => {
    const name = await window.__qaLabel?.();
    if (!name || document.getElementById('__qa_label')) return;
    const d = document.createElement('div');
    d.id = '__qa_label';
    d.textContent = name;
    Object.assign(d.style, {
      position: 'fixed', right: '10px', bottom: '10px', zIndex: 2147483647, pointerEvents: 'none',
      background: 'rgba(20,16,12,.85)', color: '#fff', font: '600 12px/1.4 system-ui,sans-serif',
      padding: '5px 10px', borderRadius: '8px', maxWidth: '70vw',
    });
    document.body.appendChild(d);
  };
  document.addEventListener('DOMContentLoaded', label);
});
page = await context.newPage();
const startedAt = new Date();
const results = [];

for (const c of cases) {
  current = { ...c, steps: [], status: 'PASS', error: '' };
  delete current.fn;
  const t0 = Date.now();
  process.stdout.write(`${c.id} ${c.title} … `);
  await titleCard(c);
  currentLabel = `${c.id} · ${c.title}`;
  try {
    await c.fn();
  } catch (e) {
    current.status = 'FAIL';
    current.error = firstLine(e.message);
  }
  current.duration = (Date.now() - t0) / 1000;
  current.actual = current.status === 'PASS'
    ? current.steps.map((s) => s.actual).filter((a) => a !== 'As expected').join('; ') || 'All steps behaved as expected.'
    : `Failed at step ${current.steps.length}: ${current.error}`;
  results.push(current);
  console.log(current.status === 'PASS' ? 'PASS' : `FAIL — ${current.error}`);
}

const finishedAt = new Date();
const videoPath = await page.video().path();
await context.close();
await browser.close();
await adminDb.auth.signOut();

// WebM from Playwright → MP4 (H.264) so it plays everywhere.
const mp4 = join(VIDEO_DIR, `bakery_e2e_${finishedAt.toISOString().slice(0, 10)}.mp4`);
execFileSync(ffmpegPath, ['-y', '-loglevel', 'error', '-i', videoPath, '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
rmSync(join(VIDEO_DIR, 'raw'), { recursive: true, force: true });

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
const passed = results.filter((r) => r.status === 'PASS').length;
const failed = results.length - passed;
const totalSteps = results.reduce((n, r) => n + r.steps.length, 0);
const runInfo = {
  'Application': 'Crumb & Co. Bakery storefront + Crumb CRM',
  'Base URL': BASE,
  'Backend': 'Supabase (Postgres, Auth, Row Level Security)',
  'Browser': `Chromium ${browserVersion} (Playwright), ${VIEWPORT.width}×${VIEWPORT.height}`,
  'Started': startedAt.toLocaleString('en-IN'),
  'Finished': finishedAt.toLocaleString('en-IN'),
  'Duration': `${Math.round((finishedAt - startedAt) / 1000)} s`,
  'Admin account': ADMIN.email,
  'Customer account': `${CUSTOMER.email} (dedicated QA account)`,
  'Screen recording': mp4.replace(/\\/g, '/'),
  'Screenshots': `${SS_DIR}/ (${totalSteps} files)`,
};
const modules = [...new Set(results.map((r) => r.module))].map((m) => {
  const rs = results.filter((r) => r.module === m);
  return { module: m, total: rs.length, passed: rs.filter((r) => r.status === 'PASS').length };
});

// Markdown
const mdEsc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
let md = `# Test Cases & Results: Crumb & Co. Bakery + CRM\n\n`;
md += `Automated end-to-end run with Playwright against the live site. Each step below was executed in a real browser; `;
md += `the **Actual** column is what the test observed, and every step has a screenshot in \`${SS_DIR}/\`.\n\n`;
md += `## Summary\n\n| | |\n|---|---|\n`;
md += `| **Result** | **${passed} passed, ${failed} failed** of ${results.length} test cases (${totalSteps} steps) |\n`;
for (const [k, v] of Object.entries(runInfo)) md += `| ${k} | ${mdEsc(v)} |\n`;
md += `\n### By module\n\n| Module | Test cases | Passed | Failed |\n|---|---:|---:|---:|\n`;
for (const m of modules) md += `| ${m.module} | ${m.total} | ${m.passed} | ${m.total - m.passed} |\n`;
md += `\n### All test cases\n\n| ID | Module | Title | Priority | Status |\n|---|---|---|---|---|\n`;
for (const r of results) md += `| [${r.id}](#${r.id.toLowerCase()}) | ${r.module} | ${mdEsc(r.title)} | ${r.priority} | ${r.status === 'PASS' ? '✅ PASS' : '❌ FAIL'} |\n`;
md += `\n## Test case details\n`;
for (const r of results) {
  md += `\n### ${r.id}\n\n**${r.title}** · ${r.module} · Priority: ${r.priority} · ${r.status === 'PASS' ? '✅ PASS' : '❌ FAIL'} (${r.duration.toFixed(1)} s)\n\n`;
  md += `- **Preconditions:** ${r.preconditions}\n- **Test data:** ${r.data}\n- **Expected result:** ${r.expected}\n- **Actual result:** ${r.actual}\n\n`;
  md += `| Step | Action | Expected | Actual | Status | Screenshot |\n|---:|---|---|---|---|---|\n`;
  for (const s of r.steps) {
    md += `| ${s.no} | ${mdEsc(s.action)} | ${mdEsc(s.expected)} | ${mdEsc(s.actual)} | ${s.status === 'PASS' ? '✅' : '❌'} | ${s.screenshot ? `[view](${SS_DIR}/${s.screenshot})` : '—'} |\n`;
  }
}
md += `\n## Test data left in the system\n\nThe run places a real order as \`${CUSTOMER.email}\` (note "Automated test order – please ignore") and moves it to "In the oven". `;
md += `Product edits and staff notes made by the tests are reverted/deleted at the end of each test.\n\n`;
md += `## Re-running\n\n\`\`\`bash\nnpm run test:e2e\n\`\`\`\n\nSettings come from \`.env\` (\`BASE_URL\`, \`ADMIN_EMAIL\`, \`ADMIN_PASSWORD\`, \`CUSTOMER_EMAIL\`, \`CUSTOMER_PASSWORD\`).\n`;
writeFileSync('TEST_CASES.md', md);

// Excel
const wb = new ExcelJS.Workbook();
wb.creator = 'Playwright e2e';
const header = (ws) => {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7A3B1D' } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 22;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
};
const statusCell = (cell, status) => {
  const pass = status === 'PASS';
  cell.font = { bold: true, color: { argb: pass ? 'FF1E6B3F' : 'FF9B1C12' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pass ? 'FFE3F4EA' : 'FFFDE8E6' } };
  cell.alignment = { horizontal: 'center', vertical: 'top' };
};

const summary = wb.addWorksheet('Summary');
summary.columns = [{ width: 24 }, { width: 70 }];
summary.addRow(['Crumb & Co. Bakery + CRM: Automated Test Report']).font = { bold: true, size: 14 };
summary.addRow([]);
const resultRow = summary.addRow(['Overall result', `${passed} passed, ${failed} failed of ${results.length} (${Math.round((passed / results.length) * 100)}% pass rate)`]);
resultRow.getCell(2).font = { bold: true, color: { argb: failed ? 'FF9B1C12' : 'FF1E6B3F' } };
summary.addRow(['Steps executed', totalSteps]);
for (const [k, v] of Object.entries(runInfo)) summary.addRow([k, v]);
summary.addRow([]);
const modHeader = summary.addRow(['Module', 'Passed / Total']);
modHeader.font = { bold: true };
for (const m of modules) summary.addRow([m.module, `${m.passed} / ${m.total}`]);
summary.getColumn(1).font = { bold: true };
summary.getRow(1).font = { bold: true, size: 14 };

const casesWs = wb.addWorksheet('Test Cases');
casesWs.columns = [
  { header: 'Test ID', key: 'id', width: 9 },
  { header: 'Module', key: 'module', width: 16 },
  { header: 'Test Case', key: 'title', width: 34 },
  { header: 'Priority', key: 'priority', width: 9 },
  { header: 'Preconditions', key: 'pre', width: 26 },
  { header: 'Test Data', key: 'data', width: 26 },
  { header: 'Test Steps', key: 'steps', width: 60 },
  { header: 'Expected Result', key: 'expected', width: 60 },
  { header: 'Actual Result', key: 'actual', width: 50 },
  { header: 'Status', key: 'status', width: 9 },
  { header: 'Duration (s)', key: 'duration', width: 11 },
  { header: 'Screenshots', key: 'shots', width: 48 },
];
header(casesWs);
for (const r of results) {
  const row = casesWs.addRow({
    id: r.id, module: r.module, title: r.title, priority: r.priority, pre: r.preconditions,
    data: r.data,
    steps: r.steps.map((s) => `${s.no}. ${s.action}`).join('\n'),
    expected: `${r.expected}\n\n${r.steps.map((s) => `${s.no}. ${s.expected}`).join('\n')}`,
    actual: r.actual, status: r.status, duration: Number(r.duration.toFixed(1)),
    shots: r.steps.filter((s) => s.screenshot).map((s) => `${SS_DIR}/${s.screenshot}`).join('\n'),
  });
  row.alignment = { vertical: 'top', wrapText: true };
  statusCell(row.getCell('status'), r.status);
}
casesWs.autoFilter = { from: 'A1', to: 'L1' };

const stepsWs = wb.addWorksheet('Step Details');
stepsWs.columns = [
  { header: 'Test ID', key: 'id', width: 9 },
  { header: 'Test Case', key: 'title', width: 34 },
  { header: 'Step', key: 'no', width: 6 },
  { header: 'Action (what the test does)', key: 'action', width: 50 },
  { header: 'Expected', key: 'expected', width: 50 },
  { header: 'Actual (observed)', key: 'actual', width: 50 },
  { header: 'Status', key: 'status', width: 9 },
  { header: 'Screenshot', key: 'shot', width: 50 },
];
header(stepsWs);
for (const r of results) {
  for (const s of r.steps) {
    const row = stepsWs.addRow({ id: r.id, title: r.title, no: s.no, action: s.action, expected: s.expected, actual: s.actual, status: s.status, shot: s.screenshot ? `${SS_DIR}/${s.screenshot}` : '' });
    row.alignment = { vertical: 'top', wrapText: true };
    statusCell(row.getCell('status'), s.status);
    if (s.screenshot) {
      row.getCell('shot').value = { text: `${SS_DIR}/${s.screenshot}`, hyperlink: `${SS_DIR}/${s.screenshot}` };
      row.getCell('shot').font = { color: { argb: 'FF0563C1' }, underline: true };
    }
  }
}
stepsWs.autoFilter = { from: 'A1', to: 'H1' };
await wb.xlsx.writeFile('test_results.xlsx');

console.log(`\n${passed} passed, ${failed} failed of ${results.length} · ${totalSteps} steps`);
console.log(`Report: TEST_CASES.md, test_results.xlsx · Screenshots: ${SS_DIR}/ · Video: ${mp4}`);
process.exitCode = failed ? 1 : 0;
