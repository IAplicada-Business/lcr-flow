/**
 * Captura HTML do detalhe da tarefa e mapeia o botão "Baixar tudo".
 * Execute: node src/gestta/calibrar3.js
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

chromium.use(stealth());

const SESSION_PATH     = path.join(__dirname, '../../sessions/gestta-session.json');
const SCREENSHOTS_PATH = path.join(__dirname, '../../screenshots');
const TASK_ID = '6a0d252f7bbe44553bd573ee';
const COMPANY_USER = '6a0f5f8891844ae54d5b6853';

async function calibrar3() {
  console.log('\n=== CALIBRAÇÃO 3 — DETALHE DA TAREFA ===\n');

  const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
  const context = await browser.newContext({
    storageState: SESSION_PATH,
    viewport: null,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const start = new Date(2026, 5, 1, 3, 0, 0).toISOString();
  const end   = new Date(2026, 6, 1, 2, 59, 59).toISOString();
  const qs = [
    'type=SERVICE_ORDER','type=RECURRENT','type=ACCOUNTING',
    `company_user=${COMPANY_USER}`,'company_user=NO_OWNER',
    `start_date=${encodeURIComponent(start)}`,`end_date=${encodeURIComponent(end)}`,
    'status=OPEN','os_workflow=1','document_request_sent=1',
    'overdue=0','downloaded=0','not_downloaded=0','fine=0','on_time=0',
    'collaborator=0','email_not_sent=0','without_external_user=0',
  ].join('&');

  const url = `https://app.gestta.com.br/#/sidebar/task/overview/dashboard/${TASK_ID}?${qs}`;
  console.log('[1] Navegando para detalhe da tarefa...');
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Screenshot do estado inicial
  await page.screenshot({ path: path.join(SCREENSHOTS_PATH, 'detalhe-antes.png'), fullPage: true });
  console.log('[2] Screenshot do estado inicial salvo.');

  // Inspeciona o botão "Baixar tudo"
  console.log('\n[3] Inspecionando "Baixar tudo"...');
  const info = await page.evaluate(() => {
    const todos = [];
    document.querySelectorAll('*').forEach(el => {
      if (el.textContent?.trim() === 'Baixar tudo' || el.innerText?.trim() === 'Baixar tudo') {
        todos.push({
          tag: el.tagName,
          disabled: el.disabled,
          ariaDisabled: el.getAttribute('aria-disabled'),
          ngDisabled: el.getAttribute('ng-disabled'),
          ngClick: el.getAttribute('ng-click'),
          class: el.className?.toString().slice(0, 100),
          style: el.getAttribute('style') || '',
          outerHTML: el.outerHTML?.slice(0, 300),
        });
      }
    });
    return todos;
  });
  console.log(JSON.stringify(info, null, 2));

  // Inspeciona o header "DOCUMENTOS SOLICITADOS"
  console.log('\n[4] Inspecionando "DOCUMENTOS SOLICITADOS"...');
  const headerInfo = await page.evaluate(() => {
    const todos = [];
    document.querySelectorAll('*').forEach(el => {
      const txt = el.textContent?.trim();
      if (txt === 'DOCUMENTOS SOLICITADOS' || el.innerText?.trim() === 'DOCUMENTOS SOLICITADOS') {
        todos.push({
          tag: el.tagName,
          ngClick: el.getAttribute('ng-click'),
          class: el.className?.toString().slice(0, 120),
          outerHTML: el.outerHTML?.slice(0, 400),
        });
      }
    });
    return todos;
  });
  console.log(JSON.stringify(headerInfo, null, 2));

  // Clica no header para expandir
  console.log('\n[5] Clicando em "DOCUMENTOS SOLICITADOS" para expandir...');
  const header = page.locator('text=DOCUMENTOS SOLICITADOS').first();
  await header.click({ force: true });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: path.join(SCREENSHOTS_PATH, 'detalhe-expandido.png'), fullPage: true });
  console.log('Screenshot após expandir salvo.');

  // Tenta clicar "Baixar tudo" após expandir
  console.log('\n[6] Tentando clicar "Baixar tudo" após expandir...');
  const btnInfo2 = await page.evaluate(() => {
    const todos = [];
    document.querySelectorAll('*').forEach(el => {
      if (el.textContent?.trim() === 'Baixar tudo') {
        todos.push({
          tag: el.tagName,
          disabled: el.disabled,
          ngDisabled: el.getAttribute('ng-disabled'),
          ngClick: el.getAttribute('ng-click'),
          class: el.className?.toString().slice(0, 120),
          outerHTML: el.outerHTML?.slice(0, 400),
        });
      }
    });
    return todos;
  });
  console.log('Estado do botão após expandir:', JSON.stringify(btnInfo2, null, 2));

  // Salva HTML do estado expandido
  const html = await page.content();
  fs.writeFileSync(path.join(SCREENSHOTS_PATH, 'detalhe-dump.html'), html);
  console.log('\nHTML salvo em screenshots/detalhe-dump.html');

  console.log('\nBrowser aberto. Ctrl+C para fechar.');
  await page.waitForTimeout(120000);
  await browser.close();
}

calibrar3().catch(err => { console.error('Erro:', err.message); process.exit(1); });
