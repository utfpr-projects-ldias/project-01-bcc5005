import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, QueryFailedError, type EntityManager, type Repository } from 'typeorm';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { documentacaoVerificada, filhosEmRevisao, filhosPendentesDeConclusao } from '../entregaveis/conclusao-documental.js';
import { ordemAposArquivamento } from './ordem-apos-arquivamento.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { PermissaoContrato } from '../autorizacao/permissao-contrato.entity.js';
import { permissoesEfetivas } from '../autorizacao/permissoes-granulares.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { ForbiddenException } from '@nestjs/common';
import { EventoAuditoria } from '../auditoria/evento-auditoria.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { EvidenciaEsperada } from '../entregaveis/evidencia-esperada.entity.js';
import { ComprovanteEvidencia } from '../entregaveis/comprovante-evidencia.entity.js';
import { In } from 'typeorm';
import { Contrato } from '../contratos/contrato.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import type { AtualizarEtapaDto } from './dto/atualizar-etapa.dto.js';
import type { CriarEtapaDto } from './dto/criar-etapa.dto.js';
import type { ReordenarEtapasDto } from './dto/reordenar-etapas.dto.js';
import { Etapa } from './etapa.entity.js';
import { StatusEtapa } from './status-etapa.enum.js';

export type RespostaEtapa = Etapa & {
  vigenciaContrato: { inicioVigencia: string; terminoVigencia: string };
  avisoVigencia: boolean;
};

/** Sem mutação de datas: a vigência do contrato é um contexto informativo. */
function resposta(etapa: Etapa, contrato: Contrato): RespostaEtapa {
  return Object.assign({}, etapa, {
    vigenciaContrato: {
      inicioVigencia: contrato.inicioVigencia,
      terminoVigencia: contrato.terminoVigencia,
    },
    avisoVigencia: Boolean(
      (etapa.inicioPrevisto && (etapa.inicioPrevisto < contrato.inicioVigencia || etapa.inicioPrevisto > contrato.terminoVigencia)) ||
      (etapa.terminoPrevisto && (etapa.terminoPrevisto < contrato.inicioVigencia || etapa.terminoPrevisto > contrato.terminoVigencia))
    ),
  });
}

function calendarioValido(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const d = new Date(`${data}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === data;
}

function verificarDados(etapa: Pick<Etapa, 'nome' | 'codigo' | 'inicioPrevisto' | 'terminoPrevisto'>): void {
  if (!etapa.nome.trim() || etapa.nome.length > 100) {
    throw new BadRequestException('Nome da etapa é obrigatório e deve ter até 100 caracteres');
  }
  if (etapa.codigo !== null && (!etapa.codigo.trim() || etapa.codigo.length > 30)) {
    throw new BadRequestException('Código da etapa inválido');
  }
  for (const data of [etapa.inicioPrevisto, etapa.terminoPrevisto]) {
    if (data !== null && !calendarioValido(data)) {
      throw new BadRequestException('Data prevista inválida; use YYYY-MM-DD');
    }
  }
  if (etapa.inicioPrevisto && etapa.terminoPrevisto && etapa.inicioPrevisto > etapa.terminoPrevisto) {
    throw new BadRequestException('Término previsto anterior ao início previsto');
  }
}

function snapshot(etapa: Etapa): Record<string, unknown> {
  return {
    contratoId: etapa.contratoId, codigoPublico: etapa.codigoPublico, codigo: etapa.codigo, nome: etapa.nome,
    descricao: etapa.descricao, sequencia: etapa.sequencia,
    inicioPrevisto: etapa.inicioPrevisto, terminoPrevisto: etapa.terminoPrevisto,
    status: etapa.status, observacoes: etapa.observacoes,
    conclusaoSolicitadaEm: etapa.conclusaoSolicitadaEm, encerramentoSolicitadoEm: etapa.encerramentoSolicitadoEm,
  };
}

/** Retorna um erro HTTP consistente sem expor SQL, IDs privados ou registros alheios. */
function traduzirErro(error: unknown): never {
  if (error instanceof QueryFailedError) {
    const driver = error.driverError as { code?: string };
    switch (driver.code) {
      case '23505': case '40P01': case '40001':
        throw new ConflictException('Alteração concorrente ou sequência já ocupada. Recarregue e tente novamente');
      case '23503':
        throw new NotFoundException('Contrato ou Etapa não encontrado');
      case '23514': case '22P02': case '22007': case '22008':
        throw new BadRequestException('Dados da etapa inválidos');
    }
  }
  throw error;
}

/**
 * RF-05 / RNF-01/02/05: CRUD sem DELETE, raiz contratual persistida,
 * serialização de escritas mediante SELECT FOR UPDATE do CONTRATO e auditoria
 * na mesma transação. A ordem é única e DEFERRABLE na migration HU06-01.
 */
@Injectable()
export class EtapasService {
  constructor(
    @InjectRepository(Etapa) private readonly etapas: Repository<Etapa>,
    @InjectRepository(Contrato) private readonly contratos: Repository<Contrato>,
    private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  private async contratoExistente(id: string): Promise<Contrato> {
    const contrato = await this.contratos.findOneBy({ id });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    return contrato;
  }

  /** Serializa criação, reordenação e edição sem expor bloqueios ao navegador. */
  private async bloquearContrato(manager: EntityManager, id: string, somenteConclusao = false): Promise<Contrato> {
    const contrato = await manager.getRepository(Contrato)
      .createQueryBuilder('c')
      .setLock('pessimistic_write')
      .where('c.id = :id', { id })
      .getOne();
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.arquivadoEm || (contrato.status === 'CONCLUIDO' || contrato.status === 'ENCERRADO') ||
      (!somenteConclusao && contrato.reabertoEm === null && await documentacaoVerificada(manager, id) && !await filhosEmRevisao(manager, id)))
      throw new ConflictException('Reative ou reabra o contrato antes de modificar etapas');
    return contrato;
  }

  async listar(contratoId: string): Promise<RespostaEtapa[]> {
    const contrato = await this.contratoExistente(contratoId);
    const registros = await this.etapas.find({
      where: { contratoId }, order: { sequencia: 'ASC', id: 'ASC' },
    });
    return registros.map((etapa) => resposta(etapa, contrato));
  }

  async detalhar(contratoId: string, etapaId: string): Promise<RespostaEtapa> {
    const etapa = await this.etapas.findOneBy({ contratoId, id: etapaId });
    if (!etapa) throw new NotFoundException('Etapa não encontrada');
    const contrato = await this.contratoExistente(contratoId);
    return resposta(etapa, contrato);
  }

  async criar(contratoId: string, dto: CriarEtapaDto, ator: UsuarioAutenticado): Promise<RespostaEtapa> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const contrato = await this.bloquearContrato(manager, contratoId);
        if (dto.status === StatusEtapa.CONCLUIDA || dto.status === StatusEtapa.ENCERRADA || dto.status === StatusEtapa.FINALIZADA) throw new ForbiddenException('Cadastre a etapa em planejamento ou andamento; a finalização é uma operação separada');
        const repo = manager.getRepository(Etapa);
        const ultima = await repo.findOne({ where: { contratoId }, order: { sequencia: 'DESC' } });
        const etapa = repo.create({
          contratoId, nome: dto.nome.trim(), codigo: dto.codigo == null ? null : dto.codigo.trim(),
          descricao: dto.descricao ?? null, sequencia: (ultima?.sequencia ?? 0) + 1,
          inicioPrevisto: dto.inicioPrevisto ?? null,
          terminoPrevisto: dto.terminoPrevisto ?? null,
          status: dto.status ?? StatusEtapa.PLANEJADA,
          observacoes: dto.observacoes ?? null,
        });
        verificarDados(etapa);
        const salva = await repo.save(etapa);
        await this.auditoria.registrarNaTransacao(manager, ator, {
          acao: AcaoAuditoria.ETAPA_CRIADA, entidadeTipo: 'ETAPA', entidadeId: salva.id,
          dadosPosteriores: snapshot(salva),
        });
        return resposta(salva, contrato);
      });
    } catch (error: unknown) { return traduzirErro(error); }
  }

  async editar(contratoId: string, etapaId: string, dto: AtualizarEtapaDto, ator: UsuarioAutenticado): Promise<RespostaEtapa> {
    if (Object.keys(dto).length === 0) throw new BadRequestException('Informe ao menos um campo para editar');
    try {
      return await this.dataSource.transaction(async (manager) => {
        const contrato = await this.bloquearContrato(manager, contratoId);
        const repo = manager.getRepository(Etapa);
        const etapa = await repo.findOneBy({ contratoId, id: etapaId });
        if (!etapa) throw new NotFoundException('Etapa não encontrada');
        if (etapa.arquivadoEm) throw new ConflictException('Reative a etapa antes de editar');
        if (etapa.conclusaoSolicitadaEm || etapa.encerramentoSolicitadoEm) throw new ConflictException('Existe solicitação pendente; devolva a decisão antes de editar a etapa');
        if (etapa.status === StatusEtapa.CONCLUIDA || etapa.status === StatusEtapa.ENCERRADA || etapa.status === StatusEtapa.FINALIZADA ||
          (etapa.reabertoEm === null && await documentacaoVerificada(manager, contratoId, etapaId)))
          throw new ConflictException('Etapa concluída: reabra antes de editar');
        const anterior = snapshot(etapa);
        const datasAnteriores = { inicioPrevisto: etapa.inicioPrevisto, terminoPrevisto: etapa.terminoPrevisto };
        const statusAnterior = etapa.status;
        if (dto.nome !== undefined) etapa.nome = dto.nome.trim();
        if (dto.codigo !== undefined) etapa.codigo = dto.codigo === null ? null : dto.codigo.trim();
        if (dto.descricao !== undefined) etapa.descricao = dto.descricao;
        if (dto.inicioPrevisto !== undefined) etapa.inicioPrevisto = dto.inicioPrevisto;
        if (dto.terminoPrevisto !== undefined) etapa.terminoPrevisto = dto.terminoPrevisto;
        if (dto.status !== undefined) {
          if (dto.status === StatusEtapa.CONCLUIDA || dto.status === StatusEtapa.ENCERRADA || dto.status === StatusEtapa.FINALIZADA) throw new ForbiddenException('Use uma operação de finalização autorizada');
          etapa.status = dto.status;
        }
        if (dto.observacoes !== undefined) etapa.observacoes = dto.observacoes;
        verificarDados(etapa);
        const salva = await repo.save(etapa);
        if (salva.status !== statusAnterior) {
          await this.auditoria.registrarNaTransacao(manager, ator, {
            acao: AcaoAuditoria.ETAPA_STATUS_ALTERADO, entidadeTipo: 'ETAPA', entidadeId: etapaId,
            dadosAnteriores: { status: statusAnterior }, dadosPosteriores: { status: salva.status },
          });
        }
        if (salva.inicioPrevisto !== datasAnteriores.inicioPrevisto || salva.terminoPrevisto !== datasAnteriores.terminoPrevisto) {
          await this.auditoria.registrarNaTransacao(manager, ator, {
            acao: AcaoAuditoria.ETAPA_PRAZO_ALTERADO, entidadeTipo: 'ETAPA', entidadeId: etapaId,
            dadosAnteriores: datasAnteriores,
            dadosPosteriores: { inicioPrevisto: salva.inicioPrevisto, terminoPrevisto: salva.terminoPrevisto },
          });
        }
        await this.auditoria.registrarNaTransacao(manager, ator, {
          acao: AcaoAuditoria.ETAPA_EDITADA, entidadeTipo: 'ETAPA', entidadeId: etapaId,
          dadosAnteriores: anterior, dadosPosteriores: snapshot(salva),
        });
        return resposta(salva, contrato);
      });
    } catch (error: unknown) { return traduzirErro(error); }
  }

  /** Uma solicitação não conclui nem encerra a etapa. A decisão final pertence a outro ator autorizado. */
  async solicitarConclusao(contratoId: string, etapaId: string, ator: UsuarioAutenticado): Promise<RespostaEtapa> {
    return this.dataSource.transaction(async manager => {
      const contrato = await this.bloquearContrato(manager, contratoId, true);
      if (contrato.arquivadoEm || ['CONCLUIDO','ENCERRADO','SUSPENSO','CANCELADO'].includes(contrato.status))
        throw new ConflictException('Contrato fechado ou suspenso; reabra ou retome antes.');
      if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
        const vinculo = await manager.getRepository(PermissaoContrato).findOneBy({ usuarioId: ator.id, contratoId });
        if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas).editarEtapas)
          throw new ForbiddenException('Sem permissão para solicitar conclusão de etapa');
      }
      const repo = manager.getRepository(Etapa);
      const etapa = await repo.findOneBy({ contratoId, id: etapaId });
      if (!etapa) throw new NotFoundException('Etapa não encontrada');
      if (etapa.arquivadoEm || (!etapa.reabertoEm && ['CONCLUIDA','ENCERRADA','FINALIZADA'].includes(etapa.status)))
        throw new ConflictException('Etapa indisponível para solicitar conclusão');
      if (etapa.conclusaoSolicitadaEm || etapa.encerramentoSolicitadoEm)
        throw new ConflictException('Já existe uma solicitação pendente para a etapa');
      if (!await documentacaoVerificada(manager, contratoId, etapaId) || await filhosPendentesDeConclusao(manager, contratoId, etapaId))
        throw new ConflictException('Conclua ou verifique primeiro os entregáveis e evidências exigidos');
      etapa.conclusaoSolicitadaEm = new Date(); etapa.conclusaoSolicitadaPor = ator.id;
      const salvo = await repo.save(etapa);
      await this.auditoria.registrarNaTransacao(manager, ator, {
        acao: AcaoAuditoria.ETAPA_STATUS_ALTERADO, entidadeTipo:'ETAPA', entidadeId:etapaId,
        dadosAnteriores:{solicitacao:null}, dadosPosteriores:{solicitacao:'CONCLUSAO', solicitadaEm:salvo.conclusaoSolicitadaEm, solicitante:ator.id},
      });
      return resposta(salvo,contrato);
    });
  }

  async solicitarEncerramento(contratoId:string,etapaId:string,ator:UsuarioAutenticado,motivo:string):Promise<RespostaEtapa>{
    const justificativa=motivo?.trim()??'';
    if(justificativa.length<15||justificativa.length>200)throw new BadRequestException('Informe justificativa de 15 a 200 caracteres');
    return this.dataSource.transaction(async manager=>{
      const contrato=await this.bloquearContrato(manager,contratoId,true);
      if(contrato.arquivadoEm || ['CONCLUIDO','ENCERRADO','SUSPENSO','CANCELADO'].includes(contrato.status))throw new ConflictException('Contrato indisponível');
      if(ator.perfil!==PerfilUsuario.ADMINISTRADOR){
        const vinculo=await manager.getRepository(PermissaoContrato).findOneBy({usuarioId:ator.id,contratoId});
        if(!vinculo||!permissoesEfetivas(ator.perfil,vinculo.podeEditar,vinculo.permissoesDetalhadas).editarEtapas)throw new ForbiddenException('Sem permissão para solicitar encerramento de etapa');
      }
      const repo=manager.getRepository(Etapa);const etapa=await repo.findOneBy({contratoId,id:etapaId});
      if(!etapa)throw new NotFoundException('Etapa não encontrada');
      if(etapa.arquivadoEm || (!etapa.reabertoEm && ['CONCLUIDA','ENCERRADA','FINALIZADA'].includes(etapa.status)))throw new ConflictException('Etapa indisponível');
      if(etapa.encerramentoSolicitadoEm||etapa.conclusaoSolicitadaEm)throw new ConflictException('Já existe solicitação pendente');
      if(await documentacaoVerificada(manager,contratoId,etapaId)&&!await filhosPendentesDeConclusao(manager,contratoId,etapaId))
        throw new ConflictException('Etapa integralmente elegível: solicite conclusão em vez de encerramento');
      etapa.encerramentoSolicitadoEm=new Date();etapa.encerramentoSolicitadoPor=ator.id;etapa.encerramentoMotivo=justificativa;
      const salvo=await repo.save(etapa);
      await this.auditoria.registrarNaTransacao(manager,ator,{
        acao:AcaoAuditoria.ETAPA_STATUS_ALTERADO,entidadeTipo:'ETAPA',entidadeId:etapaId,
        dadosAnteriores:{solicitacao:null},dadosPosteriores:{solicitacao:'ENCERRAMENTO',justificativa,solicitante:ator.id},
      });
      return resposta(salvo,contrato);
    });
  }

  async devolverSolicitacao(contratoId:string,etapaId:string,ator:UsuarioAutenticado,tipo:'conclusao'|'encerramento',motivo:string):Promise<RespostaEtapa>{
    const justificativa=motivo?.trim()??'';
    if(justificativa.length<15||justificativa.length>200)throw new BadRequestException('Informe justificativa de 15 a 200 caracteres');
    return this.dataSource.transaction(async manager=>{
      const contrato=await this.bloquearContrato(manager,contratoId,true);
      if(ator.perfil!==PerfilUsuario.ADMINISTRADOR){
        const vinculo=await manager.getRepository(PermissaoContrato).findOneBy({usuarioId:ator.id,contratoId});
        const p=vinculo?permissoesEfetivas(ator.perfil,vinculo.podeEditar,vinculo.permissoesDetalhadas):null;
        if(!p||!(tipo==='conclusao'?p.concluirEtapas:p.encerrarEtapas))throw new ForbiddenException('Sem permissão para devolver solicitação');
      }
      const repo=manager.getRepository(Etapa);const etapa=await repo.findOneBy({contratoId,id:etapaId});
      if(!etapa)throw new NotFoundException('Etapa não encontrada');
      if(!(tipo==='conclusao'?etapa.conclusaoSolicitadaEm:etapa.encerramentoSolicitadoEm))throw new ConflictException('Não existe solicitação pendente deste tipo');
      if(tipo==='conclusao'){etapa.conclusaoSolicitadaEm=null;etapa.conclusaoSolicitadaPor=null;}
      else {etapa.encerramentoSolicitadoEm=null;etapa.encerramentoSolicitadoPor=null;etapa.encerramentoMotivo=null;}
      const salvo=await repo.save(etapa);
      await this.auditoria.registrarNaTransacao(manager,ator,{acao:AcaoAuditoria.ETAPA_STATUS_ALTERADO,entidadeTipo:'ETAPA',entidadeId:etapaId,
        dadosAnteriores:{solicitacao:tipo.toUpperCase()},dadosPosteriores:{solicitacao:null,devolvidaPor:ator.id,justificativa}});
      return resposta(salvo,contrato);
    });
  }

  /** Confirmação explícita da etapa pela MESMA permissão no primeiro fechamento e no retorno da revisão. */
  async concluir(contratoId: string, etapaId: string, ator: UsuarioAutenticado): Promise<RespostaEtapa> {
    return this.dataSource.transaction(async manager => {
      const contrato = await this.bloquearContrato(manager, contratoId, true);
      if (contrato.arquivadoEm || ['CONCLUIDO','ENCERRADO','SUSPENSO','CANCELADO'].includes(contrato.status))
        throw new ConflictException('Reative ou reabra o contrato antes de concluir etapas');
      if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
        const vinculo = await manager.getRepository(PermissaoContrato).findOneBy({ usuarioId: ator.id, contratoId });
        if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas).concluirEtapas)
          throw new ForbiddenException('Sem permissão para concluir etapas');
      }
      const repo = manager.getRepository(Etapa);
      const etapa = await repo.findOneBy({ contratoId, id: etapaId });
      if (!etapa) throw new NotFoundException('Etapa não encontrada');
      if (etapa.arquivadoEm) throw new ConflictException('Reative a etapa arquivada primeiro');
      if (!etapa.conclusaoSolicitadaEm) throw new ConflictException('Solicite conclusão antes da aprovação');
      if ((etapa.status === StatusEtapa.CONCLUIDA || (etapa.status === StatusEtapa.ENCERRADA || etapa.status === StatusEtapa.FINALIZADA)) && !etapa.reabertoEm)
        throw new ConflictException('Etapa já concluída');
      if (!await documentacaoVerificada(manager, contratoId, etapaId))
        throw new ConflictException('Ainda existem comprovações pendentes nesta etapa');
      if (await filhosPendentesDeConclusao(manager, contratoId, etapaId))
        throw new ConflictException('Conclua primeiro os entregáveis e evidências em revisão');
      const anterior = { status: etapa.status, reabertoEm: etapa.reabertoEm ?? null };
      etapa.status = StatusEtapa.CONCLUIDA;
      etapa.reabertoEm = null;
      etapa.conclusaoSolicitadaEm = null; etapa.conclusaoSolicitadaPor = null;
      const salva = await repo.save(etapa);
      await this.auditoria.registrarNaTransacao(manager, ator, {
        acao: AcaoAuditoria.ETAPA_STATUS_ALTERADO, entidadeTipo: 'ETAPA', entidadeId: etapaId,
        dadosAnteriores: anterior,
        dadosPosteriores: { status: salva.status, reabertoEm: null, motivo: 'CONCLUSAO_EXPLICITA' },
      });
      return resposta(salva, contrato);
    });
  }

  /** Encerrar é uma decisão administrativa, nunca uma conclusão de execução. */
  async encerrar(contratoId: string, etapaId: string, ator: UsuarioAutenticado, motivo: string): Promise<RespostaEtapa> {
    const justificativa = typeof motivo === 'string' ? motivo.trim() : '';
    if (justificativa.length < 15 || justificativa.length > 200)
      throw new BadRequestException('Informe justificativa de 15 a 200 caracteres para encerrar a etapa');
    return this.dataSource.transaction(async manager => {
      const contrato = await this.bloquearContrato(manager, contratoId, true);
      if (contrato.status === 'SUSPENSO' || contrato.status === 'CANCELADO')
        throw new ConflictException('Retome o contrato antes de encerrar uma etapa');
      if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
        const vinculo = await manager.getRepository(PermissaoContrato).findOneBy({ usuarioId: ator.id, contratoId });
        if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas).encerrarEtapas)
          throw new ForbiddenException('Sem permissão para encerrar etapas');
      }
      const repo = manager.getRepository(Etapa);
      const etapa = await repo.findOneBy({ id: etapaId, contratoId });
      if (!etapa) throw new NotFoundException('Etapa não encontrada');
      if (!etapa.encerramentoSolicitadoEm) throw new ConflictException('Solicite encerramento antes da aprovação');
      if (etapa.arquivadoEm) throw new ConflictException('Reative a etapa antes de encerrar');
      if (['CONCLUIDA','ENCERRADA','FINALIZADA'].includes(etapa.status) && !etapa.reabertoEm)
        throw new ConflictException('Etapa já finalizada; uma nova decisão exige reabertura');
      const anterior = { status: etapa.status, reabertoEm: etapa.reabertoEm };
      etapa.status = StatusEtapa.ENCERRADA;
      etapa.reabertoEm = null;
      etapa.encerramentoSolicitadoEm = null; etapa.encerramentoSolicitadoPor = null; etapa.encerramentoMotivo = null;
      const salvo = await repo.save(etapa);
      await this.auditoria.registrarNaTransacao(manager, ator, {
        acao: AcaoAuditoria.ETAPA_STATUS_ALTERADO, entidadeTipo: 'ETAPA', entidadeId: etapaId,
        dadosAnteriores: anterior, dadosPosteriores: { status: salvo.status, nome: salvo.nome, justificativa },
      });
      return resposta(salvo, contrato);
    });
  }

  /** Finalização parcial autorizada: filhos resolvidos, sem falsificar CONCLUIDA. */
  async finalizar(contratoId: string, etapaId: string, ator: UsuarioAutenticado, motivo: string): Promise<RespostaEtapa> {
    if (!motivo || motivo.trim().length < 15 || motivo.trim().length > 200)
      throw new BadRequestException('Justifique a finalização parcial (15 a 200 caracteres)');
    return this.dataSource.transaction(async m => {
      const contrato = await this.bloquearContrato(m, contratoId, true);
      if (contrato.arquivadoEm || !['PLANEJAMENTO','EM_EXECUCAO','EM_ENCERRAMENTO'].includes(contrato.status))
        throw new ConflictException('Contrato indisponível para finalizar etapa');
      if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
        const v = await m.findOneBy(PermissaoContrato, { contratoId, usuarioId: ator.id });
        if (!v || !permissoesEfetivas(ator.perfil, v.podeEditar, v.permissoesDetalhadas).concluirEtapas)
          throw new ForbiddenException('Sem permissão para finalizar etapas');
      }
      const e = await m.findOne(Etapa, { where: { contratoId, id: etapaId }, lock: { mode: 'pessimistic_write' } });
      if (!e || e.arquivadoEm) throw new NotFoundException('Etapa indisponível');
      if (['CONCLUIDA','ENCERRADA','FINALIZADA'].includes(e.status)) throw new ConflictException('Etapa já possui decisão final');
      const filhos = await m.findBy(Entregavel, { contratoId, etapaId, arquivadoEm: IsNull() });
      if (!filhos.length || filhos.some(f => !['CONCLUIDO','FINALIZADO'].includes(f.statusExecucao ?? '')))
        throw new ConflictException('Conclua ou finalize todos os entregáveis ativos da etapa');
      if (!filhos.some(f => f.statusExecucao === 'FINALIZADO'))
        throw new ConflictException('Todos os entregáveis foram concluídos: utilize Concluir etapa');
      const anterior = { status: e.status };
      e.status = StatusEtapa.FINALIZADA;
      e.reabertoEm = null;
      const salvo = await m.save(Etapa, e);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.ETAPA_STATUS_ALTERADO, entidadeTipo: 'ETAPA', entidadeId: etapaId,
        dadosAnteriores: anterior, dadosPosteriores: { status: salvo.status, justificativa: motivo.trim(), aprovadoPor: ator.id },
      });
      return resposta(salvo, contrato);
    });
  }

  /** Rastreabilidade da etapa + das alterações de entregáveis ligados a ela. */
  async historico(contratoId: string, etapaId: string, ator: UsuarioAutenticado) {
    await this.detalhar(contratoId, etapaId);
    if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
      const vinculo = await this.dataSource.getRepository(PermissaoContrato).findOneBy({ usuarioId: ator.id, contratoId });
      if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas).editarEtapas)
        throw new ForbiddenException('Sem permissão para consultar rastreabilidade da etapa');
    }
    const filhos = await this.dataSource.getRepository(Entregavel).find({
      where: { contratoId, etapaId }, select: { id: true, nome: true },
    });
    const nomes = new Map(filhos.map(f => [f.id, f.nome]));
    const eventos = await this.dataSource.getRepository(EventoAuditoria).find({
      where: [
        { contratoId, entidadeTipo: 'ETAPA', entidadeId: etapaId },
        ...(filhos.length ? [{ contratoId, entidadeTipo: 'ENTREGAVEL' as const, entidadeId: In(filhos.map(f => f.id)) }] : []),
      ], order: { registradoEm: 'DESC', id: 'DESC' }, take: 100,
    });
    const autores = [...new Set(eventos.map(ev => ev.atorSupertokensUserId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0))];
    const usuariosHistorico = autores.length ? await this.dataSource.getRepository(Usuario).find({
      where: { supertokensUserId: In(autores) },
      select: { supertokensUserId: true, nome: true, email: true },
    }) : [];
    const porAutor = new Map(usuariosHistorico.map(u => [u.supertokensUserId, u]));
    const referenciaEvidencia = (ev: EventoAuditoria): string | null => {
      const antes = ev.dadosAnteriores ?? {};
      const depois = ev.dadosPosteriores ?? {};
      const id = [depois['evidenciaEsperadaId'], depois['itemId'], antes['evidenciaEsperadaId'], antes['itemId']]
        .find((x): x is string => typeof x === 'string');
      return id ?? null;
    };
    const evidenciasIds = [...new Set(eventos.map(referenciaEvidencia).filter((id): id is string => !!id))];
    const evidencias = evidenciasIds.length ? await this.dataSource.getRepository(EvidenciaEsperada).find({
      where: { id: In(evidenciasIds), entregavelId: In(filhos.map(f => f.id)) },
      select: { id: true, tipoEvidencia: true },
    }) : [];
    const evidenciaPorId = new Map(evidencias.map(ev => [ev.id, ev.tipoEvidencia]));
    const comprovanteIds = [...new Set(eventos.flatMap(ev => [
      ev.dadosAnteriores?.['comprovanteId'], ev.dadosPosteriores?.['comprovanteId'],
    ].filter((x): x is string => typeof x === 'string')))];
    const comprovantes = comprovanteIds.length ? await this.dataSource.getRepository(ComprovanteEvidencia).find({
      where: { id: In(comprovanteIds), contratoId, entregavelId: In(filhos.map(f => f.id)) },
      select: { id: true, nomeOriginal: true },
    }) : [];
    const arquivoPorId = new Map(comprovantes.map(c => [c.id, c.nomeOriginal]));
    return eventos.map(ev => {
      const idEvidencia = referenciaEvidencia(ev);
      const comprovanteId = [ev.dadosPosteriores?.['comprovanteId'], ev.dadosAnteriores?.['comprovanteId']]
        .find((id): id is string => typeof id === 'string');
      const nomeEvidencia = idEvidencia ? evidenciaPorId.get(idEvidencia) : null;
      const nomeNoEvento = [ev.dadosPosteriores?.['tipoEvidencia'], ev.dadosAnteriores?.['tipoEvidencia']]
        .find((v): v is string => typeof v === 'string');
      const nomeArquivo = comprovanteId ? arquivoPorId.get(comprovanteId) : null;
      const arquivoNoEvento = [ev.dadosPosteriores?.['nomeOriginal'], ev.dadosAnteriores?.['nomeOriginal']]
        .find((v): v is string => typeof v === 'string');
      return ({ id: ev.id, acao: ev.acao, ocorridoEm: ev.registradoEm,

      descricao: ev.entidadeTipo === 'ETAPA' ? 'Etapa: ' + ev.acao.replaceAll('_', ' ').toLowerCase() :
        'Entregável ' + (nomes.get(ev.entidadeId) ?? 'histórico') + ': ' + ev.acao.replaceAll('_', ' ').toLowerCase(),
      entidadeTipo: ev.entidadeTipo, entidadeId: ev.entidadeId,
      evidenciaId: idEvidencia,
      contexto: [ev.entidadeTipo === 'ENTREGAVEL' ? `Entregável: ${nomes.get(ev.entidadeId) ?? 'registro histórico'}` : null,
        nomeEvidencia ?? nomeNoEvento ? `Evidência: ${nomeEvidencia ?? nomeNoEvento}` : null].filter(Boolean).join(' · '),
      nomeArquivo: nomeArquivo ?? arquivoNoEvento ?? null,
      ator: porAutor.has(ev.atorSupertokensUserId) ? { nome: porAutor.get(ev.atorSupertokensUserId)!.nome ?? 'Nome não informado', email: porAutor.get(ev.atorSupertokensUserId)!.email } : null,
      justificativa: typeof ev.dadosPosteriores?.['justificativa'] === 'string' ? ev.dadosPosteriores['justificativa'].slice(0, 200) : null,
    });
    });
  }

  async reabrir(contratoId: string, etapaId: string, ator: UsuarioAutenticado, motivo?: string, somenteEncerrada = false): Promise<RespostaEtapa> {
    return this.dataSource.transaction(async manager => {
      const contrato = await this.bloquearContrato(manager, contratoId, true);
      if (contrato.arquivadoEm || (contrato.status === 'CONCLUIDO' || contrato.status === 'ENCERRADO')) throw new ConflictException('Reabra o contrato antes de modificar etapas');
      const repo = manager.getRepository(Etapa);
      const etapa = await repo.findOneBy({ id: etapaId, contratoId });
      if (!etapa) throw new NotFoundException('Etapa não encontrada');
      if (etapa.arquivadoEm) throw new ConflictException('Reative a etapa arquivada primeiro');
      if (etapa.reabertoEm) throw new ConflictException('Etapa já foi reaberta');
      if (somenteEncerrada !== (etapa.status === StatusEtapa.ENCERRADA || etapa.status === StatusEtapa.FINALIZADA))
        throw new ConflictException('Use a reabertura correspondente ao estado da etapa');
      if (somenteEncerrada && ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
        const vinculo = await manager.getRepository(PermissaoContrato).findOneBy({ usuarioId: ator.id, contratoId });
        if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas).reabrirEtapasEncerradas)
          throw new ForbiddenException('Sem permissão especial para reabrir etapa encerrada');
      }
      const operacional = [StatusEtapa.CONCLUIDA, StatusEtapa.ENCERRADA, StatusEtapa.FINALIZADA].includes(etapa.status);
      if (!operacional && !await documentacaoVerificada(manager, contratoId, etapaId))
        throw new ConflictException('Etapa ainda não tem comprovação concluída');
      const anterior = etapa.status;
      if (operacional) etapa.status = StatusEtapa.PLANEJADA;
      etapa.reabertoEm = new Date();
      await repo.save(etapa);
      await this.auditoria.registrarNaTransacao(manager, ator, {
        acao: AcaoAuditoria.ETAPA_REABERTA, entidadeTipo: 'ETAPA', entidadeId: etapaId,
        dadosAnteriores: { status: anterior, reabertoEm: null },
        dadosPosteriores: { status: etapa.status, reabertoEm: etapa.reabertoEm, ...(motivo ? { justificativa: motivo } : {}) },
      });
      return resposta(etapa, contrato);
    });
  }

  async alterarArquivamento(contratoId: string, etapaId: string, arquivar: boolean, ator: UsuarioAutenticado, motivo?: string): Promise<RespostaEtapa> {
    return this.dataSource.transaction(async (manager) => {
      const contrato = await this.bloquearContrato(manager, contratoId);
      const repo = manager.getRepository(Etapa);
      const etapa = await repo.findOneBy({ id: etapaId, contratoId });
      if (!etapa) throw new NotFoundException('Etapa não encontrada');
      if (Boolean(etapa.arquivadoEm) === arquivar) throw new ConflictException('Etapa já está neste estado de arquivamento');
      const anterior = { arquivadoEm: etapa.arquivadoEm, sequencia: etapa.sequencia };
      if (arquivar && (etapa.status === StatusEtapa.CONCLUIDA || etapa.status === StatusEtapa.ENCERRADA ||
        (etapa.reabertoEm === null && await documentacaoVerificada(manager, contratoId, etapaId))))
        throw new ConflictException('Etapa concluída: reabra antes de arquivar');
      etapa.arquivadoEm = arquivar ? new Date() : null;
      etapa.arquivadoPor = arquivar ? ator.id : null;
      await repo.save(etapa);
      // Serialize all position changes under the contract lock. The archived stage
      // leaves the active ordering; a restored stage is appended to the active end.
      // Archived rows occupy positions after the active rows (same UNIQUE index).
      await manager.query('SET CONSTRAINTS "uq_etapas_contrato_sequencia" DEFERRED');
      const todas = await repo.find({ where: { contratoId }, order: { sequencia: 'ASC', id: 'ASC' } });
      const novaOrdem = ordemAposArquivamento(todas, etapa, arquivar);
      for (const [indice, registro] of novaOrdem.entries()) {
        const sequenciaNova = indice + 1;
        if (registro.sequencia === sequenciaNova) continue;
        const sequenciaAntiga = registro.sequencia;
        await repo.update({ id: registro.id, contratoId }, { sequencia: sequenciaNova });
        registro.sequencia = sequenciaNova;
        await this.auditoria.registrarNaTransacao(manager, ator, {
          acao: AcaoAuditoria.ETAPA_REORDENADA,
          entidadeTipo: 'ETAPA', entidadeId: registro.id,
          dadosAnteriores: { sequencia: sequenciaAntiga, nome: registro.nome },
          dadosPosteriores: { sequencia: sequenciaNova, nome: registro.nome },
        });
      }
      await this.auditoria.registrarNaTransacao(manager, ator, {
        acao: arquivar ? AcaoAuditoria.ETAPA_ARQUIVADA : AcaoAuditoria.ETAPA_REATIVADA,
        entidadeTipo: 'ETAPA', entidadeId: etapaId,
        dadosAnteriores: { ...anterior, nome: etapa.nome },
        dadosPosteriores: { arquivadoEm: etapa.arquivadoEm, sequencia: etapa.sequencia, nome: etapa.nome, ...(motivo && !arquivar ? { justificativa: motivo } : {}) },
      });
      return resposta(etapa, contrato);
    });
  }

  async reordenar(contratoId: string, dto: ReordenarEtapasDto, ator: UsuarioAutenticado): Promise<RespostaEtapa[]> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const contrato = await this.bloquearContrato(manager, contratoId);
        if (contrato.ordemEtapasBloqueada) throw new ConflictException('Ordem das etapas bloqueada para este contrato.');
        const repo = manager.getRepository(Etapa);
        const atuais = await repo.find({ where: { contratoId }, order: { sequencia: 'ASC', id: 'ASC' } });
        const idsAtuais = atuais.map((etapa) => etapa.id);
        const iguais = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);
        const mesmosIds = dto.idsOrdemNova.length === idsAtuais.length &&
          dto.idsOrdemNova.every((id) => idsAtuais.includes(id));
        if (!iguais(idsAtuais, dto.idsOrdemAtual) || !mesmosIds) {
          throw new ConflictException('Ordem desatualizada ou IDs não pertencentes ao contrato; recarregue as etapas');
        }
        if (iguais(idsAtuais, dto.idsOrdemNova)) return atuais.map((etapa) => resposta(etapa, contrato));
        // Já existe na HU06-01: UNIQUE(contrato_id, sequencia) DEFERRABLE.
        // Todo UPDATE e todo evento de auditoria ocorre nesta mesma transação.
        await manager.query('SET CONSTRAINTS "uq_etapas_contrato_sequencia" DEFERRED');
        const porId = new Map(atuais.map((etapa) => [etapa.id, etapa]));
        const resultado: Etapa[] = [];
        for (const [indice, id] of dto.idsOrdemNova.entries()) {
          const etapa = porId.get(id)!;
          const novaSequencia = indice + 1;
          if (etapa.sequencia !== novaSequencia) {
            const antiga = etapa.sequencia;
            await repo.update({ id, contratoId }, { sequencia: novaSequencia });
            etapa.sequencia = novaSequencia;
            await this.auditoria.registrarNaTransacao(manager, ator, {
              acao: AcaoAuditoria.ETAPA_REORDENADA, entidadeTipo: 'ETAPA', entidadeId: id,
              dadosAnteriores: { sequencia: antiga, nome: etapa.nome }, dadosPosteriores: { sequencia: novaSequencia, nome: etapa.nome },
            });
          }
          resultado.push(etapa);
        }
        return resultado.map((etapa) => resposta(etapa, contrato));
      });
    } catch (error: unknown) { return traduzirErro(error); }
  }
}
