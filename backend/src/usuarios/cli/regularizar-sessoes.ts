import 'reflect-metadata';
import supertokens from 'supertokens-node';
import banco from '../../database/data-source.js';
import { superTokensConfig } from '../../auth/supertokens.config.js';
import { AcaoAuditoria } from '../../auditoria/acao-auditoria.js';
import { EventoAuditoria } from '../../auditoria/evento-auditoria.entity.js';
import { Usuario } from '../usuario.entity.js';
import { IdentidadesFuncionariosService } from '../identidades-funcionarios.service.js';

async function main() {
  const id = process.argv[2];
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new Error('Informe exclusivamente o UUID local da conta a regularizar');
  supertokens.init(superTokensConfig);
  await banco.initialize();
  try {
    const resultado = await banco.transaction(async m => {
      const repo = m.getRepository(Usuario);
      const usuario = await repo.findOne({where:{id},lock:{mode:'pessimistic_write'}});
      if (!usuario) throw new Error('Conta não encontrada');
      if (!usuario.bloqueioSessoesId) return false;
      const identidades = new IdentidadesFuncionariosService();
      // Banco é a referência de e-mail confirmado. Não liberar o marcador se o Core
      // não confirmar a reconciliação. Não alterar a senha durante a recuperação.
      await identidades.alterarEmail(usuario.supertokensUserId, usuario.email);
      await identidades.revogarSessoes(usuario.supertokensUserId);
      // A operação de senha anterior compara o UUID do bloqueio sob lock e não
      // prosseguirá caso esta recuperação tenha limpado o marcador.
      usuario.bloqueioSessoesId = null;
      await repo.save(usuario);
      // O operador é o CLI local, não o titular da conta; não forjar autoria de sessão.
      const eventos = m.getRepository(EventoAuditoria);
      await eventos.save(eventos.create({ atorSupertokensUserId: 'SISTEMA:CLI_REGULARIZACAO',
        entidadeTipo: 'USUARIO', entidadeId: usuario.id, contratoId: null,
        acao: AcaoAuditoria.USUARIO_CREDENCIAIS_REGULARIZADAS,
        dadosAnteriores: null, dadosPosteriores: { situacao: 'REGULARIZADA', origem: 'CLI_LOCAL' } }));
      return true;
    });
    console.log(resultado ? 'E-mail reconciliado, sessões revogadas e bloqueio liberado. A senha e a situação da conta não foram alteradas.' : 'Nenhuma regularização pendente.');
  } finally { await banco.destroy(); }
}
void main().catch(() => { console.error('Não foi possível regularizar as sessões. O bloqueio não deve ser removido manualmente.'); process.exitCode=1; });
