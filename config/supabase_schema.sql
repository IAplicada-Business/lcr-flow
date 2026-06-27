-- ============================================
-- LCR Flow — Schema Supabase
-- Executa no SQL Editor do Supabase
-- ============================================

-- Tabela principal de execuções do pipeline
CREATE TABLE IF NOT EXISTS execucoes (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_id      TEXT NOT NULL,
    nome_empresa    TEXT NOT NULL,
    competencia     TEXT NOT NULL,          -- formato MM/YYYY
    status          TEXT NOT NULL,          -- iniciado | concluido | erro
    tipo_erro       TEXT,                   -- SESSAO_EXPIRADA | LAYOUT_MUDOU | etc
    erro_mensagem   TEXT,
    etapas          JSONB,                  -- detalhes de cada etapa
    lancamentos     INTEGER DEFAULT 0,      -- total de lançamentos importados
    revisao_manual  INTEGER DEFAULT 0,      -- lançamentos para revisão
    inicio          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fim             TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de erros detalhados com screenshots
CREATE TABLE IF NOT EXISTS erros (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    execucao_id     UUID REFERENCES execucoes(id),
    cliente_id      TEXT,
    etapa           TEXT NOT NULL,          -- gestta | parser | ai | leveldrive | sci
    tipo            TEXT NOT NULL,          -- SESSAO_EXPIRADA | LAYOUT_MUDOU | etc
    mensagem        TEXT NOT NULL,
    screenshot_path TEXT,                   -- caminho do screenshot no VPS
    resolvido       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Fila de revisão manual (transações com baixa confiança)
CREATE TABLE IF NOT EXISTS revisao_manual (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    execucao_id         UUID REFERENCES execucoes(id),
    cliente_id          TEXT NOT NULL,
    competencia         TEXT NOT NULL,
    data_transacao      DATE,
    descricao           TEXT NOT NULL,
    valor               DECIMAL(15,2) NOT NULL,
    tipo                TEXT,               -- debito | credito
    classificacao_ia    JSONB,              -- sugestão da IA (confiança < 0.85)
    confianca           DECIMAL(3,2),
    status              TEXT DEFAULT 'pendente',  -- pendente | aprovado | rejeitado
    classificacao_final JSONB,              -- preenchido pelo contador
    responsavel         TEXT,               -- quem revisou
    revisado_em         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Histórico de sessões (para detectar expirações)
CREATE TABLE IF NOT EXISTS sessoes (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sistema     TEXT NOT NULL,              -- gestta | sci | leveldrive
    valida       BOOLEAN DEFAULT TRUE,
    ultimo_uso  TIMESTAMPTZ DEFAULT NOW(),
    expira_em   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Índices ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_execucoes_cliente ON execucoes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_execucoes_status ON execucoes(status);
CREATE INDEX IF NOT EXISTS idx_execucoes_competencia ON execucoes(competencia);
CREATE INDEX IF NOT EXISTS idx_revisao_status ON revisao_manual(status);
CREATE INDEX IF NOT EXISTS idx_erros_tipo ON erros(tipo);

-- ── View: resumo mensal ───────────────────────────────────────────────
CREATE OR REPLACE VIEW resumo_mensal AS
SELECT
    competencia,
    COUNT(*) as total_clientes,
    COUNT(*) FILTER (WHERE status = 'concluido') as concluidos,
    COUNT(*) FILTER (WHERE status = 'erro') as com_erro,
    SUM(lancamentos) as total_lancamentos,
    SUM(revisao_manual) as total_revisao_manual,
    AVG(EXTRACT(EPOCH FROM (fim - inicio))/60)::INTEGER as tempo_medio_min
FROM execucoes
GROUP BY competencia
ORDER BY competencia DESC;

-- ── View: itens pendentes de revisão ─────────────────────────────────
CREATE OR REPLACE VIEW revisao_pendente AS
SELECT
    r.*,
    e.nome_empresa
FROM revisao_manual r
JOIN execucoes e ON e.id = r.execucao_id
WHERE r.status = 'pendente'
ORDER BY r.created_at;
