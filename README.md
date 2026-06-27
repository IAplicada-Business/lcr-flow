# LCR Flow

Automação fim a fim do processo de Integração e Conciliação Bancária de Clientes.

**Processo:** PROC-001 | **Empresa:** LCR Contadores Associados

---

## O que este sistema faz

```
Gestta → baixa documentos do cliente
  → Parser extrai transações dos extratos bancários
  → Claude API classifica e gera planilha SCI
  → Upload automático no LevelDrive
  → SCI Único importa os lançamentos
  → Gestta conclui a tarefa "Lançamentos Contábeis"
```

**Bancos suportados:** Itaú, Bradesco, Santander, Banco do Brasil, Caixa, Inter (Excel e PDF)

---

## Setup em 4 passos

### 1. Cria e configura a VPS

```bash
# No DigitalOcean: crie um Droplet Ubuntu 22.04 - $12/mês (2GB RAM)
# Conecte via SSH e execute:
bash scripts/setup_vps.sh
```

### 2. Configura variáveis de ambiente

```bash
cp .env.example .env
nano .env   # preencha todas as variáveis
```

### 3. Instala dependências e sobe containers

```bash
npm install
pip3 install -r requirements.txt --break-system-packages
docker-compose up -d
```

### 4. Salva as sessões manualmente (uma vez só)

```bash
# Abre o browser para você fazer login — salva os cookies automaticamente
npm run save-session:gestta
npm run save-session:sci
npm run save-session:leveldrive
```

Após esses 4 passos, o sistema está pronto. Configure o agendamento no n8n.

---

## Copia os arquivos de referência

```bash
# Coloca os arquivos na pasta config/
cp "De-para_conta_contabil_em_codigo_historico.xls" config/
cp "Plano_de_historicos_contabeis_do_SCI.csv" config/
cp "Lista_de_participantes.csv" config/
```

---

## Testar o motor IA localmente

```bash
# Testa a classificação com transações de exemplo
python3 src/ai/motor_classificacao.py

# Testa a geração da planilha SCI
python3 src/sci/gerar_planilha.py

# Testa um parser de extrato
python3 src/parsers/extrato_bancario.py caminho/para/extrato.xlsx itau
```

---

## Estrutura do projeto

```
lcr-flow/
├── src/
│   ├── gestta/          # Automação portal Gestta
│   │   └── index.js
│   ├── sci/             # Automação LevelDrive + SCI
│   │   ├── index.js
│   │   └── gerar_planilha.py
│   ├── parsers/         # Leitura de extratos bancários
│   │   └── extrato_bancario.py
│   ├── ai/              # Motor de classificação Claude
│   │   └── motor_classificacao.py
│   └── pipeline.py      # Orquestrador principal
├── config/
│   ├── De-para_conta_contabil_em_codigo_historico.xls
│   ├── Plano_de_historicos_contabeis_do_SCI.csv
│   ├── Lista_de_participantes.csv
│   └── supabase_schema.sql
├── sessions/            # Cookies salvos (não commitar)
├── screenshots/         # Capturas em caso de erro
├── outputs/             # Planilhas geradas
├── scripts/
│   └── setup_vps.sh
├── docs/
│   └── ARQUITETURA.md
├── docker-compose.yml
├── Dockerfile.playwright
├── package.json
├── requirements.txt
└── .env.example
```

---

## Monitoramento

- **n8n:** `http://SEU_IP:5678` — workflows, logs de execução, agendamentos
- **Supabase:** dashboard de execuções, revisões manuais pendentes, erros
- **Screenshots de erros:** pasta `screenshots/` na VPS

---

## Pendências antes do primeiro uso em produção

- [ ] Receber modelo de mapeamento de transações típicas
- [ ] Calibrar parsers com extratos reais dos clientes
- [ ] Mapear seletores exatos do Gestta (após acesso)
- [ ] Mapear seletores exatos do SCI (após acesso)
- [ ] Confirmar caminho exato no LevelDrive para upload
- [ ] Definir conta bancária SCI por cliente (tabela de config)

---

## Em caso de erros

| Erro | O que fazer |
|---|---|
| `SESSAO_EXPIRADA` | Execute `npm run save-session:<sistema>` |
| `LAYOUT_MUDOU` | Verifique o screenshot em `screenshots/` e atualize os seletores em `src/sci/index.js` ou `src/gestta/index.js` |
| `REVISAO_MANUAL` | Acesse o Supabase → tabela `revisao_manual` → classifique os itens pendentes |
| `PARSER_SEM_TRANSACOES` | O extrato pode ter layout não mapeado — adicione um parser em `src/parsers/extrato_bancario.py` |
