import { FASES_OPERACIONAIS_CONTRATO } from '../contratos/fases-operacionais.js';
import { exigirPermissaoTransacional } from '../autorizacao/permissao-transacional.js';
import { iniciarHierarquiaOperacional } from './inicio-operacional.js';
import { resumirFisicoEntregavel } from './resumo-fisico-entregavel.js';
import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { Contrato } from '../contratos/contrato.entity.js';
import { ModoCalculo } from '../contratos/modo-calculo.enum.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import { ConfiguracaoOcorrencias } from '../ocorrencias/configuracao-ocorrencias.entity.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { PermissaoContrato } from '../autorizacao/permissao-contrato.entity.js';
import { permissoesEfetivas } from '../autorizacao/permissoes-granulares.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { agregarFisico, arredondarFisico } from './motor-progresso.js';
import { aptidaoFisicaParaConclusao } from '../entregaveis/conclusao-fisica.js';
import { dataEfetivaValida } from '../common/data-civil.js';
import type { AtualizarPesosDto } from './pesos.dto.js';
import type { AtualizarPesoIndividualDto } from './peso-individual.dto.js';
import type { AtualizarExecucaoDto } from './execucao.dto.js';
import type { AtualizarModoCalculoDto } from './modo-calculo.dto.js';
const versaoPesos = (c: Contrato, itens: Entregavel[]) => createHash('sha256').update(JSON.stringify([c.modoCalculo, itens.map(e => [e.id, e.peso]).sort((a,b) => String(a[0]).localeCompare(String(b[0])))] )).digest('hex');
function exigirPesoEditavel(etapa: Etapa | undefined, e: Entregavel): void {
  if (!etapa || etapa.arquivadoEm || etapa.conclusaoSolicitadaEm || etapa.encerramentoSolicitadoEm ||
      ['CONCLUIDA','CONCLUIDO_PARCIALMENTE','ENCERRADA','FINALIZADA'].includes(etapa.status) ||
      e.regularizacaoDocumentalSolicitada || ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? ''))
    throw new ConflictException('Reabra a etapa e o entregável ou resolva a decisão pendente antes de alterar o peso.');
}

@Injectable()
export class ExecucaoService {
  constructor(private readonly ds: DataSource, private readonly auditoria: AuditoriaService) {}

  async consultar(contratoId: string) {
    // Snapshot consistente: nenhuma mistura de planejamento e execução de transações diferentes.
    return this.ds.transaction('REPEATABLE READ', m => this.resumo(m, contratoId));
  }
  /** Usa o mesmo motor do painel, sem nova transação (conclusão sob lock). */
  async consultarNaTransacao(m: EntityManager, contratoId: string) {
    return this.resumo(m, contratoId, true);
  }
  private async resumo(m: EntityManager, contratoId: string, verificarIntegral = false) {
    const contrato = await m.findOneBy(Contrato, { id: contratoId });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    const etapas = await m.findBy(Etapa, { contratoId, arquivadoEm: IsNull() });
    const ativos = (await m.findBy(Entregavel, { contratoId, arquivadoEm: IsNull() })).filter(e => etapas.some(et => et.id === e.etapaId));
    const idsAtivos = ativos.map(e => e.id);
    const agenda = idsAtivos.length ? await m.findBy(Ocorrencia, { contratoId, entregavelId: In(idsAtivos), substituidaEm: IsNull() }) : [];
    const configuracoes = idsAtivos.length ? await m.findBy(ConfiguracaoOcorrencias, { contratoId, entregavelId: In(idsAtivos) }) : [];
    const entregaveis = await Promise.all(ativos.map(async e => {
      const ocorrencias = agenda.filter(o => o.entregavelId === e.id);
      const { previsto, realizado, fonte, percentualCalculado, statusEntregavel, atrasado, finalizadoComAtraso } = await resumirFisicoEntregavel(m, e, ocorrencias, configuracoes.find(cfg => cfg.entregavelId === e.id));
      const etapa = etapas.find(et => et.id === e.etapaId);
      return { entregavelId: e.id, nome: e.nome, tipo: e.tipo, statusEntregavel, atrasado, finalizadoComAtraso, regularizacaoDocumentalSolicitada: Boolean(e.regularizacaoDocumentalSolicitada), reabertoEm: e.reabertoEm ?? null, realizado, previsto, fonte,
        percentualExecucao: percentualCalculado == null ? null : arredondarFisico(percentualCalculado), pesoOperacional: e.peso,
        dataEfetivaMarco: e.dataEfetivaMarco ?? null, inicioPrevisto: e.inicioPrevisto, terminoPrevisto: e.terminoPrevisto,
        situacaoAdministrativa: statusEntregavel,
        statusFisico: percentualCalculado == null ? 'NAO_AVALIADO' : percentualCalculado === 100 ? 'CONCLUIDO' : percentualCalculado > 0 ? 'EM_ANDAMENTO' : 'NAO_INICIADO',
        editavel: !contrato.arquivadoEm && !contrato.conclusaoSolicitadaEm && !contrato.encerramentoSolicitado && FASES_OPERACIONAIS_CONTRATO.includes(contrato.status) && Boolean(etapa && !etapa.arquivadoEm && !etapa.conclusaoSolicitadaEm && !etapa.encerramentoSolicitadoEm && !['ENCERRADA','CONCLUIDA','CONCLUIDO_PARCIALMENTE','FINALIZADA'].includes(etapa.status)) && !['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? ''),
        comprovacao: e.situacaoComprovacao ?? 'SEM_EVIDENCIA', percentualBruto: percentualCalculado };
    }));
    const agregado = agregarFisico(entregaveis.map(e => ({ percentual: e.percentualBruto, peso: e.pesoOperacional })));
    // A decisão anterior não garante que seus fatos continuem válidos (ex.: metas
    // de MARCO que perderam o registro de origem). Revalidar no gate transacional.
    const integrais = verificarIntegral ? await Promise.all(entregaveis.map(async (p, i) =>
      p.percentualBruto === 100 && !p.reabertoEm && !p.regularizacaoDocumentalSolicitada &&
      ['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(p.statusEntregavel ?? '') &&
      (await aptidaoFisicaParaConclusao(m, ativos[i])).apto)) : [];
    const integralFisicoEstrito = integrais.length > 0 && integrais.every(Boolean);
    return { contratoId, statusContrato: contrato.status, modoCalculo: contrato.modoCalculo, versaoPesos: versaoPesos(contrato, ativos), ...agregado,
      avanco: contrato.modoCalculo === 'PONDERADO' ? agregado.avancoPonderado : agregado.avancoSimples,
      editavelPesos: !contrato.arquivadoEm && !contrato.conclusaoSolicitadaEm && !contrato.encerramentoSolicitado && FASES_OPERACIONAIS_CONTRATO.includes(contrato.status),
      configuracaoPendente: contrato.modoCalculo === 'PONDERADO' && !agregado.pesosValidos,
      ...(verificarIntegral ? { integralFisicoEstrito,
        integralEstrito: integralFisicoEstrito && entregaveis.every(e => e.statusEntregavel === 'CONCLUIDO') } : {}),
      entregaveis: entregaveis.map(e => {
        const publico = { ...e };
        delete (publico as Partial<typeof e>).percentualBruto;
        return { ...publico, participacaoOperacional: contrato.modoCalculo === 'SIMPLES' ? 100 / ativos.length : e.pesoOperacional != null ? Number(e.pesoOperacional) : 0 };
      }) };
  }
  async atualizarModoCalculo(contratoId: string, dto: AtualizarModoCalculoDto, ator: UsuarioAutenticado) {
    return this.ds.transaction(async m => {
      await exigirPermissaoTransacional(m, contratoId, ator, 'configurarPesos');
      const contrato = await m.findOne(Contrato, { where: { id: contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!contrato || contrato.arquivadoEm || contrato.conclusaoSolicitadaEm || contrato.encerramentoSolicitado || !FASES_OPERACIONAIS_CONTRATO.includes(contrato.status)) {
        throw new ConflictException('O contrato não permite alteração do modo de cálculo.');
      }
      const etapas = await m.findBy(Etapa, { contratoId, arquivadoEm: IsNull() });
      const ativos = (await m.findBy(Entregavel, { contratoId, arquivadoEm: IsNull() }))
        .filter(e => etapas.some(et => et.id === e.etapaId));
      if (versaoPesos(contrato, ativos) !== dto.versao) {
        throw new ConflictException('O modo de cálculo ou os pesos foram alterados. Atualize a página.');
      }
      if (dto.modoCalculo === ModoCalculo.PONDERADO &&
        agregarFisico(ativos.map(e => ({ percentual: 0, peso: e.peso }))).avancoPonderado === null && ativos.length > 0) {
        throw new BadRequestException('Os pesos não podem ultrapassar 100% ou conter valores inválidos.');
      }
      if (contrato.modoCalculo !== dto.modoCalculo) {
        const anterior = contrato.modoCalculo;
        contrato.modoCalculo = dto.modoCalculo;
        await m.save(Contrato, contrato);
        await this.auditoria.registrarNaTransacao(m, ator, {
          acao: AcaoAuditoria.CONTRATO_EDITADO, entidadeTipo: 'CONTRATO', entidadeId: contrato.id,
          dadosAnteriores: { modoCalculo: anterior },
          dadosPosteriores: { modoCalculo: dto.modoCalculo },
        });
      }
      // Retém os pesos ao retornar ao modo simples, sem alterar o fechamento documental.
      return this.resumo(m, contratoId);
    });
  }

  /** Persiste um peso por vez, com concorrência otimista e auditoria.
   *  O modo ponderado admite distribuição parcial, sem normalizar os pesos.
   */
  async atualizarPesoIndividual(contratoId: string, entregavelId: string, dto: AtualizarPesoIndividualDto, ator: UsuarioAutenticado) {
    return this.ds.transaction(async m => {
      await exigirPermissaoTransacional(m, contratoId, ator, 'configurarPesos');
      const contrato = await m.findOne(Contrato, { where: { id: contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!contrato || contrato.arquivadoEm || contrato.conclusaoSolicitadaEm || contrato.encerramentoSolicitado || !FASES_OPERACIONAIS_CONTRATO.includes(contrato.status))
        throw new ConflictException('Contrato indisponível para configurar pesos.');
      if (ator.perfil !== 'ADMINISTRADOR') {
        const vinculo = await m.findOneBy(PermissaoContrato, { contratoId, usuarioId: ator.id });
        if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas).configurarPesos)
          throw new ForbiddenException('Sem permissão para configurar pesos.');
      }
      const etapas = await m.findBy(Etapa, { contratoId, arquivadoEm: IsNull() });
      const idsEtapas = new Set(etapas.map(e => e.id));
      const ativos = (await m.findBy(Entregavel, { contratoId, arquivadoEm: IsNull() })).filter(e => idsEtapas.has(e.etapaId));
      const alvo = ativos.find(e => e.id === entregavelId);
      if (!alvo) throw new NotFoundException('Entregável ativo não encontrado.');
      if (versaoPesos(contrato, ativos) !== dto.versao)
        throw new ConflictException('Os pesos foram alterados por outra operação. Atualize os dados.');
      if (!/^(?:100(?:\.0{1,4})?|\d{1,2}(?:\.\d{1,4})?)$/.test(dto.peso))
        throw new BadRequestException('Peso deve estar entre 0% e 100%, com até quatro casas decimais.');
      const anteriores = alvo.peso;
      const distribuicao = agregarFisico(ativos.map(e => ({ percentual: 0, peso: e.id === entregavelId ? dto.peso : e.peso })));
      if (contrato.modoCalculo === ModoCalculo.PONDERADO && distribuicao.avancoPonderado === null)
        throw new BadRequestException('A soma dos pesos não pode ultrapassar 100%.');
      if (anteriores == null || Number(anteriores) !== Number(dto.peso)) {
        exigirPesoEditavel(etapas.find(et => et.id === alvo.etapaId), alvo);
        alvo.peso = dto.peso;
        await m.save(Entregavel, alvo);
        await this.auditoria.registrarNaTransacao(m, ator, {
          acao: AcaoAuditoria.ENTREGAVEL_PESO_ALTERADO, entidadeTipo: 'ENTREGAVEL', entidadeId: alvo.id,
          dadosAnteriores: { peso: anteriores }, dadosPosteriores: { peso: dto.peso },
        });
      }
      return this.resumo(m, contratoId);
    });
  }

  async atualizarPesos(contratoId: string, dto: AtualizarPesosDto, ator: UsuarioAutenticado) {
    return this.ds.transaction(async m => {
      await exigirPermissaoTransacional(m, contratoId, ator, 'configurarPesos');
      const c = await m.findOne(Contrato, { where: { id: contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!c || c.arquivadoEm || c.conclusaoSolicitadaEm || c.encerramentoSolicitado || !FASES_OPERACIONAIS_CONTRATO.includes(c.status)) throw new ConflictException('Contrato bloqueado');
      if (ator.perfil !== 'ADMINISTRADOR') {
        const v = await m.findOneBy(PermissaoContrato, { contratoId, usuarioId: ator.id });
        const p = permissoesEfetivas(ator.perfil, Boolean(v?.podeEditar), v?.permissoesDetalhadas);
        if (!v || !p.configurarPesos) throw new ForbiddenException('Sem permissão para ativar pesos');
      }
      const etapas = await m.findBy(Etapa, { contratoId, arquivadoEm: IsNull() });
      const ativos = (await m.findBy(Entregavel, { contratoId, arquivadoEm: IsNull() })).filter(e => etapas.some(et=>et.id===e.etapaId));
      if (versaoPesos(c, ativos) !== dto.versao) throw new ConflictException('Pesos ou planejamento foram alterados. Atualize antes de salvar.');
      const pesos = new Map(dto.pesos.map(p=>[p.entregavelId,p.peso]));
      if (pesos.size !== dto.pesos.length || pesos.size !== ativos.length || ativos.some(e=>!pesos.has(e.id))) throw new BadRequestException('Informe o peso de cada entregável ativo do contrato');
      if (agregarFisico(ativos.map(e=>({ percentual:0,peso:pesos.get(e.id)! }))).avancoPonderado === null) throw new BadRequestException('A soma dos pesos não pode ultrapassar 100%.');
      for (const e of ativos) {
        const anterior = e.peso; const novo = pesos.get(e.id)!;
        if (anterior != null && Number(anterior) === Number(novo)) continue;
        exigirPesoEditavel(etapas.find(et => et.id === e.etapaId), e);
        e.peso=novo; await m.save(Entregavel,e);
        await this.auditoria.registrarNaTransacao(m,ator,{ acao:AcaoAuditoria.ENTREGAVEL_PESO_ALTERADO, entidadeTipo:'ENTREGAVEL', entidadeId:e.id, dadosAnteriores:{ peso:anterior }, dadosPosteriores:{ peso:novo } });
      }
      const anterior = c.modoCalculo;
      c.modoCalculo = 'PONDERADO' as Contrato['modoCalculo']; await m.save(Contrato,c);
      await this.auditoria.registrarNaTransacao(m,ator,{ acao:AcaoAuditoria.CONTRATO_EDITADO, entidadeTipo:'CONTRATO', entidadeId:c.id, dadosAnteriores:{ modoCalculo:anterior }, dadosPosteriores:{ modoCalculo:c.modoCalculo, somaPesos:agregarFisico(ativos.map(e=>({percentual:0,peso:e.peso}))).somaPesos } });
      return this.resumo(m,contratoId);
    });
  }
  /** Conciliação auditada: torna a agenda quantitativa a única fonte operacional de avanço.
   * Preserva a quantidade anterior no evento de auditoria e rejeita concorrência/itens bloqueados.
   */
  async usarOcorrencias(contratoId: string, id: string, ator: UsuarioAutenticado) {
    return this.ds.transaction(async m => {
      const contrato = await m.findOne(Contrato, { where: { id: contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!contrato || contrato.arquivadoEm || contrato.conclusaoSolicitadaEm || contrato.encerramentoSolicitado || !FASES_OPERACIONAIS_CONTRATO.includes(contrato.status))
        throw new ConflictException('Contrato indisponível para conciliação de execução');
      if (ator.perfil !== 'ADMINISTRADOR') {
        const vinculo = await m.findOneBy(PermissaoContrato, { contratoId, usuarioId: ator.id });
        if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas).editarExecucaoFisica)
          throw new ForbiddenException('Sem permissão para conciliar a execução');
      }
      const entregavel = await m.findOne(Entregavel, { where: { id, contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!entregavel || entregavel.arquivadoEm || entregavel.tipo !== 'QUANTITATIVO')
        throw new NotFoundException('Entregável quantitativo não encontrado');
      const etapa = await m.findOneBy(Etapa, { id: entregavel.etapaId, contratoId });
      if (!etapa || etapa.arquivadoEm || etapa.conclusaoSolicitadaEm || etapa.encerramentoSolicitadoEm || ['CONCLUIDA', 'CONCLUIDO_PARCIALMENTE', 'ENCERRADA', 'FINALIZADA'].includes(etapa.status) || ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(entregavel.statusExecucao ?? ''))
        throw new ConflictException('Reabra a etapa e o entregável antes da conciliação');
      const registros = await m.countBy(Ocorrencia, { contratoId, entregavelId: id, substituidaEm: IsNull() });
      if (registros > 0) throw new ConflictException('Já existem ocorrências. Não é seguro alterar a fonte de execução automaticamente');
      const valorAnterior = entregavel.quantidadeRealizada;
      if (valorAnterior === null || Number(valorAnterior) === 0)
        throw new ConflictException('Não há quantidade declarada diretamente para conciliar');
      entregavel.quantidadeRealizada = null;
      await m.save(Entregavel, entregavel);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.ENTREGAVEL_EXECUCAO_ATUALIZADA, entidadeTipo: 'ENTREGAVEL', entidadeId: entregavel.id,
        dadosAnteriores: { quantidadeRealizada: valorAnterior, fonte: 'DECLARADO' },
        dadosPosteriores: { quantidadeRealizada: null, fonte: 'OCORRENCIAS', motivo: 'conciliação explícita' },
      });
      return this.resumo(m, contratoId);
    });
  }

  async atualizar(contratoId: string, id: string, dto: AtualizarExecucaoDto, ator: UsuarioAutenticado) {
    return this.ds.transaction(async m => {
      const contrato = await m.findOne(Contrato, { where: { id: contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!contrato || contrato.arquivadoEm || contrato.conclusaoSolicitadaEm || contrato.encerramentoSolicitado || !FASES_OPERACIONAIS_CONTRATO.includes(contrato.status)) throw new ConflictException('Contrato indisponível para execução');
      if (ator.perfil !== 'ADMINISTRADOR') {
        const v = await m.findOneBy(PermissaoContrato, { contratoId, usuarioId: ator.id });
        if (!v || !permissoesEfetivas(ator.perfil, v.podeEditar, v.permissoesDetalhadas).editarExecucaoFisica) throw new ForbiddenException('Sem permissão de execução');
      }
      const e = await m.findOne(Entregavel, { where: { id, contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!e || e.arquivadoEm) throw new NotFoundException('Entregável indisponível');
      const etapa = await m.findOneBy(Etapa, { id: e.etapaId, contratoId });
      if (!etapa || etapa.arquivadoEm || etapa.conclusaoSolicitadaEm || etapa.encerramentoSolicitadoEm || ['ENCERRADA','CONCLUIDA','CONCLUIDO_PARCIALMENTE','FINALIZADA'].includes(etapa.status) || ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? '')) throw new ConflictException('Etapa indisponível para execução');
      const antes = { percentualExecucao: e.percentualExecucao, quantidadeRealizada: e.quantidadeRealizada, dataEfetivaMarco: e.dataEfetivaMarco };
      if (Object.values(dto).filter(v => v !== undefined).length !== 1) throw new BadRequestException('Informe somente o campo físico do tipo de entregável');
      if (e.execucoesIntegradas && dto.percentualManual !== undefined) throw new ConflictException('Utilize os lançamentos da aba Geral para alterar a execução integrada.');
      if ((e.tipo === 'UNICO' || e.tipo === 'CONTINUO') && typeof dto.percentualManual === 'number' && Number.isFinite(dto.percentualManual) && dto.percentualManual >= 0 && dto.percentualManual <= 100) e.percentualExecucao = dto.percentualManual.toFixed(2);
      else if (e.tipo === 'QUANTITATIVO' && dto.quantidadeRealizada !== undefined) {
        if(e.quantidadeDiretaIntegrada)throw new ConflictException('Utilize as atividades ou evidências de execução direta, preservando a rastreabilidade.');
        const quantidade = dto.quantidadeRealizada;
        if (typeof quantidade !== 'string' || !/^\d{1,15}(?:\.\d{1,3})?$/.test(quantidade))
          throw new BadRequestException('Informe uma quantidade não negativa com até três casas decimais.');
        const ocorrencias = await m.countBy(Ocorrencia, { contratoId, entregavelId: e.id, substituidaEm: IsNull() });
        if (ocorrencias > 0)
          throw new ConflictException('Este entregável já é medido por ocorrências. Registre nelas a execução para não contar duas vezes.');
        e.quantidadeRealizada = quantidade;
      } else if (e.tipo === 'MARCO' && typeof dto.dataEfetivaMarco === 'string' && dataEfetivaValida(dto.dataEfetivaMarco)) e.dataEfetivaMarco = dto.dataEfetivaMarco;
      else throw new BadRequestException('Campo de execução incompatível ou inválido');
      await m.save(Entregavel, e);
      await this.auditoria.registrarNaTransacao(m, ator, { acao: AcaoAuditoria.ENTREGAVEL_EXECUCAO_ATUALIZADA, entidadeTipo: 'ENTREGAVEL', entidadeId: e.id, dadosAnteriores: antes,
        dadosPosteriores: { percentualExecucao: e.percentualExecucao, quantidadeRealizada: e.quantidadeRealizada, dataEfetivaMarco: e.dataEfetivaMarco } });
      if(Number(e.percentualExecucao??0)>0||Number(e.quantidadeRealizada??0)>0||e.dataEfetivaMarco)await iniciarHierarquiaOperacional(m,this.auditoria,ator,contratoId,id);
      // Não alterar situacaoComprovacao nem concluir automaticamente.
      return this.resumo(m, contratoId);
    });
  }
}
