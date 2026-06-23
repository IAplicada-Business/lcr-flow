# Documentos demo para a reunião 23/06

5 PDFs sintéticos simulando documentos que um cliente da LCR enviaria via Gestta. Cada um vinculado a uma empresa do piloto.

## Os arquivos

| Arquivo | Empresa | Tipo de documento | O que demonstra |
|---|---|---|---|
| `01-extrato-cava-jun2026.pdf` | CAVA Desenvolvimento Humano LTDA | Extrato bancário Itaú · 11 movimentações | Captura de extrato, classificação por tipo de movimento, geração de múltiplos lançamentos |
| `02-nfe-a2h.pdf` | A2H Gestão Patrimonial LTDA | NFS-e prestada · São Paulo | Reconhecimento de receita + retenções (ISS, IR, CSLL, PIS/COFINS) |
| `03-planilha-codegee.pdf` | CODEGEE Consultoria | Planilha financeira mensal · 15 linhas | Parsing de planilha, segregação receita/despesa por categoria |
| `04-darf-nutrimap.pdf` | NUTRIMAP | DARF · IRPJ trimestral | Reconhecimento de despesa tributária |
| `05-recibo-a1.pdf` | A1 Consultoria Empresarial | Recibo de pagamento a prestador PF | Despesa operacional simples |

## Como subir para o repo

Os PDFs precisam estar acessíveis ao Claude Code (que roda em sandbox remoto, não vê seu Mac). Subir para o repo `lcr-flow` antes de executar o `PROMPT-TOBE-EXECUTAVEL.md`:

```bash
cd ~/path/para/lcr-flow
mkdir -p docs-demo
cp ~/Documents/Claude/Projects/docs-demo/*.pdf docs-demo/

git add docs-demo/
git commit -m "chore: docs-demo para validação 23/06"
git push origin main
```

Depois sinaliza pro Code que os arquivos estão no repo.

## Roteiro de uso na demo

**Opção 1 · Demonstrar processamento ao vivo (alto impacto, alto risco)**

Durante a demo, na hora de mostrar o ciclo end-to-end:
1. Abrir a empresa CAVA na tela do sistema
2. Aba Documentos → botão Upload
3. Selecionar `01-extrato-cava-jun2026.pdf` ao vivo
4. Aguardar ~20 segundos (mostrar tela de processamento)
5. Quando classificação aparecer: comentar o que a IA identificou
6. Ir para Lançamentos → mostrar as 11 movimentações criadas
7. Ir para Conciliação → mostrar como aparecem na assistência
8. Gerar planilha SCI → mostrar números batendo

**Opção 2 · Pré-processar e mostrar estado pronto (baixo risco, menos impacto)**

Antes da reunião, rodar o seed `seed-docs-demo.ts` localmente. Os 5 documentos já entram no sistema processados. Na demo, abrir cada um e explicar o que aconteceu.

**Recomendação:** combinação — pré-processar os 5 documentos antes da reunião como fallback, mas tentar fazer 1 ao vivo (o extrato CAVA, que é o mais impactante visualmente). Se der erro, segue com os pré-processados.

## Atenção · estes documentos são fictícios

CNPJs, valores e nomes de prestadores são sintéticos. Não usar para qualquer finalidade real. Só pra demonstração do pipeline de processamento.
