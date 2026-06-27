/**
 * src/gestta/saveSession.js
 *
 * Abre o Gestta num browser VISÍVEL para você fazer login manualmente.
 * Após o login, pressione ENTER no terminal — o script salva a sessão.
 *
 * Execute: npm run save-session:gestta
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

chromium.use(stealth());

const SESSION_PATH = path.join(__dirname, '../../sessions/gestta-session.json');
const URL = process.env.GESTTA_URL || 'https://app.gestta.com.br';

async function saveSession() {
  console.log('\n=== SAVE SESSION — GESTTA ===');
  console.log('Abrindo browser...\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized'],
  });

  const context = await browser.newContext({
    viewport: null,
    locale: 'pt-BR',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  console.log(`URL: ${URL}`);
  console.log(`Login: ${process.env.GESTTA_EMAIL}`);
  console.log('\n👉 Faça login manualmente no browser que abriu.');
  console.log('   Depois que estiver logado e ver a tela principal,');
  console.log('   volte aqui e pressione ENTER para salvar a sessão.\n');

  await waitForEnter();

  await context.storageState({ path: SESSION_PATH });
  console.log(`\n✅ Sessão salva em: ${SESSION_PATH}`);

  await browser.close();
  process.exit(0);
}

function waitForEnter() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Pressione ENTER após fazer login... ', () => {
      rl.close();
      resolve();
    });
  });
}

saveSession().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
