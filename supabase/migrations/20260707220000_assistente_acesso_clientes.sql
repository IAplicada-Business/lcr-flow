-- Assistente: acesso à Carteira (/clientes) como no cockpit operacional.
-- Preset anterior omitia a chave "clientes" — sidebar e guards bloqueavam a rota.

UPDATE public.permissoes_perfil
SET
  chaves = ARRAY['dashboard', 'clientes', 'documentos', 'conciliacao', 'tarefas'],
  atualizado_em = now()
WHERE perfil = 'assistente';
