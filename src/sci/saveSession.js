/**
 * src/sci/saveSession.js
 *
 * Lança o Chrome REAL (sem flags de automação) e aguarda login manual.
 * Usa CDP para conectar ao Chrome já rodando — Cloudflare não detecta automação.
 *
 * Execute: npm run save-session:sci
 */

const path     = require('path');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { launchChrome } = require('./chrome_launcher');

const SCI_URL = process.env.SCI_URL || 'https://novalcr.levelcloud.com.br';

async function saveSession() {
  console.log('\n=== SAVE SESSION — SCI ÚNICO ===\n');

  const { browser, context, page } = await launchChrome(SCI_URL);

  console.log('========================================');
  console.log(' LOGIN EM DUAS ETAPAS — LEIA COM ATENÇÃO');
  console.log('========================================');
  console.log('\n 1° ACESSO (tela inicial do LevelCloud):');
  console.log(`    Usuário : ${process.env.SCI_USER_LEVEL}`);
  console.log('    Senha   : (definida em SCI_PASSWORD_LEVEL no .env)');
  console.log('\n   → Após clicar em Entrar, UMA NOVA TELA vai abrir.');
  console.log('\n 2° ACESSO (SCI Único — tela que abriu):');
  console.log(`    Usuário : ${process.env.SCI_EMAIL}`);
  console.log('    Senha   : (definida em SCI_PASSWORD no .env)');
  console.log('\n   → Aguarde carregar o painel do SCI Único.');
  console.log('\n   Se aparecer desafio Cloudflare, aguarde — ele resolve sozinho.');
  console.log('\n========================================');
  console.log('   Só pressione ENTER após o 2° login estar completo.');
  console.log('========================================\n');

  await waitForEnter();

  // Com launchPersistentContext via PROFILE_DIR o perfil já fica salvo em disco
  console.log('\n✅ Perfil Chrome salvo — próximas execuções reutilizam a sessão.');
  console.log('   (Cloudflare cf_clearance fica gravado no perfil)\n');

  await browser.close();
  process.exit(0);
}

function waitForEnter() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Pressione ENTER após o 2° login completo... ', () => {
      rl.close();
      resolve();
    });
  });
}

saveSession().catch((err) => {
  console.error('\nErro:', err.message);
  if (err.message.includes('9222')) {
    console.error('\nDica: Se houver outro Chrome aberto, feche-o e tente novamente.');
  }
  process.exit(1);
});
