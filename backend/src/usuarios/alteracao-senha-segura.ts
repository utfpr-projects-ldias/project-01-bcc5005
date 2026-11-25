import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { Usuario } from './usuario.entity.js';
import { PerfilUsuario } from './perfil-usuario.enum.js';
import { RevogacaoSessoesPendenteError, type IdentidadesFuncionariosService } from './identidades-funcionarios.service.js';

/** Mantém a credencial externa e o PostgreSQL separados. O marcador confirmado antes
 * da chamada ao Core torna qualquer resultado indeterminado fail-closed. */
export async function alterarSenhaSegura(db: DataSource, auditoria: AuditoriaService,
  identidades: IdentidadesFuncionariosService, ator: UsuarioAutenticado, alvoId: string,
  novaSenha: string, verificarSenhaAtual?: (alvo: Usuario) => Promise<void>): Promise<void> {
  const propria = alvoId === ator.id;
  if (propria !== Boolean(verificarSenhaAtual)) throw new ForbiddenException('Operação de credencial inválida');
  const operacao = randomUUID();
  const carregar = async (m: EntityManager, segundaEtapa: boolean) => {
    const repo = m.getRepository(Usuario);
    const bloqueados = new Map<string, Usuario>();
    for (const id of [...new Set([ator.id, alvoId])].sort()) {
      const usuario = await repo.findOne({where:{id},lock:{mode:'pessimistic_write'}});
      if (usuario) bloqueados.set(id, usuario);
    }
    const autor = bloqueados.get(ator.id), alvo = bloqueados.get(alvoId);
    if (!autor?.ativo || autor.perfil !== PerfilUsuario.ADMINISTRADOR || autor.supertokensUserId !== ator.supertokensUserId ||
        (autor.bloqueioSessoesId && !(propria && segundaEtapa && autor.bloqueioSessoesId === operacao)))
      throw new ForbiddenException('Conta administrativa indisponível');
    if (!alvo) throw new NotFoundException('Funcionário não encontrado');
    if (!propria && alvo.perfil === PerfilUsuario.ADMINISTRADOR) throw new ForbiddenException('Conta administrativa protegida');
    if (segundaEtapa ? alvo.bloqueioSessoesId !== operacao : Boolean(alvo.bloqueioSessoesId))
      throw new ConflictException('Existe uma regularização de sessões pendente para esta conta');
    return {repo, alvo};
  };
  await db.transaction(async m => {
    const {repo, alvo} = await carregar(m, false);
    if (verificarSenhaAtual) await verificarSenhaAtual(alvo);
    alvo.bloqueioSessoesId = operacao;
    await repo.save(alvo);
    await auditoria.registrarNaTransacao(m, ator, { acao: AcaoAuditoria.USUARIO_SENHA_REDEFINICAO_SOLICITADA,
      entidadeTipo:'USUARIO', entidadeId:alvo.id, dadosPosteriores:{situacao: propria ? 'SOLICITADA_PELO_TITULAR' : 'SOLICITADA'} });
  });
  try {
    await db.transaction(async m => {
      const {repo, alvo} = await carregar(m, true);
      await identidades.definirNovaSenha(alvo.supertokensUserId, novaSenha);
      alvo.bloqueioSessoesId = null;
      await repo.save(alvo);
      await auditoria.registrarNaTransacao(m, ator, {acao:AcaoAuditoria.USUARIO_SENHA_REDEFINIDA,
        entidadeTipo:'USUARIO', entidadeId:alvo.id, dadosPosteriores:{situacao:propria?'EFETIVADA_PELO_TITULAR':'EFETIVADA'}});
    });
  } catch (erro) {
    // Nunca repetir a alteração da senha em caso de confirmação indeterminada.
    // O marcador anterior permanece em caso de rollback; se o COMMIT ocorreu,
    // a operação já revogou as sessões e gravou a confirmação auditável.
    new Logger('AlteracaoSenhaSegura').error('Falha ou confirmação indeterminada de alteração de credencial; verificar regularização de sessões');
    if (erro instanceof RevogacaoSessoesPendenteError) {
      try {
        await auditoria.executarComAuditoria(ator, async () => ({ resultado: undefined, evento: {
          acao: AcaoAuditoria.USUARIO_SENHA_REVOGACAO_PENDENTE, entidadeTipo:'USUARIO', entidadeId:alvoId,
          dadosPosteriores:{situacao: propria ? 'SENHA_ALTERADA_SESSOES_PENDENTES_PELO_TITULAR' : 'SENHA_ALTERADA_SESSOES_PENDENTES'},
        }}));
      } catch { /* marcador durável continua protegendo o domínio */ }
    }
    throw new InternalServerErrorException('Alteração de senha com falha ou confirmação indeterminada. Consulte a regularização de sessões antes de tentar novamente.');
  }
}
