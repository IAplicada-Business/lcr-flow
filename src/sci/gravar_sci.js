/**
 * src/sci/gravar_sci.js
 *
 * Faz login automático no portal Citrix e tira screenshots a cada 3s
 * enquanto você navega manualmente no SCI Único (canvas RDP).
 *
 * Objetivo: mapear a sequência de teclas/cliques para automatizar depois.
 *
 * Execute: node src/sci/gravar_sci.js
 * Pressione Ctrl+C quando terminar a gravação.
 */

const path    = require('path');
const fs      = require('fs');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { launchChrome } = require('./chrome_launcher');
const SCI_URL = process.env.SCI_URL || 'https://novalcr.levelcloud.com.br';

const SESSION_DIR = path.join(__dirname, '../../screenshots/sci-gravacao-' + Date.now());
fs.mkdirSync(SESSION_DIR, { recursive: true });

let frameIdx = 0;
let canvasPage = null;

async function tirarScreenshot() {
  if (!canvasPage) return;
  try {
    const n = String(++frameIdx).padStart(4, '0');
    const p = path.join(SESSION_DIR, `frame-${n}.png`);
    await canvasPage.screenshot({ path: p }).catch(() => {});
  } catch {}
}

async function main() {
  console.log('\n=== GRAVAÇÃO SCI ÚNICO ===');
  console.log('Screenshots salvas em:', SESSION_DIR);
  console.log('Intervalo: 3 segundos\n');

  const { browser, context, page } = await launchChrome(SCI_URL);

  // ── 1° Login (level40) ────────────────────────────────────────────────────
  console.log('[1] Carregando portal e fazendo 1° login (level40)...');
  await page.goto(SCI_URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000);

  const username = process.env.SCI_USER_LEVEL || 'level40';
  const password = process.env.SCI_PASSWORD_LEVEL || '';

  const loginOk = await page.mainFrame().evaluate(({ user, pass }) => {
    const loginEl = document.querySelector('#Editbox1, input[name="Login"]');
    const passEl  = document.querySelector('#Editbox2, input[name="Password"]');
    const html5El = document.querySelector('#accesstypeuserchoice_html5');
    if (!loginEl) return false;
    loginEl.value = user;
    loginEl.dispatchEvent(new Event('input', { bubbles: true }));
    loginEl.dispatchEvent(new Event('change', { bubbles: true }));
    if (passEl) {
      passEl.value = pass;
      passEl.dispatchEvent(new Event('input', { bubbles: true }));
      passEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (html5El) html5El.click();
    const btn = document.querySelector('#buttonLogOn');
    if (btn) btn.click();
    return true;
  }, { user: username, pass: password }).catch(() => false);

  console.log(`    Login enviado: ${loginOk}`);
  console.log('    Aguardando 10s para a sessão HTML5 abrir...\n');
  await page.waitForTimeout(10000);

  // ── Detecta aba com canvas (sessão HTML5) ─────────────────────────────────
  console.log('[2] Procurando sessão HTML5 com canvas...');
  for (let tentativa = 0; tentativa < 15; tentativa++) {
    const abas = context.pages();
    for (const aba of abas) {
      const url = aba.url();
      if (url.includes('html5.html') || url.includes('html5')) {
        const temCanvas = await aba.$('canvas').catch(() => null);
        if (temCanvas) {
          canvasPage = aba;
          break;
        }
      }
    }
    if (canvasPage) break;
    await page.waitForTimeout(2000);
  }

  if (!canvasPage) {
    // Tenta qualquer aba com canvas
    for (const aba of context.pages()) {
      const temCanvas = await aba.$('canvas').catch(() => null);
      if (temCanvas) { canvasPage = aba; break; }
    }
  }

  if (!canvasPage) {
    console.log('\n⚠️  Sessão HTML5 não encontrada automaticamente.');
    console.log('   Abas abertas:');
    context.pages().forEach((p, i) => console.log(`   [${i}] ${p.url()}`));
    console.log('\n   Verifique se a sessão abriu e pressione ENTER para continuar...\n');
    await waitForEnter();
    canvasPage = context.pages().slice(-1)[0];
  }

  await canvasPage.bringToFront();
  console.log(`\n✅ Sessão encontrada: ${canvasPage.url()}`);

  // ── Inicia gravação ───────────────────────────────────────────────────────
  console.log('\n=======================================================');
  console.log(' GRAVAÇÃO INICIADA — interval 3s');
  console.log('');
  console.log(' Agora navegue no SCI Único manualmente:');
  console.log(' 1. Faça o 2° login (mariana.marques@lcr) se necessário');
  console.log(' 2. Vá em: Integrações → Importações → Lançamentos via planilha');
  console.log(' 3. Selecione empresa, período, arquivo');
  console.log(' 4. Clique em Importar dados');
  console.log('');
  console.log(' Quando terminar, pressione Ctrl+C');
  console.log('=======================================================\n');

  // Tira screenshot inicial
  await tirarScreenshot();

  // Intervalo de 3 segundos
  const intervalo = setInterval(tirarScreenshot, 3000);

  // Aguarda Ctrl+C
  process.on('SIGINT', async () => {
    clearInterval(intervalo);
    await tirarScreenshot(); // frame final
    console.log(`\n✅ Gravação encerrada. ${frameIdx} frames em: ${SESSION_DIR}`);
    console.log('\nAnálise: abra as imagens em ordem para ver a sequência completa.\n');
    await browser.close().catch(() => {});
    process.exit(0);
  });

  // Loop para manter o processo vivo
  await new Promise(() => {});
}

function waitForEnter() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Pressione ENTER para continuar... ', () => { rl.close(); resolve(); });
  });
}

main().catch(err => {
  console.error('\nERRO:', err.message);
  process.exit(1);
});
