import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import type { IdentidadesFuncionariosService } from './identidades-funcionarios.service.js';
import { PerfilUsuario } from './perfil-usuario.enum.js';
import { Usuario } from './usuario.entity.js';

/** Core não participa do COMMIT PostgreSQL. Persiste um marcador antes de tocar o Core;
 * nenhuma falha indeterminada libera a conta ou dispara compensação fora de lock. */
export async function alterarEmailSeguro(db: DataSource, auditoria: AuditoriaService,
  identidades: IdentidadesFuncionariosService, ator: UsuarioAutenticado, alvoId: string,
  destino: string, verificarSenhaAtual?: (alvo: Usuario) => Promise<void>): Promise<Usuario> {
  const propria = alvoId === ator.id;
  if (propria !== Boolean(verificarSenhaAtual)) throw new ForbiddenException('Operação de credencial inválida');
  const operacao = randomUUID();
  const carregar = async (m: EntityManager, segundaEtapa: boolean) => {
    const repo = m.getRepository(Usuario);
    const bloqueados = new Map<string, Usuario>();
    for (const id of [...new Set([ator.id, alvoId])].sort()) {
      const u = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (u) bloqueados.set(id, u);
    }
    const autor = bloqueados.get(ator.id), alvo = bloqueados.get(alvoId);
    if (!autor?.ativo || autor.perfil !== PerfilUsuario.ADMINISTRADOR || autor.supertokensUserId !== ator.supertokensUserId ||
        (autor.bloqueioSessoesId && !(propria && segundaEtapa && autor.bloqueioSessoesId === operacao)))
      throw new ForbiddenException('Conta administrativa indisponível');
    if (!alvo) throw new NotFoundException('Funcionário não encontrado');
    if (!propria && alvo.perfil === PerfilUsuario.ADMINISTRADOR) throw new ForbiddenException('Conta administrativa protegida');
    if (segundaEtapa ? alvo.bloqueioSessoesId !== operacao : Boolean(alvo.bloqueioSessoesId))
      throw new ConflictException('Existe uma regularização de sessões pendente para esta conta');
    return { repo, alvo };
  };
  const preparo = await db.transaction(async m => {
    const { repo, alvo } = await carregar(m, false);
    if (verificarSenhaAtual) await verificarSenhaAtual(alvo);
    if (alvo.email === destino) return { alterar: false as const, alvo };
    if (await repo.findOneBy({ email: destino })) throw new ConflictException('E-mail já cadastrado');
    alvo.bloqueioSessoesId = operacao;
    await repo.save(alvo);
    await auditoria.registrarNaTransacao(m, ator, { acao: AcaoAuditoria.USUARIO_EMAIL_ALTERACAO_SOLICITADA,
      entidadeTipo: 'USUARIO', entidadeId: alvo.id, dadosPosteriores: { situacao: 'SOLICITADA' } });
    return { alterar: true as const, anterior: alvo.email, idCore: alvo.supertokensUserId };
  });
  if (!preparo.alterar) return preparo.alvo;
  let resultado: { rejeitado: true; erro: ConflictException } | { rejeitado: false; alvo: Usuario };
  try {
    resultado = await db.transaction(async m => {
      const { repo, alvo } = await carregar(m, true);
      if (alvo.email !== preparo.anterior || alvo.supertokensUserId !== preparo.idCore)
        throw new ConflictException('Identidade alterada durante esta operação');
      // Rejeição definitiva do provedor é diferente de erro de transporte/timeout.
      // Somente EMAIL_ALREADY_EXISTS_ERROR é mapeado para este ConflictException pelo adaptador.
      try { await identidades.alterarEmail(alvo.supertokensUserId, destino); }
      catch (erro) {
        if (!(erro instanceof ConflictException)) throw erro;
        alvo.bloqueioSessoesId = null;
        await repo.save(alvo);
        await auditoria.registrarNaTransacao(m, ator, { acao: AcaoAuditoria.USUARIO_EMAIL_ALTERACAO_REJEITADA,
          entidadeTipo: 'USUARIO', entidadeId: alvo.id, dadosPosteriores: { situacao: 'REJEITADA' } });
        return { rejeitado: true as const, erro };
      }
      alvo.email = destino;
      alvo.bloqueioSessoesId = null;
      await repo.save(alvo);
      await auditoria.registrarNaTransacao(m, ator, { acao: AcaoAuditoria.USUARIO_EMAIL_ALTERADO,
        entidadeTipo: 'USUARIO', entidadeId: alvo.id, dadosAnteriores: { email: preparo.anterior }, dadosPosteriores: { email: destino } });
      return { rejeitado: false as const, alvo };
    });
  } catch (erro) {
    // Não repetir a escrita externa. Se o commit efetivou a troca, uma leitura
    // pode confirmar o resultado; caso contrário o marcador é mantido para recuperação.
    let persistido: Usuario | null = null;
    try { persistido = await db.getRepository(Usuario).findOneBy({ id: alvoId }); } catch { /* confirmação indisponível */ }
    if (persistido && persistido.supertokensUserId === preparo.idCore && !persistido.bloqueioSessoesId) {
      if (persistido.email === destino) return persistido;
      if (persistido.email === preparo.anterior && erro instanceof ConflictException) throw erro;
    }
    new Logger('AlteracaoEmailSegura').error('Alteração de e-mail não confirmada; verificar regularização de credenciais');
    throw new InternalServerErrorException('E-mail com confirmação indeterminada. Consulte a regularização de sessões antes de tentar novamente.');
  }
  if (resultado.rejeitado) throw resultado.erro;
  return resultado.alvo;
}
