import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { bloquearIdentidade } from '../autorizacao/permissao-transacional.js';
import { uuidValido } from '../autorizacao/politicas-operacionais.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { PerfilUsuario } from './perfil-usuario.enum.js';

type LinhaHistorico = {
  id: string; acao: string; registradoEm: Date; usuarioId: string; usuarioNome: string | null;
  autor: string; codigoContrato: string | null; situacao: string | null;
};

@Injectable()
export class HistoricoAdministrativoService {
  constructor(private readonly db: DataSource) {}

  async consultar(ator: UsuarioAutenticado, antes?: string) {
    if (antes !== undefined && !uuidValido(antes)) throw new BadRequestException('Cursor de histórico inválido');
    if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) throw new ForbiddenException('Histórico exclusivo da administração');
    return this.db.transaction(async m => {
      if ((await bloquearIdentidade(m, ator)).perfil !== PerfilUsuario.ADMINISTRADOR)
        throw new ForbiddenException('Histórico exclusivo da administração');
      const linhas = await m.query(`SELECT e.id, e.acao, e.registrado_em AS "registradoEm", e.entidade_id AS "usuarioId",
        COALESCE(alvo.nome, alvo.email) AS "usuarioNome",
        CASE WHEN e.ator_supertokens_user_id = 'SISTEMA:CLI_REGULARIZACAO' THEN 'Sistema — recuperação local'
          ELSE COALESCE(autor.nome, autor.email, 'Autor não disponível') END AS autor,
        c.codigo_publico AS "codigoContrato",
        CASE WHEN e.acao IN ('USUARIO_EMAIL_ALTERACAO_SOLICITADA','USUARIO_EMAIL_ALTERACAO_REJEITADA',
          'USUARIO_CREDENCIAIS_REGULARIZADAS','USUARIO_SENHA_REDEFINICAO_SOLICITADA','USUARIO_SENHA_REDEFINIDA','USUARIO_SENHA_REVOGACAO_PENDENTE')
          THEN e.dados_posteriores->>'situacao' ELSE NULL END AS situacao
        FROM eventos_auditoria e
        LEFT JOIN usuarios alvo ON alvo.id::text=e.entidade_id
        LEFT JOIN usuarios autor ON autor.supertokens_user_id=e.ator_supertokens_user_id
        LEFT JOIN contratos c ON c.id=e.contrato_id
        WHERE e.entidade_tipo='USUARIO' AND ($1::uuid IS NULL OR (e.registrado_em,e.id) <
          (SELECT r.registrado_em,r.id FROM eventos_auditoria r WHERE r.id=$1::uuid AND r.entidade_tipo='USUARIO'))
        ORDER BY e.registrado_em DESC,e.id DESC LIMIT 101`, [antes ?? null]) as LinhaHistorico[];
      const itens = linhas.slice(0, 100);
      return { itens, proximo: linhas.length > 100 ? itens[99].id : null };
    });
  }
}
