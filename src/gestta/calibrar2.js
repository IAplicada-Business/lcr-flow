/**
 * src/gestta/calibrar2.js
 *
 * Navega para a lista "Abertas e com cobrança" (sidebar) e mapeia
 * a estrutura das linhas de tarefa para corrigir os seletores do index.js.
 *
 * Execute: node src/gestta/calibrar2.js
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

chromium.use(stealth());

const SESSION_PATH = path.join(__dirname, '../../sessions/gestta-session.json');
const SCREENSHOTS_PATH = path.join(__dirname, '../../screenshots');
const COMPANY_USER = '6a0f5f8891844ae54d5b6853'; // ID fixo da conta Mariana

function gerarUrlAbertasComCobranca() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = agora.getMonth(); // 0-indexed
  const startDate = new Date(ano, mes, 1, 3, 0, 0).toISOString();
  const endDate   = new Date(ano, mes + 1, 1, 2, 59, 59).toISOString();

  const params = new URLSearchParams({
    type: ['SERVICE_ORDER', 'RECURRENT', 'ACCOUNTING'],
    company_user: [COMPANY_USER, 'NO_OWNER'],
    is_mutual_company_grouper: '0',
    start_date: startDate,
    end_date: endDate,
    status: 'OPEN',
    os_workflow: '1',
    overdue: '0',
    downloaded: '0',
    not_downloaded: '0',
    fine: '0',
    on_time: '0',
    collaborator: '0',
    email_not_sent: '0',
    document_request_sent: '1',
    without_external_user: '0',
    cross_access: '1',
  });

  // URLSearchParams não suporta arrays corretamente — montar na mão
  const qs = [
    'type=SERVICE_ORDER', 'type=RECURRENT', 'type=ACCOUNTING',
    `company_user=${COMPANY_USER}`, 'company_user=NO_OWNER',
    'is_mutual_company_grouper=0',
    `start_date=${encodeURIComponent(startDate)}`,
    `end_date=${encodeURIComponent(endDate)}`,
    'status=OPEN', 'os_workflow=1',
    'overdue=0', 'downloaded=0', 'not_downloaded=0', 'fine=0', 'on_time=0',
    'collaborator=0', 'email_not_sent=0', 'document_request_sent=1',
    'without_external_user=0', 'cross_access=1',
  ].join('&');

  return `https://app.gestta.com.br/#/sidebar/task/overview/dashboard?${qs}`;
}

async function calibrar2() {
  console.log('\n=== CALIBRAÇÃO GESTTA — PASSO 2: LISTA DE TAREFAS ===\n');

  const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
  const context = await browser.newContext({
    storageState: SESSION_PATH,
    viewport: null,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // ── Intercepta chamadas de API para capturar dados das tarefas ─────────
  const apiRespostas = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/') && url.includes('task')) {
      try {
        const body = await response.json();
        apiRespostas.push({ url, body });
      } catch {}
    }
  });

  // ── 1. Navega para /tarefas primeiro ──────────────────────────────────
  console.log('[1/5] Navegando para /tarefas...');
  await page.goto('https://app.gestta.com.br/tarefas', { waitUntil: 'networkidle', timeout: 30000 });

  if (page.url().includes('login')) {
    console.error('SESSAO EXPIRADA');
    await browser.close();
    process.exit(1);
  }
  await page.waitForTimeout(2000);

  // ── 2. Navega para a URL de "Abertas e com cobrança" ──────────────────
  const urlSidebar = gerarUrlAbertasComCobranca();
  console.log('[2/5] Navegando para sidebar "Abertas e com cobrança"...');
  console.log('     URL:', urlSidebar.slice(0, 120) + '...');
  await page.goto(urlSidebar, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);

  // ── 3. Screenshot do estado atual ─────────────────────────────────────
  console.log('[3/5] Tirando screenshot...');
  const shot = path.join(SCREENSHOTS_PATH, 'gestta-sidebar-tarefas.png');
  await page.screenshot({ path: shot, fullPage: true });
  console.log('      Salvo:', shot);

  // ── 4. Mapeia estrutura do sidebar ────────────────────────────────────
  console.log('[4/5] Analisando estrutura da lista...');

  const estrutura = await page.evaluate(() => {
    // Procura por elementos que podem ser linhas de tarefa
    const candidatos = [
      // data-testid com "task" ou "tarefa"
      ...document.querySelectorAll('[data-testid*="task"], [data-testid*="tarefa"]'),
      // Elementos com atributos data-id que contenham empresa/cliente
      ...document.querySelectorAll('[data-id], [data-task-id], [data-empresa]'),
      // Links dentro de containers que parecem listas
      ...document.querySelectorAll('aside a, .sidebar a, [role="dialog"] a'),
    ];

    // Coleta texto e atributos de cada candidato
    const vistos = new Set();
    return Array.from(candidatos)
      .filter(el => {
        const txt = el.textContent?.trim();
        if (!txt || vistos.has(txt)) return false;
        vistos.add(txt);
        return true;
      })
      .slice(0, 20)
      .map(el => ({
        tag: el.tagName.toLowerCase(),
        testid: el.getAttribute('data-testid') || '',
        dataId: el.getAttribute('data-id') || el.getAttribute('data-task-id') || '',
        classes: el.className?.toString().slice(0, 100),
        href: el.href || '',
        texto: el.textContent?.trim().slice(0, 120),
      }));
  });

  if (estrutura.length > 0) {
    console.log('\nCandidatos a linhas de tarefa:');
    estrutura.forEach((el, i) => {
      console.log(`\n[${i + 1}] <${el.tag}>${el.testid ? ' testid=' + el.testid : ''}${el.dataId ? ' data-id=' + el.dataId : ''}`);
      console.log(`    href: ${el.href?.slice(0, 80) || '(sem href)'}`);
      console.log(`    texto: "${el.texto}"`);
      console.log(`    classes: "${el.classes}"`);
    });
  } else {
    console.log('Nenhum candidato detectado — o sidebar pode não ter carregado.');
    console.log('Inspecione o browser manualmente (F12 → Elements).');
  }

  // ── 5. Salva HTML do estado atual ─────────────────────────────────────
  console.log('\n[5/5] Salvando HTML do estado atual...');
  const html = await page.content();
  const dumpPath = path.join(SCREENSHOTS_PATH, 'gestta-sidebar-dump.html');
  fs.writeFileSync(dumpPath, html, 'utf8');
  console.log('     HTML salvo:', dumpPath, `(${(html.length / 1024).toFixed(0)} KB)`);

  // Mostra respostas de API capturadas
  if (apiRespostas.length > 0) {
    console.log(`\n🎯 API capturada: ${apiRespostas.length} resposta(s) com "task"`);
    const dump = path.join(SCREENSHOTS_PATH, 'gestta-api-dump.json');
    fs.writeFileSync(dump, JSON.stringify(apiRespostas.map(r => ({ url: r.url, keys: Object.keys(r.body || {}) })), null, 2));
    console.log('   API dump salvo:', dump);
  }

  console.log('\nBrowser aberto para inspeção. Ctrl+C para fechar.\n');
  await page.waitForTimeout(120000);
  await browser.close();
}

calibrar2().catch(err => {
  console.error('\nErro:', err.message);
  process.exit(1);
});
