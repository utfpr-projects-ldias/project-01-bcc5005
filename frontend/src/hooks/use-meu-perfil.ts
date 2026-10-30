'use client';
import { useConsulta } from '@/app/components/provedor-consultas';
import { consultarMeuPerfil } from '@/lib/admin-usuarios';
export const CHAVE_PERFIL = ['identidade', 'me'] as const;
export function useMeuPerfil(habilitada = true) {
  // Perfil participa da UX; toda permissao continua validada na API Nest.
  return useConsulta(CHAVE_PERFIL, () => consultarMeuPerfil(), { habilitada, validadeMs: 10_000 });
}
