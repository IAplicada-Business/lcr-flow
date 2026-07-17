-- O upload manual de documentos (UploadDialog/UploadDocDialog) agora converte
-- .xls/.xlsx para CSV no client antes de subir (ver src/lib/upload-documento.ts),
-- e a edge function processar-documento já processa CSV/TXT e imagens webp/gif
-- (ver TEXTUAL/IMG em supabase/functions/processar-documento/index.ts). O bucket
-- criado em 20260623114418_storage_documentos_clientes.sql só permitia PDF,
-- JPEG, PNG e Excel — CSV/TXT/webp/gif eram bloqueados no próprio Storage antes
-- de chegar na edge. Mantém xls/xlsx no allowlist como fallback de compatibilidade
-- (upload direto sem passar pela conversão client-side, ex.: uploads antigos/scripts).
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]
WHERE id = 'documentos-clientes';
