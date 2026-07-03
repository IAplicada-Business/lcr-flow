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
  baixar_documentos(...) -> list[str]  (caminhos salvos; [] se nada)
"""

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


def _bytes_validos(r: requests.Response, nome: str) -> bool:
    """Rejeita respostas de erro da S3 (XML/HTML curto, ex.: 403 SignatureExpired)
    gravadas no lugar do arquivo real."""
    ct = (r.headers.get("content-type") or "").lower()
    corpo = r.content or b""
    if len(corpo) < 100:
        log(f"    ⚠️ download muito pequeno ({len(corpo)}b), pulando: {nome}")
        return False
    # Erros da S3 vêm como application/xml (SignatureExpired etc.) ou text/html.
    # NÃO usar "xml" in ct: o mime de .xlsx (...open*xml*formats...) casaria e
    # derrubaria planilhas válidas. O sniff do corpo abaixo cobre o resto.
    if ct.startswith("text/html") or ct.startswith("application/xml") or ct.startswith("text/xml"):
        log(f"    ⚠️ download com content-type {ct} (erro S3?), pulando: {nome}")
        return False
    inicio = corpo[:64].lstrip().lower()
    if inicio.startswith(b"<?xml") or inicio.startswith(b"<html") or b"<error>" in inicio:
        log(f"    ⚠️ download parece XML/HTML de erro, pulando: {nome}")
        return False
    return True


def baixar_documentos(detalhe: dict, destino: str, jwt: str) -> list:
    """Baixa via REST todos os arquivos de documentos NÃO desconsiderados.
    Fluxo por arquivo: POST .../document/download → corpo = URL S3 assinada →
    GET nessa URL (sem Authorization) → bytes → salva em destino.
    Retorna a lista de caminhos salvos (contrato de baixarDocumentosCliente)."""
    Path(destino).mkdir(parents=True, exist_ok=True)
    task_id = detalhe.get("_id")
    customer_id = _customer_id(detalhe)
    salvos, usados = [], set()

    for d in _requested_documents(detalhe):
        if d.get("disconsidered"):
            continue
        for f in (d.get("files") or []):
            file_name = f.get("file_name") or f.get("_id") or "arquivo"
            try:
                # passo 1: obter a URL S3 assinada (corpo = a própria URL, não JSON)
                r1 = _req("POST", f"{API}/accounting/pendency/document/download", jwt,
                          json={"customer_task": task_id, "document": d.get("_id"),
                                "customer": customer_id, "file": f.get("_id")})
                url = (r1.text or "").strip().strip('"').strip()
                if not url.lower().startswith("http"):
                    log(f"    ⚠️ sem URL de download p/ {file_name}: {url[:120]}")
                    continue
                # passo 2: baixar da S3 (URL já assinada → sem header Authorization)
                r2 = _req("GET", url, jwt=None)
                if not _bytes_validos(r2, file_name):
                    continue
                nome = _nome_unico(file_name, usados)
                caminho = Path(destino) / nome
                caminho.write_bytes(r2.content)
                salvos.append(str(caminho))
                log(f"    ✓ baixado: {nome} ({len(r2.content)}b)")
                time.sleep(0.3)  # espalha a carga na API do Gestta
            except Exception as e:
                # sessão expirada aborta a tarefa (retry/relogin no orquestrador);
                # falha isolada de 1 arquivo não derruba os demais.
                if "SESSAO_EXPIRADA" in str(e):
                    raise
                log(f"    ⚠️ falha ao baixar {file_name}: {str(e)[:160]}")
                continue
    return salvos
