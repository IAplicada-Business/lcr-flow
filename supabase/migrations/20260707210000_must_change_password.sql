-- Troca obrigatória de senha no primeiro acesso.
-- Novos usuários (trigger + admin-users) entram com must_change_password = true.
-- Usuários já existentes antes desta migration não são forçados a trocar.

ALTER TABLE public.usuarios_perfil
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true;

-- Quem já usava o sistema continua entrando normalmente.
UPDATE public.usuarios_perfil
  SET must_change_password = false
  WHERE created_at < now();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usuarios_perfil (user_id, nome, email, perfil, must_change_password)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email,
    'assistente',
    true
  )
  ON CONFLICT (user_id) DO UPDATE
    SET
      email = COALESCE(EXCLUDED.email, public.usuarios_perfil.email),
      nome = COALESCE(EXCLUDED.nome, public.usuarios_perfil.nome);

  RETURN NEW;
END;
$$;

-- Chamado após o usuário definir a nova senha no client (updateUser).
CREATE OR REPLACE FUNCTION public.concluir_troca_senha()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.usuarios_perfil
  SET must_change_password = false
  WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.concluir_troca_senha() TO authenticated;
