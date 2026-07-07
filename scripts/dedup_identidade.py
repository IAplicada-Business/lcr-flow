#!/usr/bin/env python3
"""Dedup de extratos por IDENTIDADE (agência+conta+competência). Diferente do
dedup por sobreposição de transações: aqui é a REGRA acordada — mesmo banco/
agência/conta/período = mesmo extrato → marca a duplicata (não apaga o doc),
vincula ao original (duplicata_de) e REMOVE a razão dela. Escopado por empresa.

Keeper (original que fica): mais lançamentos → xlsx/csv (comentada, mais rica)
sobre pdf → menor id. Grava extrato_chave em todos (backfill). DRY por padrão.

Uso: dedup_identidade.py [--cliente <substr no nome>] [--competencia AAAA-MM ...] [--apply]
"""
import sys, os, tempfile
sys.path.insert(0, "src")
# Windows: força UTF-8 na saída. Nomes de arquivo têm acentos combinantes (ex.:
# 'MARÇO' com '̧') que o cp1252 não encoda — sem isto o print crasha. errors=replace
# é cinto-e-suspensório (nenhum char exótico derruba o processo); line_buffering dá
# progresso visível mesmo com stdout redirecionado p/ arquivo/cron.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
import bridge_front as bf
from parsers.extrato_bancario import extrair_identidade, chave_extrato, detectar_banco
from collections import defaultdict

APPLY = "--apply" in sys.argv
COMPS = [a for a in sys.argv[1:] if a.startswith("20") and len(a) == 7]
CLIENTE = sys.argv[sys.argv.index("--cliente") + 1] if "--cliente" in sys.argv else None

# Termos de investimento/posição — MESMA lista que bridge_front.detectar_tipo usa p/
# rotear esses docs à edge. Investimento fica FORA do dedup por identidade (#4): a chave
# é agência|conta|mês SEM banco, então um CDB pode colidir com a CC do mesmo mês; se a
# sobreposição passar de 60% o CDB seria marcado duplicata e perderia razão. Melhor não
# deduplicar investimento aqui (o backstop de sobreposição ainda pega dobra real).
# Ver regra investimento-vs-razão: movimento gera lançamento, posição é suporte.
INVESTIMENTO_KW = ["posic", "posiç", "investiment", "aplicac", "aplicaç",
                   "renda fixa", "renda-fixa", "cdb"]

def eh_investimento(d):
    n = (d.get("arquivo_nome") or "").lower()
    return any(k in n for k in INVESTIMENTO_KW)

def eh_extrato(d):
    n = (d.get("arquivo_nome") or "").lower()
    if eh_investimento(d):
        return False
    return (d.get("tipo") == "extrato" or "extrato" in n) and n.endswith((".xlsx", ".xls", ".pdf", ".csv"))

def keeper_score(d):
    n = (d.get("arquivo_nome") or "").lower()
    return (d.get("lancamentos_gerados") or 0, 1 if n.endswith((".xlsx", ".xls", ".csv")) else 0)

# 1. carrega docs de extrato
params = {"select": "id,empresa_id,arquivo_nome,competencia,tipo,lancamentos_gerados,storage_path,arquivo_url,duplicata_de"}
if CLIENTE:
    params["arquivo_nome"] = f"ilike.*{CLIENTE}*"
docs = [d for d in bf.get_all("documentos", params) if eh_extrato(d)]
if COMPS:
    docs = [d for d in docs if d.get("competencia") in COMPS]

# 2. computa chave por doc (download + parse cabeçalho)
grupos = defaultdict(list)  # (empresa_id, chave) -> [docs]
chave_por_doc = {}
total = len(docs)
print(f"Parseando cabeçalho de {total} extrato(s) (download + parse)...", flush=True)
for i, d in enumerate(docs, 1):
    if i % 100 == 0 or i == total:
        print(f"  ... {i}/{total} ({len(grupos)} chaves distintas até aqui)", flush=True)
    sp = d.get("storage_path") or d.get("arquivo_url")
    if not sp:
        continue
    try:
        b = bf.baixar_storage(bf.BUCKET_DOCS, sp)
        e = os.path.splitext(d["arquivo_nome"])[1] or ".pdf"
        with tempfile.NamedTemporaryFile(suffix=e, delete=False) as tf:
            tf.write(b); c = tf.name
        try:
            idt = extrair_identidade(c, banco=detectar_banco(d["arquivo_nome"]))
        finally:
            os.unlink(c)
        ch = chave_extrato(idt, d["competencia"])
    except Exception as ex:
        ch = None
    chave_por_doc[d["id"]] = ch
    if ch:
        grupos[(d["empresa_id"], ch)].append(d)

# 3. resolve duplicatas
plano = []  # (keeper, [duplicatas], chave)
for (eid, ch), ds in grupos.items():
    ativos = [d for d in ds if not d.get("duplicata_de")]  # ignora já-marcados
    if len(ativos) < 2:
        continue
    ordenado = sorted(ativos, key=keeper_score, reverse=True)
    keeper, dups = ordenado[0], ordenado[1:]
    plano.append((keeper, dups, ch))

# Só é seguro deletar razão nestes estados; o resto já avançou (SCI/upload/validado).
STATUS_SEGURO = {"gerada", "pendente"}

def _lancs(doc_id):
    return bf.get_all("lancamentos", {"select": "id,data_lancamento,valor,conciliado,status",
                                      "documento_id": f"eq.{doc_id}", "fonte_extrato": "eq.true"})

# ── PASSO A: DECIDE tudo (read-only) — coleta relatório + mutações, SEM mutar ────
# Separa o destrutivo do print: nenhum erro de I/O de print pode interromper o lote
# no meio (razão parcialmente deletada = estado inconsistente).
relatorio = []          # linhas de texto p/ imprimir
mutacoes = []           # dicts das gravações a executar no PASSO C (só se APPLY)
tot_dup = tot_raz = tot_protegido = tot_colisao = 0
ids_tratados = set()    # keepers + marcados + pulados → excluídos do backfill de chave
for keeper, dups, ch in sorted(plano, key=lambda x: x[0].get("competencia") or ""):
    assin_keeper = bf.assin_lancamentos(_lancs(keeper["id"]))
    ids_tratados.add(keeper["id"])
    mutacoes.append({"op": "keeper", "id": keeper["id"], "ch": ch})
    relatorio.append(f"[{keeper['competencia']}] chave={ch}")
    relatorio.append(f"    KEEPER  ger={keeper.get('lancamentos_gerados'):>3}  {keeper['arquivo_nome'][:50]}")
    for dp in dups:
        dp_lancs = _lancs(dp["id"])
        nraz = len(dp_lancs)
        # GUARD #3: nunca deletar razão conciliada ou que já avançou (SCI/upload/validado).
        protegidos = [l for l in dp_lancs if l.get("conciliado") or (l.get("status") not in STATUS_SEGURO)]
        if protegidos:
            tot_protegido += 1
            ids_tratados.add(dp["id"])
            relatorio.append(f"    PROTEGIDO ({len(protegidos)} lanc. conciliados/avancados) NAO marcado — revisar  {dp['arquivo_nome'][:50]}")
            continue
        # GUARD #5: só marca+deleta se as transações se sobrepõem (evita colisão de
        # chave entre bancos diferentes com mesma ag/conta/mês — o banco não entra na chave).
        if nraz:
            ov = bf.sobreposicao(bf.assin_lancamentos(dp_lancs), assin_keeper)
            if ov < bf.OVERLAP_MIN_DEDUP:
                tot_colisao += 1
                ids_tratados.add(dp["id"])
                relatorio.append(f"    COLISAO?  (sobrep {ov:.0%} < {bf.OVERLAP_MIN_DEDUP:.0%}) NAO marcado — revisar  {dp['arquivo_nome'][:50]}")
                continue
            ov_txt = f"sobrep {ov:.0%}"
        else:
            ov_txt = "0 razao"
        tot_dup += 1
        tot_raz += nraz
        ids_tratados.add(dp["id"])
        mutacoes.append({"op": "dup", "id": dp["id"], "ch": ch, "keeper": keeper["id"], "nraz": nraz})
        relatorio.append(f"    dup     ger={dp.get('lancamentos_gerados'):>3}  ({nraz} razao a remover, {ov_txt})  {dp['arquivo_nome'][:50]}")

# Backfill: chave em docs SEM grupo (necessário p/ o dedup vivo pegar existentes).
# Exclui os já tratados (keeper já recebe; marcado/pulado não deve virar candidato).
backfill = [(d["id"], chave_por_doc.get(d["id"])) for d in docs
            if chave_por_doc.get(d["id"]) and d["id"] not in ids_tratados and not d.get("duplicata_de")]

# ── PASSO B: IMPRIME o relatório completo (ainda read-only; nada mutado) ─────────
print(f"\n{'APPLY' if APPLY else 'DRY'} · {len(docs)} extratos varridos · {len(plano)} grupo(s) com mesma chave\n")
for l in relatorio:
    print(l)
print(f"\nTOTAL: {tot_dup} duplicata(s), {tot_raz} lancamentos de razao " + ("a remover." if APPLY else "a remover. [DRY] --apply p/ executar."))
if tot_protegido or tot_colisao:
    print(f"NAO TOCADOS: {tot_protegido} com razao conciliada/avancada · {tot_colisao} sem sobreposicao "
          f"(possivel colisao de chave). Revisar manualmente.")

# ── PASSO C: EXECUTA as mutações (só se APPLY) — fase isolada, sem print frágil ──
if APPLY:
    for m in mutacoes:
        if m["op"] == "dup":
            if m["nraz"]:
                bf.sb_delete("lancamentos", {"documento_id": m["id"]})
            bf.sb_update("documentos", {"id": m["id"]},
                         {"duplicata_de": m["keeper"], "status_processamento": "duplicata",
                          "extrato_chave": m["ch"], "lancamentos_gerados": 0})
        else:  # keeper
            bf.sb_update("documentos", {"id": m["id"]}, {"extrato_chave": m["ch"]})
    for doc_id, ch in backfill:
        bf.sb_update("documentos", {"id": doc_id}, {"extrato_chave": ch})
    print(f"APLICADO: {tot_dup} duplicata(s) marcada(s), {tot_raz} razao removida(s), "
          f"backfill de chave em +{len(backfill)} extrato(s) sem grupo.")
