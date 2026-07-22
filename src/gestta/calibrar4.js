/**
 * src/gestta/calibrar4.js
 *
 * Calibra seletores da tarefa "COBRANÇA DE MOVIMENTO MENSAL":
 *   1. Encontra a tarefa na lista e extrai seu task ID
 *   2. Lê o campo "Observação" dos Dados Cadastrais (botão ℹ️)
 *   3. Expande DOCUMENTOS SOLICITADOS → lê status de cada item
 *   4. Expande CHECKLIST → lê texto de cada item
 *
 * Execute: node src/gestta/calibrar4.js
 */

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

chromium.use(stealth());

const SESSION_PATH = path.join(__dirname, '../../sessions/gestta-session.json');
const SCREENSHOTS_PATH = path.join(__dirname, '../../screenshots');
const COMPANY_USER = '6a0f5f8891844ae54d5b6853';

function urlListaTodas(ano, mes) {
  const start = new Date(ano, mes - 1, 1, 3, 0, 0).toISOString();
  const end   = new Date(ano, mes, 1, 2, 59, 59).toISOString();
  const qs = [
    'type=SERVICE_ORDER', 'type=RECURRENT', 'type=ACCOUNTING',
    `company_user=${COMPANY_USER}`, 'company_user=NO_OWNER',
    `start_date=${encodeURIComponent(start)}`,
    `end_date=${encodeURIComponent(end)}`,
    'status=OPEN',
    'overdue=0', 'downloaded=0', 'not_downloaded=0', 'fine=0', 'on_time=0',
    'collaborator=0', 'email_not_sent=0', 'without_external_user=0',
  ].join('&');
  return `https://app.gestta.com.br/#/sidebar/task/overview/dashboard?${qs}`;
}

async function calibrar4() {
  console.log('\n=== CALIBRAÇÃO 4 — COBRANÇA DE MOVIMENTO MENSAL ===\n');

  if (!fs.existsSync(SESSION_PATH)) {
    console.error('ERRO: sessão não encontrada. Rode: npm run save-session:gestta');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false, args: ['--start-maximized'] });
  const context = await browser.newContext({
    storageState: SESSION_PATH,
    viewport: null,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // ── 1. Navega para lista geral de tarefas abertas ──────────────────
  const url = urlListaTodas(2026, 6);
  console.log('[1] Navegando para lista de tarefas abertas (junho 2026)...');
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  if (page.url().includes('login')) {
    console.error('SESSÃO EXPIRADA');
    await browser.close();
    process.exit(1);
  }

  // ── 2. Encontra tarefa COBRANÇA na lista ──────────────────────────
  console.log('\n[2] Procurando tarefa "COBRANÇA DE MOVIMENTO MENSAL"...');
  const taskItems = await page.$$('li.task-item');
  console.log(`    ${taskItems.length} tarefas na lista`);

  let tarefaCobranca = null;
  for (const item of taskItems) {
    const nome = await item.$eval('.task-name span', el => el.textContent.trim()).catch(() => '');
    const cliente = await item.$eval('.task-customer-name', el => el.textContent.trim()).catch(() => '');
    console.log(`    - "${nome}" | ${cliente}`);
    if (nome.toUpperCase().includes('COBRAN')) {
      tarefaCobranca = item;
      console.log(`    ✓ Encontrada!`);
    }
  }

  if (!tarefaCobranca) {
    console.log('\n    Nenhuma COBRANÇA na lista atual. Listando todas as tarefas visíveis...');
    await page.screenshot({ path: path.join(SCREENSHOTS_PATH, 'cobranca-lista.png'), fullPage: true });
    console.log('    Screenshot salvo. Encerrando.');
    await page.waitForTimeout(60000);
    await browser.close();
    return;
  }

  // ── 3. Clica na tarefa e extrai o task ID da URL ───────────────────
  console.log('\n[3] Clicando na tarefa COBRANÇA...');
  await tarefaCobranca.click();
  await page.waitForTimeout(2000);

  const urlAtual = page.url();
  const matchId = urlAtual.match(/dashboard\/([0-9a-f]{24})/);
  const tarefaId = matchId ? matchId[1] : null;
  console.log(`    URL: ${urlAtual.slice(0, 100)}`);
  console.log(`    Task ID: ${tarefaId}`);

  await page.screenshot({ path: path.join(SCREENSHOTS_PATH, 'cobranca-detalhe.png'), fullPage: true });

  // ── 4. Lê Dados Cadastrais (botão ℹ️) ────────────────────────────
  console.log('\n[4] Abrindo Dados Cadastrais (botão ℹ️)...');
  const infoBtn = await page.$('button[ng-click*="openCustomerInfoModal"], [ng-click*="customerInfo"], i.fa-info-circle, button.info-button');
  if (!infoBtn) {
    // Tenta pelo aria-label ou título
    const btns = await page.evaluate(() => {
      const todos = [];
      document.querySelectorAll('button, a, i').forEach(el => {
        const txt = (el.title || el.getAttribute('aria-label') || el.className || '').toLowerCase();
        if (txt.includes('info') || txt.includes('dados') || txt.includes('cadastr')) {
          todos.push({ tag: el.tagName, class: el.className?.slice(0, 80), ngClick: el.getAttribute('ng-click'), title: el.title });
        }
      });
      return todos.slice(0, 10);
    });
    console.log('    Botão ℹ️ não encontrado pelos seletores padrão. Candidatos:', JSON.stringify(btns, null, 2));
  } else {
    await infoBtn.click({ force: true });
    await page.waitForTimeout(2000);

    // Extrai o campo Observação
    const observacao = await page.evaluate(() => {
      // Procura por label "Observação" ou "Observacao"
      const todos = document.querySelectorAll('*');
      for (const el of todos) {
        const txt = el.textContent?.trim();
        if ((txt?.startsWith('Observação') || txt?.startsWith('Observacao')) && txt.length > 20) {
          return txt;
        }
      }
      // Fallback: pega todo o texto do painel lateral
      const painel = document.querySelector('.modal-body, .dados-cadastrais, [class*="customer-info"], [class*="modal"]');
      return painel ? painel.innerText?.slice(0, 2000) : 'Painel não encontrado';
    });
    console.log('\n    OBSERVAÇÃO DO CLIENTE:');
    console.log('   ', observacao?.slice(0, 500));

    await page.screenshot({ path: path.join(SCREENSHOTS_PATH, 'cobranca-dados-cadastrais.png'), fullPage: true });

    // Fecha o painel
    const fechar = await page.$('button.close, [ng-click*="close"], .modal-header button');
    if (fechar) await fechar.click();
    await page.waitForTimeout(1000);
  }

  // ── 5. Inspeciona estrutura do botão ℹ️ diretamente ─────────────
  console.log('\n[5] Mapeando todos os botões na área do header da tarefa...');
  const headerBtns = await page.evaluate(() => {
    const area = document.querySelector('.task-detail, .task-overview, [class*="task-detail"], main, .content');
    const btns = (area || document).querySelectorAll('button, a[ng-click], i[ng-click]');
    return Array.from(btns).slice(0, 20).map(el => ({
      tag: el.tagName,
      text: el.textContent?.trim().slice(0, 40),
      class: el.className?.toString().slice(0, 80),
      ngClick: el.getAttribute('ng-click'),
      title: el.title || el.getAttribute('tooltip') || el.getAttribute('uib-tooltip') || '',
    }));
  });
  console.log(JSON.stringify(headerBtns, null, 2));

  // ── 6. Expande DOCUMENTOS SOLICITADOS ────────────────────────────
  console.log('\n[6] Expandindo DOCUMENTOS SOLICITADOS...');
  try {
    const docsHeader = page.locator('text=DOCUMENTOS SOLICITADOS').first();
    await docsHeader.click({ force: true });
    await page.waitForTimeout(2000);

    const docsInfo = await page.evaluate(() => {
      const items = [];
      // Procura pelos acordeões de documentos
      document.querySelectorAll('a.accordion-toggle[aria-controls], [class*="document-request"]').forEach(el => {
        const nome = el.querySelector('.doc-name, .document-name, strong, b, span')?.textContent?.trim() || el.textContent?.trim().slice(0, 60);
        const panelId = el.getAttribute('aria-controls') || el.getAttribute('href')?.replace('#', '');
        const panel = panelId ? document.getElementById(panelId) : null;
        const status = panel?.querySelector('[class*="desconsider"], [class*="enviado"], [class*="sent"]')?.textContent?.trim()
          || panel?.textContent?.trim().slice(0, 100);
        items.push({ nome, panelId, statusRaw: status?.slice(0, 120) });
      });
      return items;
    });
    console.log('    Itens DOCUMENTOS SOLICITADOS:');
    docsInfo.forEach((d, i) => console.log(`    [${i+1}] "${d.nome}" | panel: ${d.panelId} | status: ${d.statusRaw?.slice(0, 80)}`));

  } catch (e) {
    console.log('    Erro ao expandir DOCUMENTOS:', e.message);
  }

  // ── 7. Expande CHECKLIST ──────────────────────────────────────────
  console.log('\n[7] Expandindo CHECKLIST...');
  try {
    const checklistHeader = page.locator('text=CHECKLIST').first();
    await checklistHeader.click({ force: true });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: path.join(SCREENSHOTS_PATH, 'cobranca-checklist.png'), fullPage: true });

    const checklistInfo = await page.evaluate(() => {
      const items = [];
      // Tenta seletores comuns de checklist
      const seletores = [
        '[ng-repeat*="checklist"] label',
        '[ng-repeat*="item"] .item-text',
        '.checklist-item label',
        'input[type="checkbox"]',
        '[class*="checklist"] li',
      ];
      for (const sel of seletores) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          els.forEach((el, i) => {
            const checked = el.type === 'checkbox' ? el.checked : el.classList.contains('checked');
            const texto = el.textContent?.trim().slice(0, 150) || el.getAttribute('ng-model') || '';
            if (texto) items.push({ idx: i+1, checked, texto, seletor: sel, class: el.className?.toString().slice(0, 60) });
          });
          if (items.length > 0) break;
        }
      }
      // Fallback: dump do HTML da seção CHECKLIST
      if (items.length === 0) {
        const section = Array.from(document.querySelectorAll('*')).find(
          el => el.textContent?.trim() === 'CHECKLIST' && el.tagName !== 'SCRIPT'
        );
        const container = section?.closest('[ng-repeat], .panel, .card, [class*="checklist"]');
        return [{ fallback: container?.innerHTML?.slice(0, 1000) || 'não encontrado' }];
      }
      return items;
    });
    console.log('    Itens CHECKLIST:');
    checklistInfo.forEach(c => {
      if (c.fallback) {
        console.log('    FALLBACK HTML:', c.fallback.slice(0, 500));
      } else {
        console.log(`    [${c.idx}] ${c.checked ? '[x]' : '[ ]'} "${c.texto}" | sel: ${c.seletor}`);
      }
    });

  } catch (e) {
    console.log('    Erro ao expandir CHECKLIST:', e.message);
  }

  // ── 8. Dump HTML completo da tarefa ──────────────────────────────
  console.log('\n[8] Salvando HTML...');
  const html = await page.content();
  fs.writeFileSync(path.join(SCREENSHOTS_PATH, 'cobranca-dump.html'), html);
  console.log('    HTML salvo em screenshots/cobranca-dump.html');

  console.log('\n✅ Calibração 4 concluída. Browser aberto. Ctrl+C para fechar.\n');
  await page.waitForTimeout(120000);
  await browser.close();
}

calibrar4().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
