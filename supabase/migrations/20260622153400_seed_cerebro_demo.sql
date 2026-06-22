-- Cérebro LCR · seeds de demonstração (Onda 1)
-- Popula o mínimo para navegar os três painéis na reunião de validação.

-- ---- 12 processos --------------------------------------------------
INSERT INTO public.kb_processos (codigo, nome, area, descricao, ordem) VALUES
  ('PROC-001', 'Integração e Conciliação Bancária', 'Contábil', 'Captura de extratos, classificação de lançamentos e fechamento mensal', 1),
  ('PROC-002', 'Cobrança de Movimento Mensal', 'Contábil', 'Solicitação de documentos do cliente e acompanhamento de entrega', 2),
  ('PROC-003', 'Lançamentos Contábeis', 'Contábil', 'Classificação e lançamento no SCI Único', 3),
  ('PROC-004', 'Conciliação e Balancete', 'Contábil', 'Conciliação assistida e emissão do balancete', 4),
  ('PROC-005', 'Apuração de Impostos Federais', 'Fiscal', 'PIS, COFINS, IRPJ, CSLL', 5),
  ('PROC-006', 'Apuração de ICMS e ISS', 'Fiscal', 'Estaduais e municipais', 6),
  ('PROC-007', 'Folha de Pagamento', 'DP', 'Cálculo e fechamento mensal', 7),
  ('PROC-008', 'Admissão e Demissão', 'DP', 'eSocial e documentação', 8),
  ('PROC-009', 'Atendimento Consultivo', 'Atendimento', 'Análise consultiva mensal do cliente', 9),
  ('PROC-010', 'Onboarding de Cliente', 'Atendimento', 'Processo de entrada de novo cliente na LCR', 10),
  ('PROC-011', 'Onboarding de Colaborador', 'RH', 'Integração de novo membro do time LCR', 11),
  ('PROC-012', 'Auditoria Interna', 'Governança', 'Revisão de processos e qualidade', 12)
ON CONFLICT (codigo) DO NOTHING;

-- ---- passos para os processos contábeis principais -----------------
INSERT INTO public.kb_processo_passos (processo_id, ordem, titulo, descricao)
SELECT p.id, v.ordem, v.titulo, v.descricao
FROM public.kb_processos p
JOIN (VALUES
  ('PROC-001', 1, 'Capturar extratos bancários', 'Baixar os extratos (CSV/OFX) de cada conta do cliente no período.'),
  ('PROC-001', 2, 'Importar a razão do SCI', 'Exportar a razão contábil e importar na tela de Conciliação.'),
  ('PROC-001', 3, 'Conciliar', 'Rodar a conciliação assistida (regras + IA) e tratar divergências.'),
  ('PROC-001', 4, 'Fechar o mês', 'Validar saldos e marcar a competência como concluída.'),
  ('PROC-003', 1, 'Classificar documentos', 'Conferir os documentos recebidos e classificar por natureza.'),
  ('PROC-003', 2, 'Gerar planilha SCI', 'Gerar a planilha agregada por conta e enviar ao SCI Único.'),
  ('PROC-004', 1, 'Conciliar contas', 'Conciliar as contas patrimoniais e de resultado.'),
  ('PROC-004', 2, 'Emitir balancete', 'Emitir e revisar o balancete antes da entrega.')
) AS v(codigo, ordem, titulo, descricao) ON v.codigo = p.codigo
ON CONFLICT DO NOTHING;

-- ---- 10 artigos (placeholder com estrutura) ------------------------
INSERT INTO public.kb_articles (titulo, conteudo_markdown, categoria, tags, processo_id)
SELECT v.titulo, v.conteudo, v.categoria, v.tags,
       (SELECT id FROM public.kb_processos WHERE codigo = v.codigo)
FROM (VALUES
  ('Como conciliar fim de mês', E'# Conciliação de fim de mês\n\nPasso a passo da conciliação bancária assistida.\n\n_Conteúdo a ser detalhado pela equipe._', 'procedimento', ARRAY['conciliação','fechamento'], 'PROC-001'),
  ('Padrão de classificação de lançamentos', E'# Padrão da casa\n\nComo classificamos lançamentos no plano de contas.\n\n_Em construção._', 'padrao', ARRAY['lançamentos','plano de contas'], 'PROC-003'),
  ('Checklist de cobrança de movimento', E'# Cobrança de movimento\n\nChecklist de documentos por regime.\n\n_Em construção._', 'procedimento', ARRAY['cobrança','documentos'], 'PROC-002'),
  ('Decisão: tratamento de tarifas bancárias', E'# Decisão\n\nComo tratamos tarifas e juros bancários.\n\n_Em construção._', 'decisao', ARRAY['tarifas','banco'], 'PROC-001'),
  ('FAQ — Balancete não fecha', E'# FAQ\n\nO que verificar quando o balancete não fecha.\n\n_Em construção._', 'faq', ARRAY['balancete','dúvidas'], 'PROC-004'),
  ('Apuração de PIS/COFINS — visão geral', E'# PIS/COFINS\n\nVisão geral do cálculo.\n\n_Em construção._', 'procedimento', ARRAY['fiscal','pis','cofins'], 'PROC-005'),
  ('Roteiro de admissão no eSocial', E'# Admissão\n\nRoteiro de admissão e eventos do eSocial.\n\n_Em construção._', 'procedimento', ARRAY['dp','esocial'], 'PROC-008'),
  ('Como conduzir a análise consultiva mensal', E'# Atendimento consultivo\n\nComo preparar a reunião consultiva.\n\n_Em construção._', 'procedimento', ARRAY['consultivo','atendimento'], 'PROC-009'),
  ('Onboarding de cliente — primeiros 30 dias', E'# Onboarding\n\nPrimeiros 30 dias de um novo cliente.\n\n_Em construção._', 'procedimento', ARRAY['onboarding','cliente'], 'PROC-010'),
  ('Padrão de comunicação com o cliente', E'# Comunicação\n\nTom e cadência de comunicação.\n\n_Em construção._', 'padrao', ARRAY['cx','comunicação'], 'PROC-009')
) AS v(titulo, conteudo, categoria, tags, codigo);

-- ---- alguns vídeos -------------------------------------------------
INSERT INTO public.kb_videos (titulo, url, categoria, processo_id, duracao_segundos)
SELECT v.titulo, v.url, v.categoria, (SELECT id FROM public.kb_processos WHERE codigo = v.codigo), v.dur
FROM (VALUES
  ('Conciliação assistida na prática', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Contábil', 'PROC-001', 480),
  ('Gerando a planilha SCI', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Contábil', 'PROC-003', 300),
  ('Emissão do balancete', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Contábil', 'PROC-004', 360)
) AS v(titulo, url, categoria, codigo, dur);

-- ---- consultive_snapshots · 1 por cliente ativo (jun/2026) ---------
INSERT INTO public.consultive_snapshots (empresa_id, periodo, receita_total, despesa_total, margem_bruta, liquidez_corrente, endividamento, variacao_mes_anterior)
SELECT e.id, '2026-06-01'::date,
  (random() * 200000 + 50000)::numeric(14,2),
  (random() * 150000 + 30000)::numeric(14,2),
  (random() * 30 + 10)::numeric(5,2),
  (random() * 2 + 0.8)::numeric(5,2),
  (random() * 0.6 + 0.2)::numeric(5,2),
  (random() * 20 - 10)::numeric(5,2)
FROM public.empresas e WHERE e.ativo = TRUE
ON CONFLICT (empresa_id, periodo) DO NOTHING;

-- ---- consultive_insights · 4 por cliente ativo (~116) --------------
INSERT INTO public.consultive_insights (empresa_id, tipo, severidade, titulo, descricao, sugestao_acao, status)
SELECT e.id,
  (ARRAY['oportunidade_tributaria','risco_financeiro','tendencia','recomendacao'])[1 + (random() * 3)::int],
  (ARRAY['baixa','media','alta','baixa'])[1 + (random() * 3)::int],
  'Insight de demonstração para validação',
  'Conteúdo gerado automaticamente para validar o fluxo. Será substituído pela saída real do Consultor.',
  'Validar com cliente na próxima reunião',
  'aberto'
FROM public.empresas e, generate_series(1, 4)
WHERE e.ativo = TRUE;

-- ---- cx_health_score · 1 por cliente ativo -------------------------
INSERT INTO public.cx_health_score (empresa_id, score, fatores, tendencia, classificacao)
SELECT e.id,
  (random() * 60 + 40)::int,
  jsonb_build_object(
    'nps', (random() * 10)::int,
    'frequencia_contato', round((random())::numeric, 2),
    'atrasos', (random() * 5)::int,
    'entregas_no_prazo', round((random())::numeric, 2)
  ),
  (ARRAY['caindo','estavel','subindo'])[1 + (random() * 2)::int],
  CASE WHEN random() < 0.5 THEN 'saudavel' WHEN random() < 0.85 THEN 'atencao' ELSE 'risco' END
FROM public.empresas e WHERE e.ativo = TRUE
ON CONFLICT (empresa_id) DO NOTHING;

-- ---- cx_nps_responses · 6 períodos por cliente (tendência) ---------
INSERT INTO public.cx_nps_responses (empresa_id, score, periodo, categoria, comentario)
SELECT e.id, s.score, s.periodo,
  CASE WHEN s.score <= 6 THEN 'detrator' WHEN s.score <= 8 THEN 'neutro' ELSE 'promotor' END,
  NULL
FROM public.empresas e
CROSS JOIN LATERAL (
  SELECT (random() * 10)::int AS score,
         (date '2026-06-01' - (g.n || ' month')::interval)::date AS periodo
  FROM generate_series(0, 5) AS g(n)
) s
WHERE e.ativo = TRUE;

-- ---- cx_touchpoints · alguns por cliente ---------------------------
INSERT INTO public.cx_touchpoints (empresa_id, tipo, canal, descricao, created_at)
SELECT e.id,
  (ARRAY['email','whatsapp','reuniao','ligacao','entrega'])[1 + (random() * 4)::int],
  (ARRAY['e-mail','WhatsApp','Google Meet','telefone','portal'])[1 + (random() * 4)::int],
  'Touchpoint de demonstração',
  NOW() - (random() * 40 || ' days')::interval
FROM public.empresas e, generate_series(1, 3)
WHERE e.ativo = TRUE;

-- ---- cx_engagement_events · alguns por cliente ---------------------
INSERT INTO public.cx_engagement_events (empresa_id, evento, peso, created_at)
SELECT e.id,
  (ARRAY['documento_recebido','tarefa_atrasada','reclamacao','retorno_rapido','entrega_no_prazo'])[1 + (random() * 4)::int],
  round((random() * 2)::numeric, 2),
  NOW() - (random() * 40 || ' days')::interval
FROM public.empresas e, generate_series(1, 3)
WHERE e.ativo = TRUE;
