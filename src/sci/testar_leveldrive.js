/**
 * src/sci/testar_leveldrive.js
 *
 * Testa o acesso WebDAV ao LevelDrive e, opcionalmente, faz upload de um arquivo.
 *
 * Execute:
 *   node src/sci/testar_leveldrive.js              — só testa acesso (PROPFIND)
 *   node src/sci/testar_leveldrive.js --upload      — faz upload de arquivo de teste
 *   node src/sci/testar_leveldrive.js <caminho>     — faz upload de arquivo específico
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const sci = require('./index.js');

async function main() {
  const args = process.argv.slice(2);
  const fazerUpload = args.includes('--upload') || (args[0] && !args[0].startsWith('--'));
  const arquivoCustom = args.find(a => !a.startsWith('--'));

  console.log('\n=== TESTE LEVELDRIVE (WebDAV) ===\n');

  // ── 1. Testa acesso PROPFIND ───────────────────────────────────────────────
  console.log('[1] Testando acesso à pasta no LevelDrive...');
  try {
    await sci.testarAcessoLevelDrive();
  } catch (err) {
    console.error(`\n❌ Erro no teste de acesso: ${err.message}`);
    process.exit(1);
  }

  if (!fazerUpload) {
    console.log('\n✅ Acesso OK. Para testar upload: node src/sci/testar_leveldrive.js --upload\n');
    return;
  }

  // ── 2. Upload de arquivo ───────────────────────────────────────────────────
  let caminhoArquivo;
  if (arquivoCustom && fs.existsSync(arquivoCustom)) {
    caminhoArquivo = path.resolve(arquivoCustom);
  } else {
    // Cria arquivo de teste temporário
    const tmpPath = path.join(__dirname, '../../outputs/teste_upload_leveldrive.xlsx');
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, 'TESTE LCR FLOW ' + new Date().toISOString());
    caminhoArquivo = tmpPath;
    console.log(`\n[2] Usando arquivo de teste: ${caminhoArquivo}`);
  }

  console.log(`\n[2] Fazendo upload: ${path.basename(caminhoArquivo)}`);
  try {
    const resultado = await sci.uploadLevelDrive(caminhoArquivo, 'TESTE', '06/2026');
    console.log(`\n✅ Upload OK:`, resultado);
  } catch (err) {
    console.error(`\n❌ Erro no upload: ${err.message}`);
    if (err.response) {
      console.error(`   HTTP ${err.response.status}: ${JSON.stringify(err.response.data)?.slice(0, 300)}`);
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nERRO:', err.message);
  process.exit(1);
});
