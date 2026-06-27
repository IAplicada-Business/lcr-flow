"""
copiar_arquivos_config.py
Copia os 4 arquivos de referência contábil para a pasta config/ do projeto.
Execute: python copiar_arquivos_config.py
"""

import shutil
import os
from pathlib import Path

# ── Caminhos ──────────────────────────────────────────────────────────
UPLOADS = Path(r"C:\Users\carol\AppData\Roaming\Claude\local-agent-mode-sessions\db2cdbae-ee2d-4b7e-836e-8e4082459fb0\d39a72f2-afe4-48d9-a5ea-faed12fe3bcd\local_c279028e-e524-4d7c-97ac-cfa708bff5a6\uploads")

DESTINO = Path(r"d:\IAPLICADA\LCR\config")

ARQUIVOS = {
    "De-para conta_contabil em codigo_historico.xls":     "De-para_conta_contabil_em_codigo_historico.xls",
    "08 - Modelo Planilha Importação Lctos SCI _ Empresa KIALO CONSULTORIA E ENGENHARIA LTDA.xls": "08_-_Modelo_Planilha_Importacao_Lctos_SCI.xls",
    "Lista de participantes.csv":                          "Lista_de_participantes.csv",
    "Plano de historicos contabeis do SCI.csv":            "Plano_de_historicos_contabeis_do_SCI.csv",
}

# ── Execução ──────────────────────────────────────────────────────────
DESTINO.mkdir(parents=True, exist_ok=True)

for origem_nome, destino_nome in ARQUIVOS.items():
    origem = UPLOADS / origem_nome
    destino = DESTINO / destino_nome

    if not origem.exists():
        print(f"  [X] NAO ENCONTRADO: {origem_nome}")
        continue

    shutil.copy2(origem, destino)
    tamanho = destino.stat().st_size
    print(f"  [OK] {destino_nome}  ({tamanho:,} bytes)")

print(f"\nArquivos copiados para: {DESTINO}")
print("Proximo passo: python src/sci/gerar_planilha.py")
