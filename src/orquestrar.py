"""
src/orquestrar.py

Orquestra o PROC-001 (Etapas 1–4) em TODAS as tarefas COBRANÇA de uma competência.
Para cada tarefa:
  1. Entra na tarefa (COBRANÇA DE MOVIMENTO MENSAL)
  2. Analisa suficiência dos documentos (Gestta leitura + motor IA)
  3. Se ok → baixa documentos
  4. IA classifica → envia classificados E não-classificados ao front (revisão humana)

REGRA: NÃO escreve nada no Gestta (não conclui tarefa). Conclusão/ajuste fino e
conciliação são manuais na interface, antes do SCI (Etapa 5, em standby).

Pensado para ser disparado pelo n8n (Execute Command), por competência:
  python src/orquestrar.py --competencia 2026-06 [--limite N] [--cliente CODIGO]

Rode da raiz do repo, com PYTHONUTF8=1 no Windows.
"""

import sys
import json
import argparse
import datetime as dt
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "src" / "ai"))
sys.path.insert(0, str(ROOT / "src" / "sci"))

import bridge_front as bf                                  # noqa: E402  (obter_jwt, sb_get, processar_via_gestta, _node_eval, comp_to_gestta, vincular_consultor)
from motor_classificacao import avaliar_suficiencia_documentos  # noqa: E402
from gerar_planilha_supabase import BANCO_PARA_CODIGO       # noqa: E402

OUT_DIR = ROOT / "outputs" / "orquestracao"
BANCO_PADRAO = 657  # Itaú (fallback)


def log(msg):
    print(msg, flush=True)


# ── Gestta (somente leitura) via subprocess Node ─────────────────────────────
def gestta(fn: str, *args) -> object:
    args_js = ",".join(json.dumps(a) for a in args)
    js = (f"const g=require('./src/gestta/index.js');"
          f"g.{fn}({args_js})"
          ".then(r=>console.log(JSON.stringify(r)))"
          ".catch(e=>{console.error(e.message);process.exit(1)});")
    return json.loads(bf._node_eval(js))


# ── Resolução de empresa e banco ─────────────────────────────────────────────
def resolver_empresa(codigo: str, nome: str):
    for termo in (nome, codigo):
        if not termo:
            continue
        t = termo.strip()
        rows = bf.sb_get("empresas", {
            "select": "id,razao_social,nome_fantasia,cnpj",
            "or": f"(nome_fantasia.ilike.*{t}*,razao_social.ilike.*{t}*)",
            "limit": "2",
        })
        if rows:
            return rows[0]
    return None


def resolver_banco(empresa_id: str):
    contas = bf.sb_get("contas_bancarias", {"select": "banco", "empresa_id": f"eq.{empresa_id}", "limit": "1"})
    if not contas:
        return None
    banco = (contas[0].get("banco") or "").lower()
    for nome, cod in BANCO_PARA_CODIGO.items():
        if nome.strip() in banco:
            return cod
    return None


def ja_processada(empresa_id: str, competencia: str) -> bool:
    docs = bf.sb_get("documentos", {
        "select": "id", "empresa_id": f"eq.{empresa_id}",
        "competencia": f"eq.{competencia}", "origem": "eq.gestta", "limit": "1",
    })
    return bool(docs)


# ── Processa uma tarefa (Etapas 1–4, sem escrever no Gestta) ──────────────────
def processar_tarefa(t: dict, competencia: str, comp_g: str, jwt: str) -> dict:
    codigo = t.get("clienteCodigo") or ""
    nome = t.get("clienteNome") or ""
    resp = t.get("responsavel") or ""
    tarefa_id = t.get("taskId")
    base = {"cliente": nome or codigo, "tarefa_id": tarefa_id}

    if not tarefa_id:
        return {**base, "status": "erro", "motivo": "tarefa sem taskId"}

    empresa = resolver_empresa(codigo, nome)
    if not empresa:
        return {**base, "status": "erro", "motivo": f"empresa não encontrada no Supabase ('{nome or codigo}')"}
    empresa_id = empresa["id"]
    base["empresa_id"] = empresa_id

    if ja_processada(empresa_id, competencia):
        return {**base, "status": "pulada_idempotencia"}

    # Etapa 2 — suficiência (Gestta leitura + IA)
    try:
        suf = gestta("analisarSuficienciaDocumentos", tarefa_id, comp_g)
    except Exception as e:
        return {**base, "status": "erro", "motivo": f"suficiência: {str(e)[:160]}"}
    try:
        ia = avaliar_suficiencia_documentos(suf.get("observacao", ""), suf.get("documentos", []), comp_g)
    except Exception:
        ia = {"suficiente": suf.get("suficiente", False), "faltando": suf.get("pendentes", [])}
    suficiente = bool(suf.get("suficiente")) and bool(ia.get("suficiente", True))
    if not suficiente:
        return {**base, "status": "aguardando_docs",
                "faltando": ia.get("faltando") or suf.get("pendentes") or []}

    # Etapa 4 — baixa + classifica + envia ao front (sem concluir no Gestta)
    banco = resolver_banco(empresa_id) or BANCO_PADRAO
    try:
        resumo = bf.processar_via_gestta(empresa_id, competencia, None, tarefa_id, banco, jwt)
    except Exception as e:
        return {**base, "status": "erro", "motivo": f"etapa4: {str(e)[:200]}"}

    # Vincula o consultor responsável (processar_via_gestta com tarefa_id não resolve responsavel)
    if resp:
        try:
            bf.vincular_consultor(empresa_id, resp)
        except Exception:
            pass

    extratos = resumo.get("extratos", [])
    lanc = sum(e.get("lancamentos", 0) for e in extratos)
    return {**base, "status": "processada", "banco": banco, "consultor": resp,
            "lancamentos_extrato": lanc, "outros_docs": len(resumo.get("outros", []))}


def main():
    ap = argparse.ArgumentParser(description="Orquestra PROC-001 Etapas 1–4 em todas as tarefas COBRANÇA")
    ap.add_argument("--competencia", required=True, help="YYYY-MM")
    ap.add_argument("--limite", type=int, default=None, help="máximo de tarefas por execução")
    ap.add_argument("--cliente", default=None, help="processa só um cliente (código/nome contém)")
    args = ap.parse_args()

    comp_g = bf.comp_to_gestta(args.competencia)
    log(f"=== Orquestração PROC-001 · competência {args.competencia} ({comp_g}) ===")
    log("  (somente leitura no Gestta — não conclui tarefas)")

    jwt = bf.obter_jwt()
    log("  JWT do usuário de serviço obtido ✓")

    log(f"\n[E1] Listando tarefas COBRANÇA ({comp_g})...")
    tarefas = gestta("buscarTarefasCobranca", comp_g)
    log(f"    {len(tarefas)} tarefa(s) COBRANÇA encontradas")

    if args.cliente:
        c = args.cliente.lower()
        tarefas = [t for t in tarefas
                   if c in (t.get("clienteCodigo") or "").lower() or c in (t.get("clienteNome") or "").lower()]
        log(f"    filtro --cliente '{args.cliente}': {len(tarefas)} tarefa(s)")
    if args.limite:
        tarefas = tarefas[:args.limite]
        log(f"    --limite {args.limite}: processando {len(tarefas)}")

    resultados = []
    for i, t in enumerate(tarefas, 1):
        log(f"\n── [{i}/{len(tarefas)}] {t.get('clienteCodigo')} - {t.get('clienteNome')} ──")
        r = processar_tarefa(t, args.competencia, comp_g, jwt)
        log(f"    → {r['status']}" + (f" ({r.get('motivo') or r.get('faltando') or ''})" if r['status'] != 'processada' else f" · {r.get('lancamentos_extrato',0)} lançamentos"))
        resultados.append(r)

    # Resumo + log por execução
    contagem = {}
    for r in resultados:
        contagem[r["status"]] = contagem.get(r["status"], 0) + 1
    resumo = {
        "competencia": args.competencia,
        "gerado_em": dt.datetime.now().isoformat(timespec="seconds"),
        "total_tarefas": len(tarefas),
        "contagem": contagem,
        "tarefas": resultados,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    arq = OUT_DIR / f"run-{args.competencia}-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    arq.write_text(json.dumps(resumo, ensure_ascii=False, indent=2), encoding="utf-8")

    log(f"\n=== RESUMO === {json.dumps(contagem, ensure_ascii=False)}")
    log(f"Log: {arq}")
    # stdout final em JSON (n8n faz parse)
    print(json.dumps({"ok": True, "competencia": args.competencia, "contagem": contagem, "log": str(arq)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
