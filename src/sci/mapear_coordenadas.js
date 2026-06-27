/**
 * src/sci/mapear_coordenadas.js
 *
 * Mapper visual: injeta um painel no browser mostrando qual elemento clicar.
 * Sem alternar terminal/browser — clique direto no canvas quando o painel pedir.
 *
 * Execute: node src/sci/mapear_coordenadas.js
 */

const path = require('path');
const fs   = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { launchChrome } = require('./chrome_launcher');
const SCI_URL     = process.env.SCI_URL || 'https://novalcr.levelcloud.com.br';
const CONFIG_PATH = path.join(__dirname, '../../config/sci-coordenadas.json');
const SCREENS_PATH = path.join(__dirname, '../../screenshots');

fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
fs.mkdirSync(SCREENS_PATH, { recursive: true });

// Elementos que vamos mapear — na ordem em que serão solicitados
const ELEMENTOS = [
  { nome: 'menu_integracoes',    descricao: 'Menu "Integrações" na barra de menus do SCI (topo)' },
  { nome: 'menu_importacoes',    descricao: 'Item "Importações" no submenu que abriu' },
  { nome: 'menu_lancamentos',    descricao: 'Item "Lançamentos contábeis via planilha" no submenu' },
  { nome: 'form_empresa',        descricao: 'Campo Empresa (caixa de texto, não a lupa)' },
  { nome: 'form_data_ini',       descricao: 'Campo Data inicial (DD/MM/AAAA)' },
  { nome: 'form_data_fim',       descricao: 'Campo Data final (DD/MM/AAAA)' },
  { nome: 'form_gerador',        descricao: 'Campo Gerador (caixa de texto)' },
  { nome: 'form_arquivo_icone',  descricao: 'Ícone de PASTA ao lado do campo Arquivo (abre seletor)' },
  { nome: 'btn_importar',        descricao: 'Ícone CHECKMARK azul (confirmar importação) — barra de ferramentas do form' },
];

async function main() {
  console.log('\n=== MAPPER VISUAL DE COORDENADAS SCI ===\n');
  console.log('O script vai abrir o Chrome e mostrar um painel overlay no browser.');
  console.log('Siga as instruções NO BROWSER — clique no elemento pedido.');
  console.log(`Config: ${CONFIG_PATH}\n`);

  const { browser, context, page: portalPage } = await launchChrome(SCI_URL);

  // ── 1° Login ─────────────────────────────────────────────────────────────
  console.log('[1] Fazendo 1° login (level40)...');
  await portalPage.goto(SCI_URL, { waitUntil: 'load', timeout: 30000 });
  await portalPage.waitForTimeout(2000);

  await portalPage.mainFrame().evaluate(({ user, pass }) => {
    const l = document.querySelector('#Editbox1');
    const p = document.querySelector('#Editbox2');
    const h = document.querySelector('#accesstypeuserchoice_html5');
    const b = document.querySelector('#buttonLogOn');
    if (!l) return;
    l.value = user; l.dispatchEvent(new Event('input', { bubbles: true })); l.dispatchEvent(new Event('change', { bubbles: true }));
    if (p) { p.value = pass; p.dispatchEvent(new Event('input', { bubbles: true })); p.dispatchEvent(new Event('change', { bubbles: true })); }
    if (h) h.click();
    if (b) b.click();
  }, { user: process.env.SCI_USER_LEVEL || 'level40', pass: process.env.SCI_PASSWORD_LEVEL || '' }).catch(() => {});

  console.log('[2] Aguardando sessão HTML5 (15s)...');
  await portalPage.waitForTimeout(15000);

  // ── Detecta canvas ────────────────────────────────────────────────────────
  let canvasPage = null;
  for (let t = 0; t < 15; t++) {
    for (const aba of context.pages()) {
      const canvas = await aba.$('canvas').catch(() => null);
      if (canvas && aba.url().includes('html5')) { canvasPage = aba; break; }
    }
    if (canvasPage) break;
    await portalPage.waitForTimeout(2000);
  }
  if (!canvasPage) {
    for (const aba of context.pages()) {
      if (await aba.$('canvas').catch(() => null)) { canvasPage = aba; break; }
    }
  }
  if (!canvasPage) { console.error('Canvas não encontrado.'); process.exit(1); }

  await canvasPage.bringToFront();
  console.log(`\n✅ Canvas: ${canvasPage.url()}`);

  // ── Injeta painel visual e listener de clique ─────────────────────────────
  const coordenadas = fs.existsSync(CONFIG_PATH)
    ? JSON.parse(fs.readFileSync(CONFIG_PATH))
    : {};

  let resolveClique = null;
  let idxAtual = 0;

  await canvasPage.exposeFunction('_onClique', ({ rx, ry, cx, cy, cw, ch }) => {
    if (resolveClique) {
      resolveClique({ rx, ry, cx, cy, cw, ch });
      resolveClique = null;
    }
  });

  await canvasPage.evaluate((elementos) => {
    // Painel overlay
    const panel = document.createElement('div');
    panel.id = '_sci_mapper';
    panel.style.cssText = [
      'position:fixed', 'top:12px', 'right:12px', 'z-index:2147483647',
      'background:rgba(15,15,15,0.92)', 'color:#fff', 'padding:16px 20px',
      'border-radius:10px', 'font:14px/1.5 Arial,sans-serif', 'max-width:320px',
      'box-shadow:0 4px 20px rgba(0,0,0,0.6)', 'pointer-events:none',
      'border:2px solid #4CAF50',
    ].join(';');
    document.body.appendChild(panel);

    window._mapperElementos = elementos;
    window._mapperIdx = 0;
    window._updateMapper = function () {
      const idx = window._mapperIdx;
      const total = window._mapperElementos.length;
      if (idx >= total) {
        panel.innerHTML = '<b style="color:#4CAF50;font-size:16px">✅ Mapeamento concluído!</b><br><small>Pode fechar o browser.</small>';
        return;
      }
      const el = window._mapperElementos[idx];
      panel.innerHTML = `
        <div style="color:#4CAF50;font-size:11px;margin-bottom:6px">📍 ELEMENTO ${idx+1} DE ${total}</div>
        <div style="font-size:15px;font-weight:bold;margin-bottom:6px">${el.nome}</div>
        <div style="color:#ccc;font-size:12px;margin-bottom:10px">${el.descricao}</div>
        <div style="color:#4CAF50;font-size:13px">👆 Clique no elemento indicado acima</div>
      `;
    };
    window._updateMapper();

    // Listener de clique no canvas
    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('click', function(e) {
        const rect = canvas.getBoundingClientRect();
        const cx = Math.round(e.clientX - rect.left);
        const cy = Math.round(e.clientY - rect.top);
        const rx = cx / rect.width;
        const ry = cy / rect.height;
        if (window._onClique) {
          window._onClique({ rx, ry, cx, cy, cw: Math.round(rect.width), ch: Math.round(rect.height) });
        }
      }, true);
    }
  }, ELEMENTOS);

  // ── Loop de mapeamento ────────────────────────────────────────────────────
  console.log('\n=== MAPEAMENTO INICIADO ===');
  console.log('Siga as instruções no painel verde no canto superior direito do browser.\n');

  for (const el of ELEMENTOS) {
    console.log(`Aguardando clique em: ${el.nome}`);
    console.log(`  → ${el.descricao}`);

    // Abre menus antes de pedir clique em submenu
    if (el.nome === 'menu_importacoes' && coordenadas.menu_integracoes) {
      await clicarCoord(canvasPage, coordenadas.menu_integracoes);
      await canvasPage.waitForTimeout(800);
    }
    if (el.nome === 'menu_lancamentos' && coordenadas.menu_importacoes) {
      await clicarCoord(canvasPage, coordenadas.menu_importacoes);
      await canvasPage.waitForTimeout(800);
    }
    if (el.nome.startsWith('form_') && !coordenadas.menu_lancamentos) {
      console.log('  ⚠️  ATENÇÃO: navegue até o formulário de importação no SCI antes de clicar.');
    }

    // Aguarda o clique do usuário no browser
    const clique = await new Promise(res => { resolveClique = res; });

    coordenadas[el.nome] = { rx: clique.rx, ry: clique.ry };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(coordenadas, null, 2));

    console.log(`  ✅ ${el.nome} → rx=${clique.rx.toFixed(4)}, ry=${clique.ry.toFixed(4)} (${clique.cx},${clique.cy} de ${clique.cw}x${clique.ch})\n`);

    // Avança painel
    idxAtual++;
    await canvasPage.evaluate((idx) => {
      window._mapperIdx = idx;
      if (window._updateMapper) window._updateMapper();
    }, idxAtual);

    // Screenshot após cada clique importante
    if (['menu_integracoes', 'form_empresa', 'form_arquivo_icone', 'btn_importar'].includes(el.nome)) {
      const p = path.join(SCREENS_PATH, `mapper-${el.nome}.png`);
      await canvasPage.screenshot({ path: p }).catch(() => {});
      console.log(`  📸 ${p}`);
    }

    await canvasPage.waitForTimeout(500);
  }

  console.log('\n✅ Mapeamento concluído!');
  console.log(`Coordenadas salvas em: ${CONFIG_PATH}`);
  console.log('\nConteúdo:');
  console.log(JSON.stringify(coordenadas, null, 2));

  await browser.close();
  process.exit(0);
}

async function clicarCoord(page, coord) {
  const canvas = await page.$('canvas');
  if (!canvas) return;
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + coord.rx * box.width, box.y + coord.ry * box.height);
}

main().catch(err => { console.error('\nERRO:', err.message); process.exit(1); });
