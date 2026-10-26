import type { Request } from 'express';
import type { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';

export type UsuarioAutenticado = {
  id: string;
  supertokensUserId: string;
  email: string;
  perfil: PerfilUsuario;
};

export type RequisicaoAutorizada = Request & { usuarioDominio?: UsuarioAutenticado };
