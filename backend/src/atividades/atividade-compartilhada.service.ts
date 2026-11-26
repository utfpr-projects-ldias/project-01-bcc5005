import { FASES_OPERACIONAIS_CONTRATO } from '../contratos/fases-operacionais.js';
import { exigirPermissaoTransacional } from '../autorizacao/permissao-transacional.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, IsNull, type EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { PoliticaAcessoService } from '../autorizacao/politica-acesso.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { uuidValido } from '../autorizacao/politicas-operacionais.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AtividadeEntity } from './atividade.entity.js';
import { AtividadeCompartilhada } from './atividade-compartilhada.entity.js';
import { AtividadesService } from './atividades.service.js';
import { contarAprovacoes } from './resumo-compartilhado.js';
import type { CreateAtividadeDto } from './dto/create-atividade.dto.js';
import { AprovarCompartilhadaDto, CriarAtividadeCompartilhadaDto, AdicionarContratosAtividadeDto, EditarMetadadosCompartilhadosDto } from './dto/atividade-compartilhada.dto.js';

const politica = (acao: 'atividades:registrar' | 'atividades:compartilhar' | 'atividades:visualizar' | 'atividades:verificar' | 'atividades:editar') => ({
  acao,
  escopoOperacional: acao === 'atividades:registrar' || acao === 'atividades:compartilhar'
    ? { tipo: 'contrato' as const, parametro: 'contratoId' }
    : { tipo: 'recurso' as const, recurso: 'atividade' as const, parametro: 'id' },
});

@Injectable()
export class AtividadeCompartilhadaService {
  constructor(private readonly database: DataSource,
    private readonly acesso: PoliticaAcessoService,
    private readonly auditoria: AuditoriaService,
    private readonly atividades: AtividadesService) {}

  private async pode(ator: UsuarioAutenticado, acao: 'atividades:registrar' | 'atividades:compartilhar' | 'atividades:visualizar' | 'atividades:verificar' | 'atividades:editar', contratoId: string, manager?: EntityManager) {
    return manager ? this.acesso.permitidoNaTransacao(manager,ator,politica(acao),contratoId) : this.acesso.permitido(ator, politica(acao), contratoId);
  }

  /** Cadastro completo ou rollback completo: nunca salva parte dos contratos. */
  async criar(dto: CriarAtividadeCompartilhadaDto, ator: UsuarioAutenticado) {
    if (new Set(dto.vinculos.map(v => v.contratoId)).size !== dto.vinculos.length)
      throw new BadRequestException('Selecione cada contrato uma única vez');
    const vinculos = [...dto.vinculos].sort((a,b) => a.contratoId.localeCompare(b.contratoId));
    return this.database.transaction(async manager => {
      // Autorização em TODOS os contratos antes de criar qualquer atividade.
      for (const vinculo of vinculos) {
        if (!await this.pode(ator, 'atividades:registrar', vinculo.contratoId, manager) ||
            !await this.pode(ator, 'atividades:compartilhar', vinculo.contratoId, manager))
          throw new ForbiddenException('Sem autorização para registrar e compartilhar atividades em todos os contratos selecionados');
      }
      const grupoId = randomUUID();
      await manager.save(AtividadeCompartilhada, manager.create(AtividadeCompartilhada,
        { id: grupoId, criadoPor: ator.id }));
      const criadas: { contratoId: string; atividadeId: string }[] = [];
      for (const vinculo of vinculos) {
        const dados: CreateAtividadeDto = {
          contratoId: vinculo.contratoId, titulo: dto.titulo, dataHora: dto.dataHora,
          descricao: dto.descricao, tipo: dto.tipo, responsavel: dto.responsavel, responsavelId:dto.responsavelId, participantes:dto.participantes,
          observacoes: dto.observacoes, local: dto.local, duracao: dto.duracao,
          entregavelIds: vinculo.entregavelIds, ocorrenciaIds: vinculo.ocorrenciaIds ?? [],
          medicoes: vinculo.medicoes ?? [], medicoesDiretas:vinculo.medicoesDiretas ?? [], parcelasPercentuais:vinculo.parcelasPercentuais, percentualExecucao:vinculo.percentualExecucao, entregavelExecucaoId:vinculo.entregavelExecucaoId, ocorrenciaExecucaoId:vinculo.ocorrenciaExecucaoId,
        };
        const criado = await this.atividades.criarNaTransacao(manager, vinculo.contratoId, dados, ator, grupoId);
        await this.auditoria.registrarNaTransacao(manager, ator, criado.evento);
        criadas.push({ contratoId: vinculo.contratoId, atividadeId: criado.resultado.id });
      }
      return { id: grupoId, total: criadas.length, atividades: criadas };
    });
  }

  /** Novos destinos são registros locais novos. Nenhuma execução ou aprovação da origem é copiada. */
  async adicionarContratos(id:string,dto:AdicionarContratosAtividadeDto,ator:UsuarioAutenticado){
    if(!uuidValido(id))throw new NotFoundException('Atividade compartilhada não encontrada');
    const vinculos=[...dto.vinculos].sort((a,b)=>a.contratoId.localeCompare(b.contratoId));
    if(new Set(vinculos.map(v=>v.contratoId.toLowerCase())).size!==vinculos.length)throw new BadRequestException('Selecione contratos distintos.');
    return this.database.transaction(async m=>{
      const grupo=await m.findOne(AtividadeCompartilhada,{where:{id},lock:{mode:'pessimistic_write'}});
      if(!grupo||!await this.pode(ator,'atividades:editar',dto.origemContratoId,m))throw new NotFoundException('Atividade compartilhada não encontrada');
      // O índice de unicidade também cobre membros excluídos logicamente.
      const registros=await m.find(AtividadeEntity,{where:{atividadeCompartilhadaId:id}});
      const origem=registros.find(a=>a.contratoId===dto.origemContratoId&&!a.excluidaEm);
      if(!origem)throw new NotFoundException('Origem da atividade não encontrada.');
      if(!await this.pode(ator,'atividades:compartilhar',dto.origemContratoId,m))throw new ForbiddenException('Sem autorização para compartilhar na origem.');
      for(const v of vinculos)if(!await this.pode(ator,'atividades:registrar',v.contratoId,m)||!await this.pode(ator,'atividades:compartilhar',v.contratoId,m))throw new ForbiddenException('Sem autorização para registrar e compartilhar em todos os novos destinos.');
      if(registros.filter(a=>!a.excluidaEm).length+vinculos.length>20||vinculos.some(v=>registros.some(a=>a.contratoId===v.contratoId)))throw new ConflictException('Um dos destinos já está vinculado ou o limite do grupo foi atingido.');
      for(const cid of [...new Set([dto.origemContratoId,...vinculos.map(v=>v.contratoId)])].sort()){
        const c=await m.findOne(Contrato,{where:{id:cid},lock:{mode:'pessimistic_write'}});
        if(!c||c.arquivadoEm||c.conclusaoSolicitadaEm||!FASES_OPERACIONAIS_CONTRATO.includes(c.status))throw new ConflictException('Os contratos precisam estar abertos.');
      }
      const atual=await m.findOne(AtividadeEntity,{where:{id:origem.id,contratoId:dto.origemContratoId},lock:{mode:'pessimistic_write'}});
      if(!atual||atual.excluidaEm||atual.status!=='REGISTRADA'||atual.atividadeCompartilhadaId!==id)throw new ConflictException('Reabra a origem antes de incluir destinos.');
      const criadas=[];
      for(const v of vinculos){
        const dados:CreateAtividadeDto={...v,titulo:atual.titulo,descricao:atual.descricao,tipo:atual.tipo,dataHora:atual.dataHora.toISOString(),
          responsavelId:dto.responsavelId,participantes:atual.participantes??[],local:atual.local??undefined,duracao:atual.duracao??undefined,observacoes:atual.observacoes??undefined};
        const criado=await this.atividades.criarNaTransacao(m,v.contratoId,dados,ator,id);
        await this.auditoria.registrarNaTransacao(m,ator,criado.evento);
        criadas.push({contratoId:v.contratoId,atividadeId:criado.resultado.id});
      }
      await this.auditoria.registrarNaTransacao(m,ator,{acao:AcaoAuditoria.ATIVIDADE_VINCULOS_ALTERADOS,entidadeTipo:'ATIVIDADE',entidadeId:atual.id,dadosAnteriores:{atividadeCompartilhadaId:id},dadosPosteriores:{atividadeCompartilhadaId:id,operacao:'AMPLIACAO_VINCULOS'}});
      return {id,atividades:criadas};
    });
  }

  async editarMetadados(id:string,dto:EditarMetadadosCompartilhadosDto,ator:UsuarioAutenticado){
    if(!uuidValido(id))throw new NotFoundException('Atividade compartilhada não encontrada');
    const {contratoIds}=dto;
    const dados={titulo:dto.titulo,descricao:dto.descricao,tipo:dto.tipo,participantes:dto.participantes,local:dto.local,duracao:dto.duracao,observacoes:dto.observacoes};
    if(!contratoIds.length||new Set(contratoIds).size!==contratoIds.length||!Object.keys(dados).some(k=>(dados as Record<string,unknown>)[k]!==undefined))throw new BadRequestException('Selecione os destinos e os metadados.');
    return this.database.transaction(async m=>{
      const grupo=await m.findOne(AtividadeCompartilhada,{where:{id},lock:{mode:'pessimistic_write'}});
      if(!grupo)throw new NotFoundException('Atividade compartilhada não encontrada');
      const registros=await m.find(AtividadeEntity,{where:{atividadeCompartilhadaId:id,excluidaEm:IsNull()}});
      const selecionados=[];
      for(const cid of [...contratoIds].sort()){
        if(!await this.pode(ator,'atividades:editar',cid,m))throw new ForbiddenException('Sem autorização para alterar todos os destinos selecionados.');
        const a=registros.find(r=>r.contratoId===cid);
        if(!a)throw new NotFoundException('Destino não encontrado.');
        selecionados.push(a);
      }
      for(const a of selecionados){
        const op=await this.atividades.editarNaTransacao(m,a.contratoId,a.id,dados,ator);
        await this.auditoria.registrarNaTransacao(m,ator,op.evento);
      }
      return {id,total:selecionados.length};
    });
  }

  /** Identidades, detalhes e contadores abrangem apenas contratos visíveis. */
  async resumo(id: string, ator: UsuarioAutenticado) {
    if (!uuidValido(id)) throw new NotFoundException('Atividade compartilhada não encontrada');
    const repo = this.database.getRepository(AtividadeEntity);
    const registros = await repo.find({ where: { atividadeCompartilhadaId: id, excluidaEm: IsNull() },
      order: { contratoId: 'ASC' } });
    if (!registros.length) throw new NotFoundException('Atividade compartilhada não encontrada');
    const visiveis: typeof registros = [];
    for (const registro of registros) if (await this.pode(ator, 'atividades:visualizar', registro.contratoId))
      visiveis.push(registro);
    if (!visiveis.length) throw new NotFoundException('Atividade compartilhada não encontrada');
    const linhas = [];
    for (const registro of visiveis) linhas.push({
      contratoId: registro.contratoId, atividadeId: registro.id, status: registro.status,
      podeSolicitar: registro.status === 'REGISTRADA' &&
        await this.pode(ator, 'atividades:editar', registro.contratoId),
      podeAprovar: registro.status === 'PENDENTE_CONCLUSAO' &&
        await this.pode(ator, 'atividades:verificar', registro.contratoId),
    });
    // Agrega exclusivamente os membros que passaram pela autorização de leitura acima.
    const [vinculos] = await this.database.manager.query(`WITH membros AS (
      SELECT id,"contratoId","ocorrenciaId" FROM atividades WHERE id=ANY($1::uuid[]) AND "excluidaEm" IS NULL
    ) SELECT
      (SELECT count(DISTINCT (m."contratoId",ae."entregavelId"))::int FROM membros m JOIN atividade_entregaveis ae ON ae."atividadeId"=m.id) AS entregaveis,
      (SELECT count(*)::int FROM (SELECT m."contratoId",ao."ocorrenciaId" FROM membros m JOIN atividade_ocorrencias ao ON ao."atividadeId"=m.id AND ao."contratoId"=m."contratoId" UNION SELECT "contratoId","ocorrenciaId" FROM membros WHERE "ocorrenciaId" IS NOT NULL) o) AS ocorrencias,
      (SELECT count(DISTINCT (ac.contrato_id,ac.comprovante_id))::int FROM membros m JOIN atividade_comprovantes ac ON ac.atividade_id=m.id AND ac.contrato_id=m."contratoId"
        JOIN comprovantes_evidencia c ON c.id=ac.comprovante_id AND c.contrato_id=ac.contrato_id JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id
        WHERE ev.arquivado_em IS NULL AND EXISTS(SELECT 1 FROM atividade_entregaveis ae WHERE ae."atividadeId"=m.id AND ae."entregavelId"=c.entregavel_id)
        AND NOT EXISTS(SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id))) AS evidencias`,[visiveis.map(r=>r.id)]) as {entregaveis:number;ocorrencias:number;evidencias:number}[];
    return { id, ...contarAprovacoes(visiveis.map(r => r.status)), atividades: linhas, vinculos };
  }

  /** Retira apenas a associação ao grupo. O diário local, as medições e os comprovantes permanecem intactos. */
  async desvincularContrato(id:string,contratoId:string,ator:UsuarioAutenticado) {
    if(!uuidValido(id)||!uuidValido(contratoId))throw new NotFoundException('Vínculo não encontrado');
    if(!await this.pode(ator,'atividades:visualizar',contratoId)||!await this.pode(ator,'atividades:editar',contratoId))throw new ForbiddenException('Sem autorização para alterar vínculos neste contrato');
    return this.database.transaction(async manager=>{
      const grupo=await manager.findOne(AtividadeCompartilhada,{where:{id},lock:{mode:'pessimistic_write'}});
      if(!grupo)throw new NotFoundException('Vínculo não encontrado');
      if (!await this.pode(ator,'atividades:editar',contratoId,manager)) throw new ForbiddenException('Sem autorização para alterar vínculos neste contrato');
      await exigirPermissaoTransacional(manager,contratoId,ator,'editarAtividades');
      const contrato=await manager.findOne(Contrato,{where:{id:contratoId},lock:{mode:'pessimistic_write'}});
      if(!contrato||contrato.arquivadoEm||contrato.conclusaoSolicitadaEm||!FASES_OPERACIONAIS_CONTRATO.includes(contrato.status))throw new ConflictException('Reabra o contrato antes de desvincular');
      const registros=await manager.find(AtividadeEntity,{where:{atividadeCompartilhadaId:id,excluidaEm:IsNull()}});
      const alvo=registros.find(r=>r.contratoId===contratoId);
      if(!alvo)throw new NotFoundException('Vínculo não encontrado');
      if(registros.length<2)throw new ConflictException('A atividade não possui outro contrato compartilhado');
      const registro=await manager.findOne(AtividadeEntity,{where:{id:alvo.id,contratoId},lock:{mode:'pessimistic_write'}});
      if(!registro||registro.excluidaEm||registro.atividadeCompartilhadaId!==id||registro.status!=='REGISTRADA')throw new ConflictException('Reabra a atividade antes de desvincular o contrato');
      registro.atividadeCompartilhadaId=null;
      await manager.save(AtividadeEntity,registro);
      await this.auditoria.registrarNaTransacao(manager,ator,{acao:AcaoAuditoria.ATIVIDADE_VINCULOS_ALTERADOS,entidadeTipo:'ATIVIDADE',entidadeId:registro.id,dadosAnteriores:{atividadeCompartilhadaId:id,contratoId},dadosPosteriores:{atividadeCompartilhadaId:null,contratoId,operacao:'DESVINCULAR_CONTRATO'}});
      return {vinculado:false};
    });
  }

  /** Solicitação compartilhada autorizada por um dos vínculos visíveis. */
  async solicitar(id: string, dto: AprovarCompartilhadaDto, ator: UsuarioAutenticado) {
    if (!uuidValido(id)) throw new NotFoundException('Atividade compartilhada não encontrada');
    return this.database.transaction(async manager => {
      const grupo = await manager.findOne(AtividadeCompartilhada,
        { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!grupo) throw new NotFoundException('Atividade compartilhada não encontrada');
      const registros = await manager.find(AtividadeEntity, {
        where: { atividadeCompartilhadaId: id, excluidaEm: IsNull() }, order: { contratoId: 'ASC' },
      });
      if (!registros.length) throw new NotFoundException('Atividade compartilhada não encontrada');
      // Nunca informar se um grupo existe a alguém sem acesso a nenhum membro.
      const contratosVisiveis = await Promise.all(registros.map(r =>
        this.pode(ator, 'atividades:visualizar', r.contratoId, manager)));
      if (!contratosVisiveis.some(Boolean)) throw new NotFoundException('Atividade compartilhada não encontrada');
      const visiveis = new Set(registros.filter((_r, i) => contratosVisiveis[i]).map(r => r.contratoId));
      const selecionados = dto.contratoIds ? new Set(dto.contratoIds) : null;
      if (selecionados && [...selecionados].some(cid => !visiveis.has(cid)))
        throw new NotFoundException('Vínculo não encontrado');
      const autorizados: AtividadeEntity[] = [];
      for (const r of registros) {
        if (selecionados && !selecionados.has(r.contratoId)) continue;
        if (!visiveis.has(r.contratoId) || !await this.pode(ator,'atividades:editar',r.contratoId,manager)) {
          if(selecionados)throw new ForbiddenException('Sem permissão de solicitar no contrato escolhido.');
          continue;
        }
        autorizados.push(r);
      }
      if(!autorizados.length)throw new ForbiddenException('Sem permissão para solicitar a conclusão.');
      const origem=autorizados.find(r=>r.status==='REGISTRADA');
      const antesVisiveis=registros.filter(r=>visiveis.has(r.contratoId)&&r.status==='PENDENTE_CONCLUSAO').length;
      if(origem)await this.atividades.solicitarNaTransacao(manager,origem.contratoId,origem.id,ator);
      else if(!autorizados.some(r=>r.status==='PENDENTE_CONCLUSAO'||r.status==='VERIFICADA'))throw new ConflictException('A atividade não admite solicitação.');
      const atualizados = await manager.find(AtividadeEntity, {
        where: { atividadeCompartilhadaId: id, excluidaEm: IsNull() },
      });
      const estados=atualizados.filter(r=>visiveis.has(r.contratoId)).map(r=>r.status);
      return {id,novasSolicitacoes:estados.filter(s=>s==='PENDENTE_CONCLUSAO').length-antesVisiveis,...contarAprovacoes(estados)};
    });
  }

  /** Uma decisão compartilhada, autorizada por um vínculo visível e com permissão de verificar. */
  async aprovar(id: string, dto: AprovarCompartilhadaDto, ator: UsuarioAutenticado) {
    if (!uuidValido(id)) throw new NotFoundException('Atividade compartilhada não encontrada');
    return this.database.transaction(async manager => {
      const grupo = await manager.findOne(AtividadeCompartilhada,
        { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!grupo) throw new NotFoundException('Atividade compartilhada não encontrada');
      const registros = await manager.find(AtividadeEntity, {
        where: { atividadeCompartilhadaId: id, excluidaEm: IsNull() }, order: { contratoId: 'ASC' },
      });
      if (!registros.length) throw new NotFoundException('Atividade compartilhada não encontrada');
      // Nunca informar se um grupo existe a alguém sem acesso a nenhum membro.
      const contratosVisiveis = await Promise.all(registros.map(r =>
        this.pode(ator, 'atividades:visualizar', r.contratoId, manager)));
      if (!contratosVisiveis.some(Boolean)) throw new NotFoundException('Atividade compartilhada não encontrada');
      const visiveis = new Set(registros.filter((_r, i) => contratosVisiveis[i]).map(r => r.contratoId));
      const selecionados = dto.contratoIds ? new Set(dto.contratoIds) : null;
      if (selecionados && [...selecionados].some(cid => !visiveis.has(cid)))
        throw new NotFoundException('Vínculo não encontrado');
      const autorizados: AtividadeEntity[] = [];
      for (const r of registros) {
        if (selecionados && !selecionados.has(r.contratoId)) continue;
        if (!visiveis.has(r.contratoId) || !await this.pode(ator,'atividades:verificar',r.contratoId,manager)) {
          if(selecionados)throw new ForbiddenException('Sem permissão de verificar no contrato escolhido.');
          continue;
        }
        autorizados.push(r);
      }
      if(!autorizados.length)throw new ForbiddenException('Sem permissão para aprovar esta atividade.');
      const origem=autorizados.find(r=>r.status==='PENDENTE_CONCLUSAO');
      const antesVisiveis=registros.filter(r=>visiveis.has(r.contratoId)&&r.status==='VERIFICADA').length;
      if(origem)await this.atividades.verificarNaTransacao(manager,origem.contratoId,origem.id,ator);
      else if(!autorizados.some(r=>r.status==='VERIFICADA'))throw new ConflictException('A atividade não está pendente de conclusão.');
      const atualizados = await manager.find(AtividadeEntity, {
        where: { atividadeCompartilhadaId: id, excluidaEm: IsNull() },
      });
      const estados=atualizados.filter(r=>visiveis.has(r.contratoId)).map(r=>r.status);
      return {id,novasAprovacoes:estados.filter(s=>s==='VERIFICADA').length-antesVisiveis,...contarAprovacoes(estados)};
    });
  }
}
