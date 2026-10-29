import {
  BadRequestException, ForbiddenException, Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import type { UsuarioAutenticado } from './usuario-autenticado.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { PermissaoContrato } from './permissao-contrato.entity.js';
import type { ConcederPermissaoDto } from './dto/conceder-permissao.dto.js';

@Injectable()
export class GestaoPermissoesService {
  constructor(private readonly db: DataSource, private readonly auditoria: AuditoriaService) {}

  private async validarAdministrador(ator: UsuarioAutenticado) {
    if (ator?.perfil !== PerfilUsuario.ADMINISTRADOR) throw new ForbiddenException('Somente Administrador pode gerir vínculos');
    const admin = await this.db.getRepository(Usuario).findOneBy({ id: ator.id, ativo: true });
    if (!admin || admin.supertokensUserId !== ator.supertokensUserId || admin.perfil !== PerfilUsuario.ADMINISTRADOR) {
      throw new ForbiddenException('Administrador não está ativo');
    }
  }

  async listar(usuarioId: string, ator: UsuarioAutenticado) {
    await this.validarAdministrador(ator);
    const alvo = await this.db.getRepository(Usuario).findOneBy({ id: usuarioId });
    if (!alvo) throw new NotFoundException('Funcionário não encontrado');
    const itens = await this.db.getRepository(PermissaoContrato).find({
      where: { usuarioId }, order: { contratoId: 'ASC' },
    });
    return itens.map((v) => ({ contratoId: v.contratoId, podeEditar: v.podeEditar }));
  }

  async conceder(usuarioId: string, dto: ConcederPermissaoDto, ator: UsuarioAutenticado) {
    await this.validarAdministrador(ator);
    return this.db.transaction(async (manager) => {
      const funcionarios = manager.getRepository(Usuario);
      const alvo = await funcionarios.findOne({ where: { id: usuarioId }, lock: { mode: 'pessimistic_write' } });
      if (!alvo) throw new NotFoundException('Funcionário não encontrado');
      if (!alvo.ativo || alvo.perfil === PerfilUsuario.ADMINISTRADOR) {
        throw new ForbiddenException('Somente funcionários ativos podem receber vínculo');
      }
      if (alvo.perfil !== PerfilUsuario.GESTOR && dto.podeEditar) {
        throw new BadRequestException('Colaborador não pode editar contratos');
      }
      const contrato = await manager.getRepository(Contrato).findOneBy({ id: dto.contratoId });
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      const vinculos = manager.getRepository(PermissaoContrato);
      const anterior = await vinculos.findOne({
        where: { usuarioId, contratoId: dto.contratoId }, lock: { mode: 'pessimistic_write' },
      });
      if (anterior?.podeEditar === dto.podeEditar) {
        return { contratoId: dto.contratoId, podeEditar: dto.podeEditar };
      }
      const salvo = await vinculos.save(anterior
        ? Object.assign(anterior, { podeEditar: dto.podeEditar })
        : vinculos.create({ usuarioId, contratoId: dto.contratoId, podeEditar: dto.podeEditar }));
      await this.auditoria.registrarNaTransacao(manager, ator, {
        acao: AcaoAuditoria.USUARIO_PERMISSAO_CONCEDIDA, entidadeTipo: 'USUARIO', entidadeId: usuarioId,
        dadosAnteriores: anterior ? { contratoId: dto.contratoId, podeEditar: !dto.podeEditar } : null,
        dadosPosteriores: { contratoId: salvo.contratoId, podeEditar: salvo.podeEditar },
      });
      return { contratoId: salvo.contratoId, podeEditar: salvo.podeEditar };
    });
  }

  async revogar(usuarioId: string, contratoId: string, ator: UsuarioAutenticado): Promise<void> {
    await this.validarAdministrador(ator);
    await this.db.transaction(async (manager) => {
      const vinculos = manager.getRepository(PermissaoContrato);
      const vinculo = await vinculos.findOne({
        where: { usuarioId, contratoId }, lock: { mode: 'pessimistic_write' },
      });
      if (!vinculo) throw new NotFoundException('Vínculo não encontrado');
      await vinculos.remove(vinculo);
      await this.auditoria.registrarNaTransacao(manager, ator, {
        acao: AcaoAuditoria.USUARIO_PERMISSAO_REVOGADA, entidadeTipo: 'USUARIO', entidadeId: usuarioId,
        dadosAnteriores: { contratoId, podeEditar: vinculo.podeEditar }, dadosPosteriores: null,
      });
    });
  }
}
