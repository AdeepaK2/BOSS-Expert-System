// End-to-end: drives the real page in Chromium, over file:// (the
// "no install" path) - clicks through a demo case and reads the verdict.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  // Use a locally cached Chromium if one is present (set BOSS_CHROME).
  const exe = process.env.BOSS_CHROME;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // phone
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto('file://' + path.join(__dirname, '..', 'web', 'index.html'));
  await page.waitForTimeout(400);

  console.log('\nB0SS end-to-end (Chromium, file://, 390px)\n');
  console.log('  landing title:', await page.title());

  // Load example 1 and run it through.
  await page.click('#btn-demo');
  await page.waitForTimeout(300);
  const toastTxt = await page.textContent('#toast');
  console.log('  loaded:', toastTxt.trim());

  // Walk the seven sections using the visible Continue buttons.
  for (let i = 0; i < 7; i++) {
    const btn = page.locator('.sec.active .sec-foot button.btn-primary');
    await btn.waitFor({ state: 'visible', timeout: 4000 });
    const label = (await btn.textContent()).trim();
    await btn.click();
    await page.waitForTimeout(220);
    if (label === 'See the result') break;
  }

  await page.waitForSelector('#view-result:not(.hidden)', { timeout: 8000 });
  await page.waitForTimeout(400);

  const verdict = (await page.textContent('.verdict h1')).trim();
  const cfLabel = (await page.textContent('.verdict-cf')).trim();
  const traceSum = (await page.textContent('details.reasoning summary')).trim();
  const nPos = await page.locator('.finding.pos').count();
  const nNeg = await page.locator('.finding.neg').count();
  const money = await page.locator('.money-row').count();

  console.log('  verdict:   ', verdict);
  console.log('  cf label:  ', cfLabel);
  console.log('  reasoning: ', traceSum);
  console.log('  findings:  ', nPos, 'positive,', nNeg, 'concerns,', money, 'money rows');

  // Save it, then check it comes back on the landing page.
  await page.fill('.save-row input', 'Tuition class, Gampaha');
  await page.click('.save-row button');
  await page.waitForTimeout(250);
  await page.click('#btn-home-2');
  await page.waitForTimeout(250);
  const histCount = await page.locator('.hist-item').count();
  const histName = histCount ? (await page.textContent('.hist-name')).trim() : '(none)';
  console.log('  saved:     ', histCount, 'entry ->', histName);

  // Reopen it and confirm the verdict is recomputed, not replayed.
  await page.click('.hist-item');
  await page.waitForSelector('#view-result:not(.hidden)', { timeout: 8000 });
  await page.waitForTimeout(400);
  const verdict2 = (await page.textContent('.verdict h1')).trim();
  console.log('  reopened:  ', verdict2);

  await page.screenshot({ path: path.join(__dirname, 'shot-result.png'), fullPage: true });

  // FR-10: change one answer and confirm the verdict is recomputed.
  await page.click('#btn-home-2');
  await page.waitForTimeout(200);
  await page.click('.hist-item');
  await page.waitForSelector('#view-result:not(.hidden)', { timeout: 8000 });
  await page.waitForTimeout(300);
  await page.locator('#result-body .result-actions button', { hasText: 'Change an answer' }).click();
  await page.waitForTimeout(250);
  await page.locator('.sec').last().locator('.sec-head').click();   // legal section
  await page.waitForTimeout(250);
  await page.locator('.sec.active .opt').last().click();            // blocking licence
  await page.waitForTimeout(250);
  await page.click('.sec.active .sec-foot button.btn-primary');
  await page.waitForSelector('#view-result:not(.hidden)', { timeout: 8000 });
  await page.waitForTimeout(350);
  const changed = (await page.textContent('.verdict h1')).trim();
  console.log('  after edit:', changed, '(was PROCEED)');

  // Capture the form part-way through, to check the progressive reveal.
  await page.click('#btn-home-2');
  await page.waitForTimeout(200);
  await page.click('#btn-start');
  await page.waitForTimeout(250);
  await page.click('.sec.active .opt:nth-child(4)');          // business type
  await page.waitForTimeout(150);
  await page.locator('.sec.active .q:nth-child(2) .opt').first().click();
  await page.waitForTimeout(150);
  await page.locator('.sec.active .q:nth-child(3) .opt').nth(2).click();
  await page.waitForTimeout(150);
  await page.click('.sec.active .sec-foot button.btn-primary');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, 'shot-form.png'), fullPage: true });
  await page.goto('file://' + path.join(__dirname, '..', 'web', 'index.html'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, 'shot-landing.png'), fullPage: true });

  await browser.close();

  const ok = changed.startsWith('NOT RECOMMENDED') && !changed.includes('THIS FORM') && verdict.startsWith('PROCEED') && !verdict.includes('CAUTION') && verdict2.startsWith('PROCEED') && histCount === 1 && errors.length === 0;
  if (errors.length) { console.log('\n  page errors:'); errors.forEach(e => console.log('   ', e)); }
  console.log(ok ? '\nEnd-to-end passed.\n' : '\nEnd-to-end FAILED.\n');
  process.exit(ok ? 0 : 1);
})();
