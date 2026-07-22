/**
 * Testa busca de tarefas + download de documentos.
 * Execute: node src/gestta/testar.js
 */

const path = require('path');
const gestta = require('./index.js');

async function main() {
  console.log('\n=== TESTE GESTTA v2 ===\n');

  // 1. Busca tarefas com task ID
  console.log('--- [1/2] Buscando tarefas pendentes (06/2026) ---');
  const tarefas = await gestta.buscarTarefasPendentes('06/2026');
  console.log('\nResultado:');
  console.log(JSON.stringify(tarefas, null, 2));

  if (tarefas.length === 0) {
    console.log('Nenhuma tarefa encontrada.');
    return;
  }

  const tarefa = tarefas[0];
  if (!tarefa.taskId) {
    console.log('AVISO: task ID não extraído. Usando ID fixo do teste anterior.');
    tarefa.taskId = '6a0d252f7bbe44553bd573ee';
  }

  // 2. Baixa documentos da primeira tarefa
  console.log(`\n--- [2/2] Baixando documentos de "${tarefa.clienteNome}" ---`);
  console.log(`    Task ID: ${tarefa.taskId}`);

  const destino = path.join('outputs', `${tarefa.clienteCodigo}_06-2026`);
  const arquivos = await gestta.baixarDocumentosCliente(tarefa.taskId, '06/2026', destino);

  console.log(`\nArquivos baixados (${arquivos.length}):`);
  arquivos.forEach(a => console.log(' -', a));
}

main().catch(err => {
  console.error('\nErro:', err.message);
  process.exit(1);
});
