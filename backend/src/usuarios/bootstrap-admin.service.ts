import { BadRequestException, ConflictException } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { PerfilUsuario } from './perfil-usuario.enum.js';
import { Usuario } from './usuario.entity.js';
import { UsuariosService } from './usuarios.service.js';

export type ModoBootstrap = 'novo' | 'existente';
export type CredenciaisBootstrap = {
  modo: ModoBootstrap;
  email: string;
  senha: string;
};

/** Adaptador explícito: autentica uma identidade ou a cria no SuperTokens. */
export interface ProvedorIdentidadeBootstrap {
  criar(email: string, senha: string): Promise<string>;
  autenticar(email: string, senha: string): Promise<string>;
  excluirCriacaoIncompleta?(id: string): Promise<void>;
}

/**
 * Operação offline controlada, jamais invocada pelo signup público.
 * O lock impede que duas execuções concorrentes nomeiem admins iniciais.
 */
export async function criarAdministradorInicial(
  conexao: DataSource,
  credenciais: CredenciaisBootstrap,
  identidades: ProvedorIdentidadeBootstrap,
): Promise<Usuario> {
  const email = credenciais.email.trim().toLowerCase();
  if (!['novo', 'existente'].includes(credenciais.modo) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 320 || credenciais.senha.length < 12) {
    throw new BadRequestException('Modo, e-mail ou senha inválidos (mínimo 12 caracteres)');
  }

  let criadaNestaTentativa: string | undefined;
  let callbackConcluido = false;
  try {
    return await conexao.transaction(async (manager) => {
    // Chave fixada neste utilitário; lock transacional liberado no commit/rollback.
    await manager.query('SELECT pg_advisory_xact_lock($1)', [720701]);
    const repositorio = manager.getRepository(Usuario);
    const jaExiste = await repositorio.countBy({ perfil: PerfilUsuario.ADMINISTRADOR });
    if (jaExiste > 0) {
      throw new ConflictException('Bootstrap encerrado: já existe Administrador');
    }

    // Identidade existente exige conhecer sua senha; e-mail sozinho NÃO basta.
    const supertokensUserId = credenciais.modo === 'novo'
      ? await identidades.criar(email, credenciais.senha)
      : await identidades.autenticar(email, credenciais.senha);
    if (credenciais.modo === 'novo') criadaNestaTentativa = supertokensUserId;

    const usuario = new UsuariosService(repositorio);
    const provisionado = await usuario.criarProvisionado({
      supertokensUserId,
      email,
      perfil: PerfilUsuario.ADMINISTRADOR,
    });
    callbackConcluido = true;
    return provisionado;
    });
  } catch (erro: unknown) {
    if (criadaNestaTentativa) {
      if (callbackConcluido) {
        // COMMIT pode ter sido confirmado pelo servidor mesmo com resposta perdida.
        // Na dúvida preservar a identidade externa, nunca apagar uma conta válida.
        let persistido: Usuario | null;
        try { persistido = await conexao.getRepository(Usuario).findOneBy({ supertokensUserId: criadaNestaTentativa }); }
        catch { throw new Error('Confirmação de bootstrap indeterminada; reconciliação manual necessária'); }
        if (persistido) {
          if (persistido.email === email && persistido.perfil === PerfilUsuario.ADMINISTRADOR && persistido.ativo) return persistido;
          throw new Error('Identidade persistida divergente; reconciliação manual necessária');
        }
      }
      if (!identidades.excluirCriacaoIncompleta) {
        throw new Error('Bootstrap falhou após criar identidade; reconciliar manualmente pelo modo existente');
      }
      try { await identidades.excluirCriacaoIncompleta(criadaNestaTentativa); }
      catch { throw new Error('Falha ao compensar identidade do bootstrap; reconciliação manual necessária'); }
    }
    throw erro;
  }
}
