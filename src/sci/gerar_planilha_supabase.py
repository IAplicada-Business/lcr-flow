"""
src/sci/gerar_planilha.py
Gera a planilha de importacao SCI a partir dos lancamentos no Supabase.

Uso:
  python src/sci/gerar_planilha.py --empresa CAVA --competencia 2026-06
  python src/sci/gerar_planilha.py --empresa "KIALO" --competencia 2026-05 --banco 9
  python src/sci/gerar_planilha.py --empresa 12.345.678/0001-90 --competencia 2026-06 --output planilhas/

Requer:
  SUPABASE_URL e SUPABASE_KEY no arquivo lcr-flow/.env
  Para bypass de RLS: SUPABASE_SERVICE_ROLE_KEY no mesmo .env
"""

import sys
import os
import argparse
import requests
import pandas as pd
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

# ── Caminhos ──────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent.parent   # d:\IAPLICADA\LCR
CONFIG = ROOT / "config"
ENV_FILE = ROOT / "lcr-flow" / ".env"

load_dotenv(ENV_FILE)

SUPABASE_URL = (
    os.getenv("SUPABASE_URL")
    or os.getenv("VITE_SUPABASE_URL")
    or ""
).rstrip("/")

SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")   # preferencial: bypassa RLS
    or os.getenv("SUPABASE_PUBLISHABLE_KEY")
    or os.getenv("VITE_SUPABASE_PUBLISHABLE_KEY")
    or ""
)

# ── Lógica de lado contábil ───────────────────────────────────────────
# Convenção: tipo da conta determina o lado normal do lançamento.
# Exceções devem ser tratadas manualmente após geração.
TIPOS_DEBITO = {"ativo", "despesa", "custo", "deducoes"}
TIPOS_CREDITO = {"passivo", "receita", "resultado", "patrimonio", "patrimonio_liquido"}

# Mapeamento banco nome → código no plano de contas (fallback)
BANCO_PARA_CODIGO = {
    "bradesco": 9,
    "brasil": 7,
    "bb ": 7,
    "caixa": 8,
    "santander": 10,
    "itau": 657,
    "inter": 658,
    "sicoob": 659,
    "sicredi": 775,
    "original": 779,
    "nubank": 821,
    "xp ": 823,
    "c6": 809,
    "stone": 910,
    "pagbank": 946,
    "btg": 1031,
}


# ── Supabase REST helper ──────────────────────────────────────────────

def _headers() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept": "application/json",
    }


def sb_get(tabela: str, params: dict) -> list:
    url = f"{SUPABASE_URL}/rest/v1/{tabela}"
    r = requests.get(url, headers=_headers(), params=params, timeout=30)
    if not r.ok:
        raise RuntimeError(f"Supabase erro {r.status_code} em '{tabela}': {r.text[:300]}")
    return r.json()


# ── Carregamento dos arquivos de config ───────────────────────────────

def _arquivo_config(fragmento: str) -> Path:
    matches = [f for f in CONFIG.iterdir() if fragmento.lower() in f.name.lower()]
    if not matches:
        raise FileNotFoundError(f"Arquivo de config nao encontrado com '{fragmento}' em {CONFIG}")
    return matches[0]


def carregar_depara() -> dict:
    """
    Retorna dict: plano_contas.codigo (int) -> SCI Apelido (int ou None).
    Tambem retorna historico_padrao: plano_contas.codigo -> codigo_historico.
    """
    arq = _arquivo_config("De-para")
    df = pd.read_excel(str(arq))

    mapping_conta = {}
    mapping_hist  = {}

    for _, row in df.iterrows():
        try:
            codigo_lcr = int(float(str(row["Codigo"] if "Codigo" in df.columns else row.iloc[0])))
        except (ValueError, TypeError):
            continue

        apelido_raw = str(row.get("Apelido", row.iloc[4]) if hasattr(row, "get") else row.iloc[4])
        hist_raw    = str(row.get("HISTORICO PADRAO", row.iloc[6]) if hasattr(row, "get") else row.iloc[6])

        if apelido_raw not in ("nan", "-", "", "None"):
            try:
                mapping_conta[codigo_lcr] = int(float(apelido_raw))
            except ValueError:
                pass

        if hist_raw not in ("nan", "-", "", "None"):
            mapping_hist[codigo_lcr] = hist_raw.strip()

    return mapping_conta, mapping_hist


def carregar_historicos_sci() -> dict:
    """Retorna dict: codigo_str -> descricao (do Plano de historicos SCI)."""
    arq = _arquivo_config("historicos")
    df = pd.read_csv(str(arq), encoding="latin1", sep=";", skiprows=1, on_bad_lines="skip", header=None)
    mapping = {}
    for _, row in df.iterrows():
        try:
            codigo = str(int(float(str(row.iloc[0])))).strip()
            nome   = str(row.iloc[2]).strip() if len(row) > 2 else ""
            if codigo and codigo != "nan":
                mapping[codigo] = nome
        except (ValueError, TypeError):
            continue
    return mapping


def carregar_participantes() -> dict:
    """Retorna dict: CNPJ/CPF -> codigo_participante (para PART DEB/CRED)."""
    arq = _arquivo_config("participantes")
    df  = pd.read_csv(str(arq), encoding="latin1", sep=";", on_bad_lines="skip")
    mapping = {}
    for _, row in df.iterrows():
        try:
            codigo = str(row.iloc[0]).strip()
            cnpj   = str(row.iloc[3]).strip()   # coluna CNPJ/CPF/CIE
            if cnpj and cnpj != "nan":
                mapping[cnpj] = codigo
        except (IndexError, TypeError):
            continue
    return mapping


# ── Busca no Supabase ─────────────────────────────────────────────────

def buscar_empresa(termo: str) -> dict:
    empresas = sb_get("empresas", {
        "select": "id,razao_social,nome_fantasia,cnpj",
        "or": f"(nome_fantasia.ilike.*{termo}*,razao_social.ilike.*{termo}*,cnpj.eq.{termo})",
    })
    if not empresas:
        raise ValueError(f"Empresa nao encontrada: '{termo}'")
    if len(empresas) > 1:
        print(f"  [!] {len(empresas)} empresas encontradas para '{termo}', usando a primeira:")
        for e in empresas:
            print(f"      - {e['razao_social']} ({e['cnpj']})")
    return empresas[0]


def buscar_conta_banco(empresa_id: str) -> int | None:
    """Retorna codigo LCR da conta bancaria principal, ou None."""
    contas = sb_get("contas_bancarias", {
        "select": "banco",
        "empresa_id": f"eq.{empresa_id}",
        "limit": "1",
    })
    if not contas:
        return None
    banco = (contas[0].get("banco") or "").lower()
    for nome, codigo in BANCO_PARA_CODIGO.items():
        if nome in banco:
            return codigo
    return None


def buscar_lancamentos(empresa_id: str, competencia: str) -> list:
    return sb_get("lancamentos", {
        "select": (
            "id,data_lancamento,valor,descricao,competencia,"
            "conta:plano_contas(codigo,descricao,tipo),"
            "historico:historicos_contabeis(codigo,descricao)"
        ),
        "empresa_id": f"eq.{empresa_id}",
        "competencia": f"eq.{competencia}",
        "order": "data_lancamento.asc",
        "limit": "5000",
    })


# ── Geração da planilha ───────────────────────────────────────────────

def _lado_conta(tipo: str) -> str:
    """'debito' ou 'credito' baseado no tipo da conta contabil."""
    t = (tipo or "").lower()
    for td in TIPOS_DEBITO:
        if td in t:
            return "debito"
    for tc in TIPOS_CREDITO:
        if tc in t:
            return "credito"
    return "debito"  # fallback conservador


def _fmt_data(data_str: str) -> str:
    try:
        return datetime.strptime(str(data_str), "%Y-%m-%d").strftime("%d/%m/%Y")
    except ValueError:
        return str(data_str)


def gerar_planilha(
    empresa_id: str,
    empresa_nome: str,
    competencia: str,
    conta_banco_codigo: int | None,
    depara_conta: dict,
    depara_hist: dict,
    output_dir: Path,
) -> Path | None:

    print(f"\n  Buscando lancamentos: {empresa_nome} / {competencia} ...")
    lancamentos = buscar_lancamentos(empresa_id, competencia)

    if not lancamentos:
        print(f"  [!] Nenhum lancamento encontrado.")
        return None

    print(f"  {len(lancamentos)} lancamentos encontrados.")

    # Codigo SCI da conta bancaria (counterpart)
    sci_banco = depara_conta.get(conta_banco_codigo, conta_banco_codigo) if conta_banco_codigo else None

    linhas = []
    sem_conta = 0

    for lanc in lancamentos:
        conta     = lanc.get("conta") or {}
        historico = lanc.get("historico") or {}

        codigo_lcr = conta.get("codigo")   # int
        tipo_conta = conta.get("tipo") or ""

        if codigo_lcr is None:
            sem_conta += 1
            continue

        # Converter código LCR para SCI via De-para (ou manter direto)
        sci_conta = depara_conta.get(int(codigo_lcr), int(codigo_lcr))

        # Histórico: preferencia ao De-para, fallback ao codigo do lançamento
        cod_hist_lanc = str(historico.get("codigo") or "").strip()
        sci_hist      = depara_hist.get(int(codigo_lcr), cod_hist_lanc) if codigo_lcr else cod_hist_lanc

        # Lado do lançamento
        lado = _lado_conta(tipo_conta)

        if lado == "debito":
            debito  = sci_conta
            credito = sci_banco or ""
        else:
            debito  = sci_banco or ""
            credito = sci_conta

        linhas.append({
            "DATA":                _fmt_data(lanc.get("data_lancamento") or ""),
            "DEBITO":              debito,
            "CREDITO":             credito,
            "PART DEB":            "",
            "PART CRED":           "",
            "VALOR":               float(lanc.get("valor") or 0),
            "HISTORICO":           sci_hist,
            "COMPLEMENTO":         (lanc.get("descricao") or "")[:80],
            "DOCUMENTO":           "",
            "CENTRO DE CUSTO DEB": "",
            "CENTRO DE CUSTO CRED": "",
        })

    if sem_conta:
        print(f"  [!] {sem_conta} lancamento(s) ignorado(s) por ausencia de conta.")

    if not linhas:
        print("  Nenhuma linha valida para gerar planilha.")
        return None

    df = pd.DataFrame(linhas)

    slug = empresa_nome.replace(" ", "_").replace("/", "-")[:30]
    comp = competencia.replace("-", "")
    nome_arq = f"SCI_{slug}_{comp}.xlsx"
    caminho  = output_dir / nome_arq

    with pd.ExcelWriter(str(caminho), engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Planilha de importacao")
        ws = writer.sheets["Planilha de importacao"]
        # Ajusta largura das colunas
        for col in ws.columns:
            max_len = max(len(str(cell.value or "")) for cell in col)
            ws.column_dimensions[col[0].column_letter].width = min(max_len + 2, 40)

    total = df["VALOR"].sum()
    print(f"  [OK] {nome_arq}")
    print(f"       {len(linhas)} linhas | Total R$ {total:,.2f}")

    return caminho


# ── Entrypoint ────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Gera planilha de importacao SCI a partir dos lancamentos no Supabase"
    )
    parser.add_argument("--empresa", "-e", required=True,
                        help="Nome fantasia, razao social ou CNPJ da empresa")
    parser.add_argument("--competencia", "-c",
                        default=datetime.now().strftime("%Y-%m"),
                        help="Competencia no formato YYYY-MM (default: mes atual)")
    parser.add_argument("--banco", "-b", type=int, default=None,
                        help="Codigo da conta bancaria no plano de contas (ex: 9 = Bradesco)")
    parser.add_argument("--output", "-o", default=".",
                        help="Pasta de saida para o XLSX gerado (default: pasta atual)")
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[ERRO] Variaveis SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY nao encontradas.")
        print(f"       Verifique o arquivo: {ENV_FILE}")
        sys.exit(1)

    usando_sr = bool(os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
    if not usando_sr:
        print("[AVISO] SUPABASE_SERVICE_ROLE_KEY nao encontrado. Usando chave anonima.")
        print("        Se houver erro 401, adicione a service role key ao .env.\n")

    print("=== Gerar Planilha SCI ===")
    print(f"  Empresa    : {args.empresa}")
    print(f"  Competencia: {args.competencia}")

    # Config
    print("\nCarregando arquivos de configuracao...")
    depara_conta, depara_hist = carregar_depara()
    historicos_sci = carregar_historicos_sci()
    print(f"  De-para contas   : {len(depara_conta)} mapeamentos")
    print(f"  De-para historicos (padrao): {len(depara_hist)} mapeamentos")
    print(f"  Historicos SCI   : {len(historicos_sci)} codigos")

    # Empresa
    empresa = buscar_empresa(args.empresa)
    print(f"\nEmpresa encontrada: {empresa['razao_social']}")
    print(f"  CNPJ: {empresa['cnpj']}")

    # Conta bancaria
    conta_banco = args.banco or buscar_conta_banco(empresa["id"])
    if conta_banco:
        sci_banco = depara_conta.get(conta_banco, conta_banco)
        print(f"  Conta bancaria: codigo LCR {conta_banco} → SCI {sci_banco}")
    else:
        print("  Conta bancaria nao identificada automaticamente.")
        print("  Use --banco <codigo> para definir (ex: --banco 9 para Bradesco).")
        print("  As colunas DEBITO/CREDITO de contrapartida ficarao em branco.")

    # Output
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Gerar
    arquivo = gerar_planilha(
        empresa_id=empresa["id"],
        empresa_nome=empresa.get("nome_fantasia") or empresa["razao_social"],
        competencia=args.competencia,
        conta_banco_codigo=conta_banco,
        depara_conta=depara_conta,
        depara_hist=depara_hist,
        output_dir=output_dir,
    )

    if arquivo:
        print(f"\nPlanilha salva em: {arquivo.resolve()}")
        print("Proximo passo: importar no SCI via menu Arquivo > Importar Lancamentos")
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
