# Extração do Balancete de Fechamento 2025 — LCR

**Documento para o cliente**  
**Versão:** 1.1 · **Data:** 21/07/2026  
**Prazo MVP:** **26/07/2026**

---

## Decisões confirmadas (21/07)

- **MVP 26/07:** dados extraídos + parse D=C + relatório CSV — **sem painel Lovable**
- **Janela drain:** **24/07 às 18h** — pausa temporária da cobrança mensal (~5–7 h)

---

## 1. Objetivo

Automatizar a **extração e importação** dos balancetes de fechamento anual **2025** a partir do **Gestta**, integrando os dados ao sistema LCR.

Com isso, a equipe passa a ter:

- Balancetes estruturados por cliente (contas, débitos, créditos e saldos)
- Validação automática de fechamento contábil (D = C)
- PDF de conciliações arquivado para consulta
- Relatório CSV de cobertura (~700 clientes)

---

## 2. De onde vêm os dados

| Item | Definição |
|------|-----------|
| **Fonte** | Gestta (pull automático via API) |
| **Tipo de tarefa** | *Demonstrativos do Fechamento Anual* |
| **Período** | 01/12/2025 a 31/12/2025 |
| **Referência** | **Competência** (não Data Meta) |
| **Volume** | **~700 tarefas** (barra superior de filtros) |

> O painel lateral (departamento *Sócio Administrador*) exibe ~**40** tarefas. A automação cobre **todas as ~700**.

---

## 3. Quais documentos serão extraídos

De até **6 anexos** por tarefa, entram **somente 2**:

| Documento | Extrair? | Tratamento |
|-----------|----------|------------|
| **BALANCETE** | Sim | Ler → gravar contas/saldos → validar D = C |
| **CONCILIAÇÕES** | Sim | Guardar PDF (consulta manual) |
| Balanço Patrimonial, DRE, Carta, Checklist | Não | Ignorados nesta fase |

**Estimativa:** até ~1.400 arquivos (700 × 2).

---

## 4. Cronograma até 26/07

| Data | Atividade | Marco |
|------|-----------|-------|
| **21/07** | Calibração Gestta + amostra MASCA | G1 18h: ≥650 taskIds |
| **22/07** | Smoke 2 clientes (parser + D=C) | G2 18h: end-to-end OK |
| **23/07** | Lote seco 20 tarefas | G3 18h: GO drain |
| **24/07 18h** | Pausar cobrança → extração ~700 | Início drain (~5–7 h) |
| **25/07** | Concluir drain + CSV cobertura | G4 08h: ≥85% processadas |
| **26/07** | Entrega MVP ao cliente | Relatório + exceções |

---

## 5. O que entrega em 26/07 (MVP)

| Item | Incluído? |
|------|-----------|
| ~700 tarefas extraídas (BALANCETE + CONCILIAÇÕES) | Sim |
| Balancetes estruturados + validação D = C | Sim |
| Relatório CSV (OK / parcial / incompleto / sem cadastro) | Sim |
| PDF de conciliações arquivado | Sim |
| Painel Fechamento 2025 no sistema | **Pós-26/07** |
| Leitura automática do PDF de Conciliações | **Pós-26/07** |

---

## 6. Fluxo da extração

1. Listar ~700 tarefas no Gestta  
2. Baixar BALANCETE + CONCILIAÇÕES (ignorar outros 4 anexos)  
3. Identificar cliente no cadastro LCR  
4. Armazenar arquivos na nuvem  
5. Ler balancete → tabela estruturada  
6. Validar D = C  
7. Relatório CSV de cobertura  

---

## 7. Resultados possíveis

| Situação | Status | Ação |
|----------|--------|------|
| Balancete OK + D = C | OK | Concluído |
| Balancete OK, conciliações ausentes | Parcial | Revisar no Gestta |
| Balancete ausente | Incompleto | Tratar manualmente |
| Cliente sem cadastro LCR | Sem cadastro | Vínculo manual |
| Match ambíguo | Revisão manual | Confirmar empresa |

---

## 8. Operação do lote (24/07)

- **Início:** 24/07 às 18h  
- Pausa temporária da cobrança mensal automática  
- ~700 clientes em lotes de 10  
- **Duração:** 5–7 horas  
- Reativação da cobrança após conclusão  

---

## 9. O que não faremos (v1)

- Não alteramos tarefas no Gestta  
- Não extraímos Balanço, DRE, Carta ou Checklist  
- Não lemos automaticamente o PDF de Conciliações  

---

## 10. Pré-requisitos

1. Tarefas Dez/2025 concluídas no Gestta com anexos corretos  
2. Cadastro LCR alinhado aos códigos/nomes do Gestta  
3. Balancetes no formato SCI (PDF ou planilha)  

---

## 11. Status do projeto

- [x] Escopo MVP aprovado (~700; BALANCETE + CONCILIAÇÕES)  
- [x] Janela drain acordada (24/07 18h)  
- [ ] Fase 0 — calibração Gestta (em andamento)  
- [ ] Entrega 26/07 — relatório CSV + base importada  

---

*LCR automação · Plano Gestta → LCR · MVP 26/07/2026*
