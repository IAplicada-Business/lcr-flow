/**
 * src/sci/calibrar_sci.js
 *
 * Mapeia o portal Citrix (novalcr.levelcloud.com.br) — lida com iframes,
 * canvas e multi-frame. Faz o 1° login e captura o que aparece dentro.
 *
 * Execute: node src/sci/calibrar_sci.js
 */

const path = require('path');
const fs   = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { launchChrome } = require('./chrome_launcher');
const SCREENS_PATH = path.join(__dirname, '../../screenshots');
const SCI_URL      = process.env.SCI_URL || 'https://novalcr.levelcloud.com.br';

fs.mkdirSync(SCREENS_PATH, { recursive: true });

let shotIdx = 0;
async function shot(page, nome) {
  const n = String(++shotIdx).padStart(2, '0');
  const p = path.join(SCREENS_PATH, `sci-${n}-${nome}.png`);
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  console.log(`  📸 ${p}`);
}

// Preenche campo usando JS direto (funciona mesmo em elementos que Playwright não consegue clicar)
async function fillJS(page, seletor, valor) {
  return page.evaluate(({ sel, val }) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { sel: seletor, val: valor });
}

async function clickJS(page, seletor) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.click();
    return true;
  }, seletor);
}

// Busca um seletor em todos os frames (inclusive aninhados)
async function buscarEmFrames(page, seletor) {
  const frames = page.frames();
  for (const frame of frames) {
    try {
      const el = await frame.$(seletor);
      if (el) return { frame, el };
    } catch {}
  }
  return null;
}

async function main() {
  console.log('\n=== CALIBRAÇÃO SCI ÚNICO ===\n');

  const { browser, context, page } = await launchChrome(SCI_URL);

  // ── ETAPA 1: carrega portal ──────────────────────────────────────────────
  console.log('[1] Carregando portal...');
  await page.goto(SCI_URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(3000);
  await shot(page, 'portal-inicial');
  console.log(`    URL: ${page.url()}`);

  // Mapeia todos os frames
  const frames = page.frames();
  console.log(`    Frames: ${frames.length}`);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const url = f.url();
    const nome = f.name();
    console.log(`    [frame ${i}] name="${nome}" url="${url}"`);
    // Conta elementos dentro do frame
    const inputs = await f.$$('input, select, button').catch(() => []);
    if (inputs.length > 0) console.log(`      → ${inputs.length} input(s)`);
    const canvas = await f.$$('canvas').catch(() => []);
    if (canvas.length > 0) console.log(`      → ${canvas.length} canvas`);
  }

  // ── ETAPA 2: tenta 1° login via JS (level40) ────────────────────────────
  console.log('\n[2] Tentando 1° login via JavaScript...');

  const username = process.env.SCI_USER_LEVEL || 'level40';
  const password = process.env.SCI_PASSWORD_LEVEL || '';

  // Tenta em cada frame
  let loginFrame = null;
  for (const frame of page.frames()) {
    const temLogin = await frame.$('#Editbox1, input[name="Login"]').catch(() => null);
    if (temLogin) {
      loginFrame = frame;
      console.log(`    Frame com login: "${frame.name()}" | ${frame.url()}`);
      break;
    }
  }

  const alvo = loginFrame || page.mainFrame();

  // Preenche via JS
  const okUser = await alvo.evaluate(({ user, pass }) => {
    const loginEl = document.querySelector('#Editbox1, input[name="Login"]');
    const passEl  = document.querySelector('#Editbox2, input[name="Password"]');
    const html5El = document.querySelector('#accesstypeuserchoice_html5');
    if (!loginEl) return { ok: false, motivo: 'login não encontrado' };
    loginEl.value = user;
    loginEl.dispatchEvent(new Event('input', { bubbles: true }));
    loginEl.dispatchEvent(new Event('change', { bubbles: true }));
    if (passEl) {
      passEl.value = pass;
      passEl.dispatchEvent(new Event('input', { bubbles: true }));
      passEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (html5El) html5El.click();
    return { ok: true, temPass: !!passEl, temHtml5: !!html5El };
  }, { user: username, pass: password }).catch(e => ({ ok: false, motivo: e.message }));

  console.log(`    Preenchimento: ${JSON.stringify(okUser)}`);
  await shot(page, '1login-preenchido');

  // Clica no botão de login via JS
  const clicou = await alvo.evaluate(() => {
    const btn = document.querySelector('#buttonLogOn, input[type="submit"], button[type="submit"], input[type="button"][value*="og"]');
    if (btn) { btn.click(); return true; }
    return false;
  }).catch(() => false);
  console.log(`    Clicou em Login: ${clicou}`);

  // Aguarda navegação / nova aba
  console.log('    Aguardando 8s para carregar...');
  await page.waitForTimeout(8000);
  await shot(page, '1login-resultado');

  // ── ETAPA 3: o que abriu? ────────────────────────────────────────────────
  console.log('\n[3] Analisando resultado do 1° login...');
  const todasAbas = context.pages();
  console.log(`    Abas: ${todasAbas.length}`);

  for (let i = 0; i < todasAbas.length; i++) {
    const p2 = todasAbas[i];
    console.log(`\n  === ABA ${i} ===`);
    console.log(`    URL: ${p2.url()}`);
    await p2.bringToFront();
    await p2.waitForTimeout(2000);
    await shot(p2, `aba${i}`);

    const frames2 = p2.frames();
    console.log(`    Frames: ${frames2.length}`);
    for (let j = 0; j < frames2.length; j++) {
      const f2 = frames2[j];
      console.log(`    [f${j}] url="${f2.url()}" name="${f2.name()}"`);

      const canvas2 = await f2.$$('canvas').catch(() => []);
      if (canvas2.length > 0) console.log(`      → ${canvas2.length} canvas (app remoto?)`);

      const inputs2 = await f2.$$eval('input, select', els => els.map(e => ({
        tag: e.tagName, type: e.type, id: e.id, name: e.name,
        placeholder: e.placeholder, visible: e.offsetParent !== null
      }))).catch(() => []);
      if (inputs2.length > 0) {
        console.log(`      → ${inputs2.length} inputs:`);
        inputs2.forEach(x => console.log(`        [${x.type}] id="${x.id}" name="${x.name}" placeholder="${x.placeholder}" visible=${x.visible}`));
      }

      const txt = await f2.evaluate(() => document.body?.innerText?.slice(0, 400)).catch(() => '');
      if (txt?.trim()) console.log(`      Texto: ${txt.replace(/\n/g, ' ').slice(0, 200)}`);
    }
  }

  console.log('\n=== CALIBRAÇÃO CONCLUÍDA ===');
  console.log(`Screenshots: ${SCREENS_PATH}`);
  console.log('\nBrowser aberto. Ctrl+C para fechar.\n');
  await new Promise(() => {});
}

main().catch(err => {
  console.error('\nERRO:', err.message);
  process.exit(1);
});
