/**
 * src/sci/saveLevelDriveSession.js
 *
 * Verifica acesso ao LevelDrive (Nextcloud) e salva a sessão para upload.
 *
 * O LevelDrive usa um link de compartilhamento Nextcloud com senha.
 * A autenticação é feita via WebDAV (sem sessão persistente).
 * Este script apenas testa o acesso e confirma que o link está funcionando.
 *
 * Execute: npm run save-session:leveldrive
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

chromium.use(stealth());

const SESSION_PATH  = path.join(__dirname, '../../sessions/leveldrive-session.json');
const SHARE_URL     = process.env.LEVELDRIVE_SHARE_URL;
const FOLDER        = process.env.LEVELDRIVE_FOLDER || '/Integracao/TI/MARI IAPLICADA';
const PASSWORD      = process.env.LEVELDRIVE_PASSWORD;

async function saveSession() {
  console.log('\n=== SAVE SESSION — LEVELDRIVE ===');
  console.log(`Share URL : ${SHARE_URL}`);
  console.log(`Pasta     : ${FOLDER}`);
  console.log('Abrindo browser para verificar acesso...\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized'],
  });

  const context = await browser.newContext({
    viewport: null,
    locale: 'pt-BR',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  // Navega para a pasta de upload
  const fullUrl = `${SHARE_URL}?dir=${encodeURIComponent(FOLDER)}`;
  console.log(`Navegando para: ${fullUrl}`);
  await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Verifica se aparece tela de senha
  await page.waitForTimeout(2000);
  const temSenha = await page.$('input[type="password"], #password, input[name="password"]');
  if (temSenha) {
    console.log('Tela de senha detectada — preenchendo automaticamente...');
    await temSenha.fill(PASSWORD);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
  }

  // Verifica se conseguiu acessar os arquivos
  const url = page.url();
  console.log(`\nURL atual: ${url}`);

  const conteudo = await page.evaluate(() => document.body?.innerText?.slice(0, 200));
  console.log(`Conteúdo: ${conteudo}`);

  console.log('\n👉 Confirme que a pasta está visível no browser.');
  console.log('   Depois pressione ENTER para salvar a sessão.\n');

  await waitForEnter();

  await context.storageState({ path: SESSION_PATH });
  console.log(`\n✅ Sessão salva em: ${SESSION_PATH}`);
  console.log('\nNOTA: O upload será feito via WebDAV — esta sessão é apenas para fallback.');

  await browser.close();
  process.exit(0);
}

function waitForEnter() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Pressione ENTER após verificar o acesso... ', () => {
      rl.close();
      resolve();
    });
  });
}

saveSession().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
