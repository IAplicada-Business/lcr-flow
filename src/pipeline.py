"""
src/pipeline.py

Orquestrador principal do pipeline LCR Flow.
Conecta todos os módulos em sequência para um cliente.

Executado pelo n8n via HTTP ou linha de comando.
"""

import os
import sys
import json
import asyncio
import subprocess
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


async def processar_cliente(
    cliente_id: str,
    nome_empresa: str,
    competencia: str,
    conta_banco_sci: int,
    arquivos_gestta: list = None
) -> dict:
    """
    Pipeline completo para um cliente.
    
    Etapas:
    1. Download documentos do Gestta
    2. Parser dos extratos bancários
    3. Classificação IA → planilha SCI
    4. Upload LevelDrive
    5. Importação SCI
    6. Conclusão tarefa no Gestta
    """

    resultado = {
        'cliente_id': cliente_id,
        'nome_empresa': nome_empresa,
        'competencia': competencia,
        'inicio': datetime.now().isoformat(),
        'etapas': {},
        'status': 'iniciado'
    }

    pasta_cliente = Path(f"outputs/{cliente_id}_{competencia.replace('/', '-')}")
    pasta_cliente.mkdir(parents=True, exist_ok=True)

    try:
        # ── ETAPA 1: Download documentos ─────────────────────────────
        print(f"\n[1/6] Baixando documentos do Gestta: {nome_empresa}")
        
        if not arquivos_gestta:
            # Importa e executa o módulo Node.js via subprocess
            cmd = ['node', '-e', f"""
                const gestta = require('./src/gestta/index.js');
                gestta.baixarDocumentosCliente('{cliente_id}', '{competencia}', '{pasta_cliente}')
                    .then(arquivos => console.log(JSON.stringify(arquivos)))
                    .catch(e => {{ console.error(e.message); process.exit(1) }});
            """]
            proc = subprocess.run(cmd, capture_output=True, text=True)
            if proc.returncode != 0:
                raise Exception(f"GESTTA_ERRO: {proc.stderr}")
            arquivos_gestta = json.loads(proc.stdout)

        resultado['etapas']['download'] = {'status': 'ok', 'arquivos': arquivos_gestta}
        print(f"  ✓ {len(arquivos_gestta)} arquivo(s) baixado(s)")

        # ── ETAPA 2: Análise de suficiência de documentos ────────────
        print(f"\n[2/6] Analisando suficiência dos documentos...")

        cmd_suficiencia = ['node', '-e', f"""
            const gestta = require('./src/gestta/index.js');
            gestta.analisarSuficienciaDocumentos('{cliente_id}', '{competencia}')
                .then(r => console.log(JSON.stringify(r)))
                .catch(e => {{ console.error(e.message); process.exit(1) }});
        """]
        proc_suf = subprocess.run(cmd_suficiencia, capture_output=True, text=True)
        if proc_suf.returncode != 0:
            raise Exception(f"SUFICIENCIA_ERRO: {proc_suf.stderr}")

        suficiencia = json.loads(proc_suf.stdout)

        if not suficiencia.get('suficiente', False):
            pendentes = suficiencia.get('pendentes', [])
            raise Exception(
                f"DOCUMENTOS_INSUFICIENTES: aguardando {len(pendentes)} documento(s): "
                + ', '.join(pendentes[:3])
            )

        resultado['etapas']['suficiencia'] = {
            'status': 'ok',
            'suficiente': True,
            'observacoes': suficiencia.get('observacoes', [])
        }
        print(f"  ✓ Documentos suficientes — {len(suficiencia.get('documentos', []))} itens verificados")

        # ── ETAPA 3: Parser dos extratos ─────────────────────────────
        print(f"\n[3/7] Parseando extratos bancários...")
        
        from parsers.extrato_bancario import parsear_extrato
        
        todas_transacoes = []
        arquivos_extrato = [
            a for a in arquivos_gestta 
            if any(k in Path(a).name.lower() for k in ['extrato', 'cta', 'conta', 'banco'])
        ]

        if not arquivos_extrato:
            # Se não identifica por nome, tenta todos os Excel/PDF
            arquivos_extrato = [
                a for a in arquivos_gestta 
                if Path(a).suffix.lower() in ['.xlsx', '.xls', '.pdf']
            ]

        for arquivo in arquivos_extrato:
            try:
                transacoes = parsear_extrato(arquivo)
                todas_transacoes.extend(transacoes)
            except Exception as e:
                print(f"  ⚠ Parser falhou em {Path(arquivo).name}: {e}")
                resultado['etapas']['parser'] = {
                    'status': 'revisao_manual',
                    'motivo': str(e),
                    'arquivo': arquivo
                }

        if not todas_transacoes:
            raise Exception("PARSER_SEM_TRANSACOES: nenhuma transação extraída dos documentos")

        resultado['etapas']['parser'] = {'status': 'ok', 'total': len(todas_transacoes)}
        print(f"  ✓ {len(todas_transacoes)} transações extraídas")

        # ── ETAPA 4: Classificação IA → Planilha SCI ─────────────────
        print(f"\n[4/7] Classificando transações com IA...")
        
        from ai.motor_classificacao import classificar_extrato
        from sci.gerar_planilha import gerar_planilha_sci, validar_planilha

        classificacao = classificar_extrato(
            transacoes=todas_transacoes,
            conta_banco=conta_banco_sci,
            competencia=competencia
        )

        resultado['etapas']['classificacao'] = {
            'status': 'ok',
            'aprovadas': classificacao['resumo']['aprovadas'],
            'revisao': classificacao['resumo']['revisao']
        }

        if classificacao['revisao_manual']:
            print(f"  ⚠ {len(classificacao['revisao_manual'])} transações para revisão manual")
            salvar_revisao_manual(classificacao['revisao_manual'], cliente_id, competencia)

        if not classificacao['aprovadas']:
            raise Exception("CLASSIFICACAO_VAZIA: todas as transações foram para revisão manual")

        print(f"  ✓ {len(classificacao['aprovadas'])} lançamentos classificados")

        # Gera planilha SCI
        caminho_planilha = gerar_planilha_sci(
            linhas=classificacao['aprovadas'],
            nome_empresa=nome_empresa,
            competencia=competencia,
            caminho_saida=str(pasta_cliente)
        )

        # Valida planilha antes de enviar
        validacao = validar_planilha(caminho_planilha)
        if not validacao['valida']:
            raise Exception(f"PLANILHA_INVALIDA: {validacao['erros']}")

        resultado['etapas']['planilha'] = {'status': 'ok', 'caminho': caminho_planilha}
        print(f"  ✓ Planilha SCI gerada e validada")

        # ── ETAPA 5: Concluir COBRANÇA no Gestta ─────────────────────
        # Marca os 9 itens do checklist e fecha a tarefa COBRANÇA.
        # O Gestta cria automaticamente a tarefa LANÇAMENTOS em seguida.
        print(f"\n[5/7] Concluindo tarefa COBRANÇA no Gestta...")

        cmd_cobranca = ['node', '-e', f"""
            const gestta = require('./src/gestta/index.js');
            gestta.marcarChecklistEConcluir('{cliente_id}', '{competencia}')
                .then(r => console.log(JSON.stringify(r)))
                .catch(e => {{ console.error(e.message); process.exit(1) }});
        """]
        proc_cobranca = subprocess.run(cmd_cobranca, capture_output=True, text=True)
        if proc_cobranca.returncode != 0:
            raise Exception(f"COBRANCA_CONCLUSAO_ERRO: {proc_cobranca.stderr}")

        resultado['etapas']['conclusao_cobranca'] = {'status': 'ok'}
        print(f"  ✓ Tarefa COBRANÇA concluída — LANÇAMENTOS criado pelo Gestta")

        # ── ETAPA 6: Upload LevelDrive ────────────────────────────────
        print(f"\n[6/7] Enviando para o LevelDrive...")
        
        nome_arquivo = Path(caminho_planilha).name
        cmd = ['node', '-e', f"""
            const sci = require('./src/sci/index.js');
            sci.uploadLevelDrive('{caminho_planilha}', '{nome_empresa}', '{competencia}')
                .then(r => console.log(JSON.stringify(r)))
                .catch(e => {{ console.error(e.message); process.exit(1) }});
        """]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise Exception(f"LEVELDRIVE_ERRO: {proc.stderr}")

        resultado['etapas']['leveldrive'] = {'status': 'ok', 'arquivo': nome_arquivo}
        print(f"  ✓ Upload concluído no LevelDrive")

        # ── ETAPA 7: Importação SCI + Conclusão LANÇAMENTOS ──────────
        print(f"\n[7/7] Importando no SCI Único e concluindo LANÇAMENTOS...")
        
        cmd = ['node', '-e', f"""
            const sci = require('./src/sci/index.js');
            sci.importarLancamentosSCI('{nome_empresa}', '{competencia}', '{nome_arquivo}')
                .then(r => console.log(JSON.stringify(r)))
                .catch(e => {{ console.error(e.message); process.exit(1) }});
        """]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise Exception(f"SCI_ERRO: {proc.stderr}")

        resultado['etapas']['importacao_sci'] = {'status': 'ok'}
        resultado['etapas']['conclusao_gestta'] = {'status': 'pendente_lancamentos_id'}
        resultado['status'] = 'concluido'
        resultado['fim'] = datetime.now().isoformat()
        
        print(f"\n✅ Pipeline concluído: {nome_empresa} - {competencia}")
        return resultado

    except Exception as error:
        resultado['status'] = 'erro'
        resultado['erro'] = str(error)
        resultado['fim'] = datetime.now().isoformat()
        
        print(f"\n❌ Pipeline falhou: {error}")
        
        # Classifica o tipo de erro para o n8n tratar corretamente
        if 'SESSAO_EXPIRADA' in str(error):
            resultado['tipo_erro'] = 'SESSAO_EXPIRADA'
        elif 'LAYOUT_MUDOU' in str(error):
            resultado['tipo_erro'] = 'LAYOUT_MUDOU'
        elif 'PARSER' in str(error):
            resultado['tipo_erro'] = 'REVISAO_MANUAL'
        else:
            resultado['tipo_erro'] = 'ERRO_GERAL'

        return resultado


def salvar_revisao_manual(itens: list, cliente_id: str, competencia: str):
    """Salva transações para revisão manual no arquivo de log."""
    pasta = Path(f"outputs/revisao_manual")
    pasta.mkdir(parents=True, exist_ok=True)
    
    caminho = pasta / f"{cliente_id}_{competencia.replace('/', '-')}_revisao.json"
    with open(caminho, 'w', encoding='utf-8') as f:
        json.dump(itens, f, ensure_ascii=False, indent=2)
    
    print(f"  Revisão manual salva: {caminho}")


def executar_pipeline_extrato(
    caminho_extrato: str,
    conta_banco: int,
    competencia: str,
    codigo_cliente: str,
    nome_cliente: str = None,
    caminho_saida: str = None
) -> dict:
    """
    Pipeline parcial (etapas 2–3): parse extrato → IA → planilha SCI.
    Útil para testes e execução manual antes do pipeline completo estar pronto.
    """
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))

    from src.parsers.extrato_bancario import parsear_extrato
    from src.ai.motor_classificacao import classificar_extrato
    from src.sci.gerar_planilha import gerar_planilha_sci, gerar_revisao_csv, validar_planilha

    if nome_cliente is None:
        nome_cliente = codigo_cliente
    if caminho_saida is None:
        caminho_saida = os.path.join('outputs', f'{codigo_cliente}_{competencia.replace("/", "-")}')

    print(f"\n{'='*60}")
    print(f"LCR FLOW — Parse + Classificação + Planilha")
    print(f"Cliente    : {nome_cliente} ({codigo_cliente})")
    print(f"Extrato    : {Path(caminho_extrato).name}")
    print(f"Competência: {competencia}")
    print(f"{'='*60}\n")

    # 1. Parse
    print("[1/3] Parseando extrato...")
    transacoes = parsear_extrato(caminho_extrato)
    print(f"      {len(transacoes)} transações\n")

    # 2. Classificação
    print("[2/3] Classificando com IA...")
    resultado = classificar_extrato(transacoes, conta_banco, competencia)
    r = resultado['resumo']
    print(f"      Aprovadas: {r['aprovadas']} | Revisão: {r['revisao']} | Erros: {r['erros']}\n")

    # 3. Gerar planilhas
    print("[3/3] Gerando planilhas...")
    arquivos = {}

    if resultado['aprovadas']:
        xlsx = gerar_planilha_sci(resultado['aprovadas'], nome_cliente, competencia, caminho_saida)
        val = validar_planilha(xlsx)
        if not val['valida']:
            print(f"  AVISO validação: {val['erros']}")
        arquivos['planilha_sci'] = xlsx

    if resultado['revisao_manual']:
        csv_path = gerar_revisao_csv(resultado['revisao_manual'], nome_cliente, competencia, caminho_saida)
        arquivos['revisao_csv'] = csv_path

    json_path = os.path.join(caminho_saida, f'{codigo_cliente}_{competencia.replace("/", "-")}.json')
    os.makedirs(caminho_saida, exist_ok=True)
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump({'resumo': r, 'aprovadas': resultado['aprovadas'],
                   'revisao_manual': resultado['revisao_manual']}, f, ensure_ascii=False, indent=2)
    arquivos['json'] = json_path

    print(f"\n{'='*60}")
    print(f"CONCLUÍDO — {r['aprovadas']} aprovadas / {r['revisao']} para revisão")
    for k, v in arquivos.items():
        print(f"  {k}: {v}")
    print(f"{'='*60}\n")
    return {'resumo': r, 'arquivos': arquivos}


# ─────────────────────────────────────────────
# Execução direta
# ─────────────────────────────────────────────

if __name__ == '__main__':
    if len(sys.argv) >= 5:
        # Modo pipeline parcial: extrato → planilha
        # python src/pipeline.py <extrato> <conta_banco> <competencia> <codigo> [nome]
        executar_pipeline_extrato(
            caminho_extrato=sys.argv[1],
            conta_banco=int(sys.argv[2]),
            competencia=sys.argv[3],
            codigo_cliente=sys.argv[4],
            nome_cliente=sys.argv[5] if len(sys.argv) > 5 else None,
        )
    else:
        print("Uso: python src/pipeline.py <extrato> <conta_banco> <competencia> <codigo> [nome]")
        print("Ex : python src/pipeline.py outputs/CAPI_06-2026/Extrato_3130_971538.pdf 657 05/2026 CAPI")
        sys.exit(1)
