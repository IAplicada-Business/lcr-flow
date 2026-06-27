/**
 * src/gestta/testar_etapa2.js
 *
 * Testa as 3 novas funções da Etapa 2 (COBRANÇA DE MOVIMENTO MENSAL):
 *   1. buscarTarefasCobranca()     — encontra a tarefa COBRANÇA do mês
 *   2. analisarSuficienciaDocumentos() — lê docs + observação
 *   3. marcarChecklistEConcluir()  — ATENÇÃO: conclui a tarefa de verdade
 *
 * Execute: node src/gestta/testar_etapa2.js [competencia] [--concluir]
 * Ex:      node src/gestta/testar_etapa2.js "06/2026"
 * Ex:      node src/gestta/testar_etapa2.js "06/2026" --concluir
 */

const gestta = require('./index.js');

const competencia = process.argv[2] || '06/2026';
const concluir    = process.argv.includes('--concluir');

async function main() {
  console.log(`\n=== TESTE ETAPA 2 — Competência: ${competencia} ===\n`);

  // ── 1. Busca tarefas COBRANÇA ───────────────────────────────────────────
  console.log('[1] Buscando tarefas COBRANÇA DE MOVIMENTO MENSAL...');
  const tarefas = await gestta.buscarTarefasCobranca(competencia);

  if (tarefas.length === 0) {
    console.log('    Nenhuma tarefa COBRANÇA encontrada. Encerrando.');
    return;
  }

  console.log(`    ${tarefas.length} tarefa(s) encontrada(s):`);
  tarefas.forEach(t => console.log(`    - ${t.clienteCodigo} (${t.clienteNome}): ${t.taskId}`));

  // Usa a primeira tarefa para os testes
  const tarefa = tarefas[0];
  console.log(`\n    Usando: ${tarefa.clienteCodigo} | taskId: ${tarefa.taskId}`);

  // ── 2. Analisa suficiência ──────────────────────────────────────────────
  console.log('\n[2] Analisando suficiência dos documentos...');
  const analise = await gestta.analisarSuficienciaDocumentos(tarefa.taskId, competencia);

  console.log(`\n    RESULTADO:`);
  console.log(`    Suficiente: ${analise.suficiente}`);
  console.log(`    Pendentes:  ${analise.pendentes.length === 0 ? 'nenhum' : analise.pendentes.join(', ')}`);
  console.log(`    Observação: ${analise.observacao?.slice(0, 200) || '(vazia)'}`);
  console.log(`\n    Documentos:`);
  analise.documentos.forEach(d => {
    const icone = d.status === 'enviado' ? '[OK]' : d.status === 'desconsiderado' ? '[N/A]' : '[PEND]';
    console.log(`      ${icone} ${d.nome}`);
  });

  if (!analise.suficiente) {
    console.log('\n    Documentos insuficientes — nao prosseguindo para marcar checklist.');
    return;
  }

  // ── 3. Marcar checklist e concluir (somente com --concluir) ────────────
  if (!concluir) {
    console.log('\n[3] CHECKLIST: omitido (use --concluir para executar de verdade)');
    console.log('\n=== TESTE CONCLUIDO (modo leitura) ===\n');
    return;
  }

  console.log('\n[3] Marcando checklist e concluindo tarefa COBRANÇA...');
  console.log('    ATENCAO: isto ira concluir a tarefa no Gestta!');

  const resultado = await gestta.marcarChecklistEConcluir(tarefa.taskId, competencia);
  console.log(`\n    Resultado: ${JSON.stringify(resultado)}`);
  console.log('\n=== TESTE CONCLUIDO ===\n');
}

main().catch(err => {
  console.error('\nERRO:', err.message);
  process.exit(1);
});
