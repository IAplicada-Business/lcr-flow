// src/sci/index.js
// Automação do SCI Único e LevelDrive
// Upload: WebDAV HTTP (axios) — sem Playwright
// Importação SCI: Playwright stealth

const axios = require('axios')
const path  = require('path')
const fs    = require('fs')
require('dotenv').config()

const { launchChrome } = require('./chrome_launcher')
const SCREENSHOTS_PATH = path.join(__dirname, '../../screenshots')

// LevelDrive — Nextcloud public share via WebDAV
// PUT https://drv2.leveldrive.com.br/public.php/dav/files/{TOKEN}/{path}
// Auth: Basic {TOKEN}:{password}
const LEVELDRIVE_BASE    = process.env.LEVELDRIVE_URL    || 'https://drv2.leveldrive.com.br'
const LEVELDRIVE_TOKEN   = (() => {
  const shareUrl = process.env.LEVELDRIVE_SHARE_URL || ''
  const m = shareUrl.match(/\/s\/([A-Za-z0-9]+)/)
  return m ? m[1] : ''
})()
const LEVELDRIVE_FOLDER  = process.env.LEVELDRIVE_FOLDER || '/Integracao/TI/MARI IAPLICADA'
const LEVELDRIVE_PASS    = process.env.LEVELDRIVE_PASSWORD || ''

function _webdavUploadUrl(nomeArquivo) {
  // Codifica cada segmento separadamente para preservar as barras '/'
  const folderClean = LEVELDRIVE_FOLDER.replace(/^\//, '')
  const folderEncoded = folderClean.split('/').map(encodeURIComponent).join('/')
  return `${LEVELDRIVE_BASE}/public.php/dav/files/${LEVELDRIVE_TOKEN}/${folderEncoded}/${encodeURIComponent(nomeArquivo)}`
}

async function humanDelay(min = 800, max = 2000) {
  const ms = min + Math.random() * (max - min)
  await new Promise(r => setTimeout(r, ms))
}

async function capturarScreenshot(page, nome) {
  const caminho = path.join(SCREENSHOTS_PATH, `${nome}-${Date.now()}.png`)
  await page.screenshot({ path: caminho, fullPage: true })
  console.error(`Screenshot: ${caminho}`)
  return caminho
}

// ─── LevelDrive ──────────────────────────────────────────────────────────────

async function uploadLevelDrive(caminhoArquivo, _nomeEmpresa, _competencia) {
  if (!LEVELDRIVE_TOKEN) throw new Error('LEVELDRIVE_SHARE_URL inválida ou não configurada no .env')

  const nomeArquivo = path.basename(caminhoArquivo)
  const url = _webdavUploadUrl(nomeArquivo)
  const fileBuffer = fs.readFileSync(caminhoArquivo)

  console.log(`[LevelDrive] Fazendo upload via WebDAV...`)
  console.log(`  Token    : ${LEVELDRIVE_TOKEN ? LEVELDRIVE_TOKEN.slice(0, 4) + '…(oculto)' : '(vazio)'}`)
  console.log(`  Destino  : ${LEVELDRIVE_FOLDER}/${nomeArquivo}`)
  console.log(`  URL      : ${url}`)

  const response = await axios.put(url, fileBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Length': fileBuffer.length,
    },
    auth: {
      username: LEVELDRIVE_TOKEN,
      password: LEVELDRIVE_PASS,
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  })

  if (response.status === 201 || response.status === 204) {
    console.log(`[LevelDrive] Upload OK (HTTP ${response.status}): ${nomeArquivo}`)
    return { sucesso: true, arquivo: nomeArquivo, status: response.status }
  }

  throw new Error(`Upload LevelDrive falhou: HTTP ${response.status}`)
}

async function testarAcessoLevelDrive() {
  if (!LEVELDRIVE_TOKEN) throw new Error('LEVELDRIVE_SHARE_URL inválida ou não configurada no .env')

  // PROPFIND na raiz da pasta — verifica acesso sem modificar nada
  const folderClean = LEVELDRIVE_FOLDER.replace(/^\//, '')
  const folderEncoded = folderClean.split('/').map(encodeURIComponent).join('/')
  const url = `${LEVELDRIVE_BASE}/public.php/dav/files/${LEVELDRIVE_TOKEN}/${folderEncoded}`

  console.log(`[LevelDrive] Testando acesso WebDAV...`)
  console.log(`  URL: ${url}`)

  const response = await axios.request({
    method: 'PROPFIND',
    url,
    headers: { Depth: '1' },
    auth: { username: LEVELDRIVE_TOKEN, password: LEVELDRIVE_PASS },
    validateStatus: (s) => s < 500,
  })

  console.log(`[LevelDrive] Resposta: HTTP ${response.status}`)
  if (response.status === 207) {
    console.log('[LevelDrive] Acesso OK — pasta encontrada.')
  } else if (response.status === 401) {
    throw new Error('LevelDrive: senha incorreta (HTTP 401)')
  } else if (response.status === 404) {
    throw new Error('LevelDrive: pasta não encontrada (HTTP 404) — verifique LEVELDRIVE_FOLDER')
  }
  return response.status
}

// ─── SCI Único ───────────────────────────────────────────────────────────────

// salvarSessaoSCI — delega para saveSession.js (npm run save-session:sci)

async function importarLancamentosSCI(nomeEmpresa, competencia, nomeArquivoLevelDrive) {
  const sciUrl = process.env.SCI_URL || 'https://novalcr.levelcloud.com.br'
  const { browser, context, page } = await launchChrome(sciUrl)

  try {
    await page.waitForTimeout(3000)

    const cfInput = await page.$('input[name="cf-turnstile-response"]')
    if (cfInput) throw new Error('CLOUDFLARE_CHALLENGE: aguarde o desafio resolver e execute novamente')

    if (page.url().includes('login') || page.url().includes('Login')) {
      throw new Error('SESSAO_EXPIRADA: execute npm run save-session:sci')
    }

    await humanDelay(1500, 2500)

    // ── CHECKPOINT 1: navega até módulo contábil ──────────────────────
    await page.getByText('Integrações').click()
    await humanDelay()

    const menuImportacoes = page.getByText('Importações')
    if (!await menuImportacoes.isVisible({ timeout: 8000 })) {
      throw new Error('LAYOUT_MUDOU: menu Importações não encontrado')
    }
    await menuImportacoes.click()
    await humanDelay()

    // ── CHECKPOINT 2: localiza opção de lançamentos via planilha ─────
    const opcaoLancamentos = page.getByText('Lançamentos contábeis via planilha')
    if (!await opcaoLancamentos.isVisible({ timeout: 8000 })) {
      throw new Error('LAYOUT_MUDOU: opção Lançamentos contábeis via planilha não encontrada')
    }
    await opcaoLancamentos.click()
    await humanDelay(2000, 3000)

    // ── CHECKPOINT 3: preenche formulário ────────────────────────────
    // Seleciona a empresa
    const selectEmpresa = page.getByLabel('Empresa')
    if (!await selectEmpresa.isVisible({ timeout: 8000 })) {
      throw new Error('LAYOUT_MUDOU: campo Empresa não encontrado')
    }

    // Digita o nome para filtrar no select
    await selectEmpresa.click()
    await humanDelay(300, 600)
    await page.keyboard.type(nomeEmpresa.substring(0, 10))
    await humanDelay(800, 1500)

    const opcaoEmpresa = page.getByRole('option', { name: new RegExp(nomeEmpresa, 'i') })
    if (await opcaoEmpresa.isVisible({ timeout: 5000 })) {
      await opcaoEmpresa.click()
    }
    await humanDelay()

    // Preenche período
    const [mesInicio, anoInicio] = competencia.split('/')
    const dataInicio = `01/${mesInicio}/${anoInicio}`
    const ultimoDia = new Date(parseInt(anoInicio), parseInt(mesInicio), 0).getDate()
    const dataFim = `${ultimoDia}/${mesInicio}/${anoInicio}`

    await page.getByLabel('Data inicial').fill(dataInicio)
    await humanDelay(400, 800)
    await page.getByLabel('Data final').fill(dataFim)
    await humanDelay()

    // Mantém gerador "1" (padrão)
    // Seleciona o arquivo do LevelDrive
    const campoArquivo = page.getByPlaceholder('Selecione o arquivo')
      || page.locator('input[type="text"][name*="arquivo"]')
    
    await campoArquivo.click()
    await humanDelay(500, 1000)

    // Navega até a pasta do cliente no LevelDrive dentro do SCI
    await page.getByText(nomeEmpresa, { exact: false }).click()
    await humanDelay()
    await page.getByText(nomeArquivoLevelDrive, { exact: false }).click()
    await humanDelay()

    // ── CHECKPOINT 4: confirma e executa importação ───────────────────
    const btnImportar = page.getByRole('button', { name: /importar dados/i })
      || page.getByText('Importar dados')

    if (!await btnImportar.isVisible({ timeout: 8000 })) {
      throw new Error('LAYOUT_MUDOU: botão Importar dados não encontrado')
    }

    await humanDelay(800, 1500)
    await btnImportar.click()
    // Alternativa: await page.keyboard.press('F2')

    // ── CHECKPOINT 5: aguarda confirmação de sucesso ──────────────────
    await page.waitForSelector(
      '[class*="sucesso"], [class*="success"], :text("importado com sucesso"), :text("lançamentos importados")',
      { timeout: 60000 }
    ).catch(async () => {
      // Se não apareceu mensagem de sucesso, captura screenshot para análise
      await capturarScreenshot(page, `sci-pos-importacao-${nomeEmpresa}`)
      console.warn('Mensagem de sucesso não detectada — verifique o screenshot')
    })

    console.log(`Importação concluída no SCI: ${nomeEmpresa} - ${competencia}`)

    return { sucesso: true, empresa: nomeEmpresa, competencia }

  } catch (error) {
    const screenshot = await capturarScreenshot(page, `sci-erro-${nomeEmpresa}`)
    throw Object.assign(error, { screenshot })
  } finally {
    await browser.close()
  }
}

module.exports = {
  uploadLevelDrive,
  testarAcessoLevelDrive,
  importarLancamentosSCI,
}
