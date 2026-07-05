"""
src/gestta/api_docs.py

Cliente REST dos documentos do Gestta — SEM browser/Playwright.
Substitui, no caminho de backfill (--via-api), os dois passos que hoje usam
Playwright em src/gestta/index.js:
  - analisarSuficienciaDocumentos  → suficiencia(detalhe)
  - baixarDocumentosCliente         → baixar_documentos(detalhe, destino, jwt)

Autenticação: recebe o JWT já formatado ("JWT eyJ...") — o valor cru de
orquestrar._gestta_jwt() — usado direto no header Authorization (mesmo padrão
de listar_cobrancas_api). O download final é numa URL S3 já assinada (jwt=None).

Contratos (drop-in dos passos browser):
  suficiencia(detalhe) -> {observacao, documentos:[{nome,status,numArquivos}],
                           suficiente, pendentes}
  baixar_documentos(...) -> {"salvos": list[str], "falhas": list[{arquivo,motivo}]}
      salva os arquivos OK e sinaliza os que falharam (após retry) — o caller
      marca a tarefa INCOMPLETA em vez de perder documento em silêncio.
"""

import re
import time
from pathlib import Path

import requests

API = "https://api.gestta.com.br"

# transientes que valem retry; janela de backoff (s) — até 3 novas tentativas
_RETRIES = (2, 5, 10)
_TRANSIENT_HTTP = {429, 502, 503, 504}


def log(msg):
    print(msg, flush=True)


def _req(method: str, url: str, jwt, **kw) -> requests.Response:
    """Requisição com timeout, retry/backoff de transientes e tradução de erros.

    jwt: string "JWT eyJ..." p/ a API do Gestta; None omite o Authorization
         (usado no GET da URL S3 já assinada).
    401/403 numa chamada AUTENTICADA (jwt != None) → RuntimeError("SESSAO_EXPIRADA")
    para reaproveitar a detecção/relogin de processar_com_retry no orquestrador.
    """
    kw.setdefault("timeout", 60)
    headers = dict(kw.pop("headers", {}) or {})
    if jwt:
        headers["Authorization"] = jwt
    ultimo = None
    for tentativa in range(len(_RETRIES) + 1):
        try:
            r = requests.request(method, url, headers=headers, **kw)
        except (requests.ConnectionError, requests.Timeout) as e:
            ultimo = e
        else:
            if r.ok:
                return r
            # sessão expirada só faz sentido em chamada autenticada ao Gestta
            if jwt and r.status_code in (401, 403):
                raise RuntimeError(f"SESSAO_EXPIRADA: Gestta {r.status_code} em {url[:80]}")
            if r.status_code in _TRANSIENT_HTTP:
                ultimo = RuntimeError(f"HTTP {r.status_code}")
                # respeita Retry-After quando presente
                ra = r.headers.get("Retry-After")
                if ra and ra.isdigit() and tentativa < len(_RETRIES):
                    time.sleep(min(int(ra), 30))
                    continue
            else:
                raise RuntimeError(f"Gestta API HTTP {r.status_code}: {r.text[:200]}")
        if tentativa < len(_RETRIES):
            time.sleep(_RETRIES[tentativa])
    raise RuntimeError(f"Gestta API falhou após retries: {ultimo}")


def _customer_id(detalhe: dict):
    """customer pode vir como dict ({_id}) ou como id string cru."""
    c = detalhe.get("customer")
    if isinstance(c, dict):
        return c.get("_id") or c.get("id")
    return c


def _requested_documents(detalhe: dict) -> list:
    return (detalhe.get("document_request") or {}).get("requested_documents") or []


def detalhe_tarefa(task_id: str, jwt: str) -> dict:
    """GET /core/customer/task/{task_id} → JSON cru da tarefa.
    Campos usados adiante: document_request.requested_documents[] e customer."""
    r = _req("GET", f"{API}/core/customer/task/{task_id}", jwt)
    return r.json()


def suficiencia(detalhe: dict) -> dict:
    """Computa a suficiência a partir do JSON da tarefa (sem browser).
    Contrato idêntico ao analisarSuficienciaDocumentos (index.js):
      status: disconsidered→'desconsiderado'; tem files→'enviado'; senão 'pendente'.
    observacao='' na v1 (a modal 'Dados Cadastrais' não vem na tarefa; a IA tem
    fallback '(sem observação específica)'). TODO: GET /core/customer/{id}."""
    documentos = []
    for d in _requested_documents(detalhe):
        files = d.get("files") or []
        if d.get("disconsidered"):
            status = "desconsiderado"
        elif files:
            status = "enviado"
        else:
            status = "pendente"
        documentos.append({
            "nome": d.get("name") or "",
            "status": status,
            "numArquivos": len(files),
        })
    pendentes = [x["nome"] for x in documentos if x["status"] == "pendente"]
    return {
        "observacao": "",
        "documentos": documentos,
        "suficiente": len(pendentes) == 0,
        "pendentes": pendentes,
    }


def _nome_unico(nome: str, usados: set) -> str:
    """Evita sobrescrever 2 arquivos com o mesmo file_name (docs diferentes)."""
    nome = (nome or "arquivo").strip() or "arquivo"
    if nome not in usados:
        usados.add(nome)
        return nome
    p = Path(nome)
    i = 2
    while True:
        cand = f"{p.stem} ({i}){p.suffix}"
        if cand not in usados:
            usados.add(cand)
            return cand
        i += 1


def _classificar_download(r: requests.Response, file_name: str):
    """Classifica a resposta do GET na S3. Retorna ('salva', '') p/ documento
    válido — binário (PDF/xlsx/imagem), .xls/.xlsx-que-é-HTML (export BR) ou XML
    fiscal (NFe/NFS-e) — ou ('falha', motivo) p/ erro real da S3 (<Error>),
    página HTML de erro ou resposta vazia.
    Distinção-chave: só o erro da S3 tem <Error>; NFe começa com <?xml e o
    export BR começa com <html mas SÃO documentos — não descartar por serem xml/html."""
    corpo = r.content or b""
    cabeca = corpo[:512].lstrip().lower()
    ext = file_name.lower().rsplit(".", 1)[-1] if "." in file_name else ""

    if r.status_code != 200:
        return "falha", f"HTTP {r.status_code}"
    if b"<error>" in cabeca:  # erro da S3 (SignatureDoesNotMatch/AccessDenied/…)
        m = re.search(rb"<code>([^<]+)</code>", corpo[:512], re.IGNORECASE)
        cod = m.group(1).decode(errors="ignore") if m else ""
        return "falha", f"erro S3 {cod}".strip()
    if cabeca.startswith(b"<html"):
        # .xls/.xlsx-que-é-HTML e .html são documentos legítimos (export BR) → salva.
        if ext in ("xls", "xlsx", "html", "htm"):
            return "salva", ""
        return "falha", "HTML inesperado (página de erro?)"
    if not corpo:
        return "falha", "resposta vazia (0b)"
    # Arquivo pequeno mas NÃO vazio é documento legítimo — ex.: extrato do mês SEM
    # movimento (Nubank exporta só o cabeçalho 'Data,Valor,...'), recibo curto. NÃO
    # é falha de download (o erro real da S3 já foi pego por <Error>/HTML acima); o
    # parser trata como 0 transações. Antes, o corte <100b barrava esses e a tarefa
    # ficava em loop de erro (ex.: LS4C, CSV Nubank vazio de 37b).
    return "salva", ""


def _baixar_arquivo(task_id, doc_id, customer_id, file_id, file_name, jwt, tentativas=3):
    """Baixa 1 arquivo: POST (obtém URL S3 assinada) + GET (S3). Em falha de
    download (assinatura expirada, erro S3), RETENTA com uma URL NOVA — refaz o
    POST, pois re-GET na mesma URL vencida falharia sempre. Retorna (bytes, None)
    no sucesso ou (None, motivo) após esgotar. Propaga SESSAO_EXPIRADA (aborta a
    tarefa p/ relogin no orquestrador)."""
    motivo = "desconhecido"
    for i in range(tentativas):
        try:
            r1 = _req("POST", f"{API}/accounting/pendency/document/download", jwt,
                      json={"customer_task": task_id, "document": doc_id,
                            "customer": customer_id, "file": file_id})
            url = (r1.text or "").strip().strip('"').strip()
            if not url.lower().startswith("http"):
                motivo = f"sem URL de download ({url[:80]})"
            else:
                r2 = _req("GET", url, jwt=None)  # URL já assinada → sem Authorization
                cls, m = _classificar_download(r2, file_name)
                if cls == "salva":
                    return r2.content, None
                motivo = m
        except RuntimeError as e:
            if "SESSAO_EXPIRADA" in str(e):
                raise
            motivo = str(e)[:120]
        if i < tentativas - 1:
            time.sleep(1.5)  # janela p/ a URL nova; backoff leve
    return None, motivo


def baixar_documentos(detalhe: dict, destino: str, jwt: str):
    """Baixa via REST todos os arquivos de documentos NÃO desconsiderados.
    Cada arquivo: POST (URL S3 assinada) + GET (bytes), com retry em falha de
    download (_baixar_arquivo). Salva os que vieram OK e coleta os que falharam.
    Retorna {"salvos": [caminhos], "falhas": [{arquivo, motivo}]}. Assim o caller
    processa os OK e marca a tarefa como INCOMPLETA quando há falhas — nunca perde
    documento em silêncio.
    Propaga SESSAO_EXPIRADA (aborta a tarefa p/ relogin no orquestrador)."""
    Path(destino).mkdir(parents=True, exist_ok=True)
    task_id = detalhe.get("_id")
    customer_id = _customer_id(detalhe)
    salvos, falhas, usados = [], [], set()

    for d in _requested_documents(detalhe):
        if d.get("disconsidered"):
            continue
        for f in (d.get("files") or []):
            file_name = f.get("file_name") or f.get("_id") or "arquivo"
            conteudo, motivo = _baixar_arquivo(
                task_id, d.get("_id"), customer_id, f.get("_id"), file_name, jwt)
            if conteudo is None:
                log(f"    FALHA: {file_name}: {motivo}")
                falhas.append({"arquivo": file_name, "motivo": motivo})
                continue
            nome = _nome_unico(file_name, usados)
            caminho = Path(destino) / nome
            caminho.write_bytes(conteudo)
            salvos.append(str(caminho))
            log(f"    OK baixado: {nome} ({len(conteudo)}b)")
            time.sleep(0.3)  # espalha a carga na API do Gestta
    return {"salvos": salvos, "falhas": falhas}
