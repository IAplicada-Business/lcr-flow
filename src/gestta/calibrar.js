/**
 * src/gestta/calibrar.js
 *
 * Abre o Gestta com a sessão salva e despeja:
 *   1. Screenshot da tela de tarefas
 *   2. HTML das primeiras linhas da lista (para mapear seletores reais)
 *   3. Todos os textos clicáveis visíveis (botões, filtros, abas)
 *
 * Execute: node src/gestta/calibrar.js
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

chromium.use(stealth());

const SESSION_PATH = path.join(__dirname, '../../sessions/gestta-session.json');
const SCREENSHOTS_PATH = path.join(__dirname, '../../screenshots');
const DUMP_PATH = path.join(__dirname, '../../screenshots/gestta-html-dump.html');

fs.mkdirSync(SCREENSHOTS_PATH, { recursive: true });

async function calibrar() {
  console.log('\n=== CALIBRAÇÃO GESTTA ===\n');

  if (!fs.existsSync(SESSION_PATH)) {
    console.error('ERRO: sessão não encontrada. Rode: npm run save-session:gestta');
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized'],
  });

  const context = await browser.newContext({
    storageState: SESSION_PATH,
    viewport: null,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  // ── 1. Verifica se sessão está válida ──────────────────────────────────
  console.log('[1/4] Navegando para /tarefas...');
  await page.goto('https://app.gestta.com.br/tarefas', { waitUntil: 'networkidle', timeout: 30000 });

  const urlAtual = page.url();
  console.log('     URL após navegação:', urlAtual);

  if (urlAtual.includes('login')) {
    console.error('\nSESSAO EXPIRADA — rode novamente: npm run save-session:gestta');
    await browser.close();
    process.exit(1);
  }

  // Aguarda a página estabilizar
  await page.waitForTimeout(3000);

  // ── 2. Screenshot da página inteira ───────────────────────────────────
  console.log('[2/4] Tirando screenshot...');
  const screenshotPath = path.join(SCREENSHOTS_PATH, 'gestta-tarefas.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('     Salvo em:', screenshotPath);

  // ── 3. Coleta textos clicáveis (botões, filtros, abas) ────────────────
  console.log('[3/4] Coletando elementos clicáveis...');
  const clicaveis = await page.evaluate(() => {
    const els = document.querySelectorAll('button, a, [role="tab"], [role="button"], select, input[type="checkbox"]');
    return Array.from(els)
      .map(el => ({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || el.value || el.placeholder || '').trim().slice(0, 80),
        class: el.className?.toString().slice(0, 80),
        id: el.id || '',
        role: el.getAttribute('role') || '',
        testid: el.getAttribute('data-testid') || '',
        href: el.href || '',
      }))
      .filter(el => el.text || el.testid)
      .slice(0, 60);
  });

  console.log('\n--- Elementos clicáveis encontrados ---');
  clicaveis.forEach((el, i) => {
    console.log(`[${String(i+1).padStart(2)}] <${el.tag}> "${el.text}"${el.testid ? ' [testid=' + el.testid + ']' : ''}${el.id ? ' #' + el.id : ''}`);
  });

  // ── 4. Despeja HTML do body para inspeção ─────────────────────────────
  console.log('\n[4/4] Salvando HTML da página...');
  const html = await page.content();
  fs.writeFileSync(DUMP_PATH, html, 'utf8');
  console.log('     HTML salvo em:', DUMP_PATH);
  console.log('     Tamanho:', (html.length / 1024).toFixed(1), 'KB');

  // ── Tenta localizar itens que parecem tarefas ─────────────────────────
  console.log('\n--- Tentando detectar linhas de tarefa ---');
  const candidatos = await page.evaluate(() => {
    // Testa vários padrões comuns de lista
    const padroes = [
      '[data-testid*="tarefa"]',
      '[data-testid*="task"]',
      '.tarefa',
      '.task',
      'tr[class*="tarefa"]',
      'tr[class*="task"]',
      '[class*="tarefa-item"]',
      '[class*="task-item"]',
      '[class*="task-row"]',
      'tbody tr',
      '[class*="list-item"]',
      '[class*="listItem"]',
    ];

    const resultados = {};
    for (const p of padroes) {
      const encontrados = document.querySelectorAll(p);
      if (encontrados.length > 0) {
        resultados[p] = {
          count: encontrados.length,
          amostra: encontrados[0]?.textContent?.trim().slice(0, 100),
          classe: encontrados[0]?.className?.toString().slice(0, 80),
        };
      }
    }
    return resultados;
  });

  if (Object.keys(candidatos).length === 0) {
    console.log('Nenhum padrão conhecido detectado — analisar HTML dump manualmente');
  } else {
    console.log('Padrões encontrados:');
    for (const [seletor, info] of Object.entries(candidatos)) {
      console.log(`  ${seletor}: ${info.count} elemento(s)`);
      console.log(`    Texto: "${info.amostra}"`);
      console.log(`    Classe: "${info.classe}"`);
    }
  }

  console.log('\n✅ Calibração concluída.');
  console.log('   Screenshot:', screenshotPath);
  console.log('   HTML dump: ', DUMP_PATH);
  console.log('\nO browser ficará aberto. Inspecione o devtools (F12) se necessário.');
  console.log('Pressione Ctrl+C para fechar.\n');

  // Mantém o browser aberto para inspeção manual
  await page.waitForTimeout(120000);
  await browser.close();
}

calibrar().catch(err => {
  console.error('\nErro:', err.message);
  process.exit(1);
});
