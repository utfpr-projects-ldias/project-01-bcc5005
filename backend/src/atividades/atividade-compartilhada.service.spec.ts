import { jest } from '@jest/globals';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import type { DataSource } from 'typeorm';
import type { PoliticaAcessoService } from '../autorizacao/politica-acesso.service.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { AtividadesService } from './atividades.service.js';
import { AtividadeCompartilhadaService } from './atividade-compartilhada.service.js';
import { AtividadeCompartilhada, } from './atividade-compartilhada.entity.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const grupoId = id(900);
const usuario = {id:id(100), supertokensUserId:'st-user', nome:'Teste', email:'teste@example.com', perfil:PerfilUsuario.GESTOR} as const;

describe('serviço de atividade compartilhada', () => {
  const construir = (permitidos: Set<string>, estados: string[], visiveis?: Set<string>, compartilhamento=permitidos) => {
    const registros = estados.map((status, index) => ({ id:id(index+1), contratoId:id(index+101),
      atividadeCompartilhadaId:grupoId, status, excluidaEm:null }));
    const manager = {
      findOne: jest.fn(async (alvo: unknown) => alvo === AtividadeCompartilhada ? {id:grupoId} : null),
      find: jest.fn(async () => registros),
      create: jest.fn((_entidade:unknown, dados:unknown) => dados),
      save: jest.fn(async (_entidade:unknown, dados:unknown) => dados),
    };
    const database = {transaction:jest.fn(async (f:(m:typeof manager)=>Promise<unknown>) => f(manager)),
      getRepository:jest.fn(() => ({find:jest.fn(async()=>registros)}))};
    const permitido = jest.fn(async (_ator:unknown, politica:{acao:string}, contratoId:string) =>
      politica.acao === 'atividades:visualizar' ? (visiveis?.has(contratoId) ?? true) : politica.acao === 'atividades:compartilhar' ? compartilhamento.has(contratoId) : permitidos.has(contratoId));
    const acesso = {permitido, permitidoNaTransacao: (_m:unknown, a:unknown, p:{acao:string}, cid:string) => permitido(a,p,cid)};
    const atividades = { verificarNaTransacao:jest.fn(async (_m:unknown,cid:string) => {
      if(registros.some(x=>x.contratoId===cid)) for(const r of registros) if(['REGISTRADA','PENDENTE_CONCLUSAO'].includes(r.status)) r.status='VERIFICADA';
    }), solicitarNaTransacao:jest.fn(async (_m:unknown,cid:string) => {
      if(registros.some(x=>x.contratoId===cid)) for(const r of registros) if(r.status==='REGISTRADA') r.status='PENDENTE_CONCLUSAO';
    }), criarNaTransacao:jest.fn(async (_m:unknown,cid:string,_dados?:unknown) => ({resultado:{id:cid},
      evento:{acao:'ATIVIDADE_CRIADA',entidadeTipo:'ATIVIDADE',entidadeId:cid}})) };
    const auditoria={registrarNaTransacao:jest.fn(async()=>undefined)};
    const service = new AtividadeCompartilhadaService(database as unknown as DataSource,
      acesso as unknown as PoliticaAcessoService,auditoria as unknown as AuditoriaService,
      atividades as unknown as AtividadesService);
    return {service,registros,atividades,database,auditoria};
  };

  it('uma autorização basta para aprovar o grupo e repetir a decisão é idempotente', async () => {
    const autorizados=new Set([id(101),id(102)]);
    const {service,atividades}=construir(autorizados,Array(6).fill('PENDENTE_CONCLUSAO'));
    expect(await service.aprovar(grupoId,{},usuario)).toMatchObject({total:6,aprovadas:6,novasAprovacoes:6});
    expect(await service.aprovar(grupoId,{},usuario)).toMatchObject({total:6,aprovadas:6,novasAprovacoes:0});
    expect(atividades.verificarNaTransacao).toHaveBeenCalledTimes(1);
  });

  it('não expõe contagem nem IDs de contratos invisíveis', async () => {
    const {service,atividades} = construir(new Set([id(101)]), ['PENDENTE_CONCLUSAO','VERIFICADA'], new Set([id(101)]));
    await expect(service.aprovar(grupoId,{contratoIds:[id(102)]},usuario)).rejects.toBeInstanceOf(NotFoundException);
    expect(atividades.verificarNaTransacao).not.toHaveBeenCalled();
    expect(await service.aprovar(grupoId,{},usuario)).toMatchObject({total:1,aprovadas:1,novasAprovacoes:1});
  });

  it('recusa seleção explícita de contrato sem permissão e não grava decisão', async () => {
    const {service,atividades}=construir(new Set([id(101)]),Array(6).fill('PENDENTE_CONCLUSAO'));
    await expect(service.aprovar(grupoId,{contratoIds:[id(101),id(103)]},usuario)).rejects.toBeInstanceOf(ForbiddenException);
    expect(atividades.verificarNaTransacao).not.toHaveBeenCalled();
  });

  it('solicita o grupo a partir de um contrato autorizado', async () => {
    const {service,atividades}=construir(new Set([id(101),id(102)]),Array(6).fill('REGISTRADA'));
    expect(await service.solicitar(grupoId,{},usuario)).toMatchObject({total:6,pendentes:6,novasSolicitacoes:6});
    expect(atividades.solicitarNaTransacao).toHaveBeenCalledTimes(1);
  });

  it('cria medições independentes por contrato, sem copiar unidade ou quantidade do outro', async () => {
    const {service,atividades}=construir(new Set([id(101),id(102)]),[]);
    const feito=await service.criar({titulo:'Manutenção',dataHora:'2026-11-14T12:00:00.000Z',
      descricao:'Manutenções em duas unidades',tipo:'Manutenção',vinculos:[
        {contratoId:id(101),entregavelIds:[id(501)],ocorrenciaIds:[id(601)],
          medicoes:[{ocorrenciaId:id(601),quantidade:'5.000'}]},
        {contratoId:id(102),entregavelIds:[id(502)],ocorrenciaIds:[id(602)],
          medicoes:[{ocorrenciaId:id(602),quantidade:'9.000'}]},
      ]},usuario);
    expect(feito.total).toBe(2);
    const payloads=atividades.criarNaTransacao.mock.calls.map(chamada=>chamada[2] as {medicoes?: {ocorrenciaId:string;quantidade:string}[];entregavelIds:string[]});
    expect(payloads[0].medicoes).toEqual([{ocorrenciaId:id(601),quantidade:'5.000'}]);
    expect(payloads[1].medicoes).toEqual([{ocorrenciaId:id(602),quantidade:'9.000'}]);
    expect(payloads[0].entregavelIds).not.toEqual(payloads[1].entregavelIds);
  });

  it('rejeita cadastro multicontrato caso não tenha permissão em todos', async () => {
    const {service,atividades}=construir(new Set([id(101)]),[]);
    await expect(service.criar({titulo:'Vistoria',dataHora:'2026-11-14T12:00:00.000Z',descricao:'Visita técnica',tipo:'Inspeção',
      vinculos:[{contratoId:id(101),entregavelIds:[id(501)]},{contratoId:id(102),entregavelIds:[id(502)]}]},usuario))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(atividades.criarNaTransacao).not.toHaveBeenCalled();
  });
  it('registrar não concede compartilhamento na origem nem no destino', async () => {
    const autorizados=new Set([id(101),id(102)]);
    for(const permitido of [id(101),id(102)]) {
      const {service,atividades}=construir(autorizados,[],undefined,new Set([permitido]));
      await expect(service.criar({titulo:'Vistoria',dataHora:'2026-11-14T12:00:00.000Z',descricao:'Visita técnica',tipo:'Inspeção',
        vinculos:[{contratoId:id(101),entregavelIds:[id(501)]},{contratoId:id(102),entregavelIds:[id(502)]}]},usuario))
        .rejects.toBeInstanceOf(ForbiddenException);
      expect(atividades.criarNaTransacao).not.toHaveBeenCalled();
    }
  });
  it('não inclui um novo destino sem autorização de registro', async () => {
    const {service,atividades}=construir(new Set([id(101)]),['REGISTRADA']);
    await expect(service.adicionarContratos(grupoId,{origemContratoId:id(101),vinculos:[{contratoId:id(102),entregavelIds:[id(501)]}]},usuario))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(atividades.criarNaTransacao).not.toHaveBeenCalled();
  });

  it('verifica autorização de todos os destinos antes de editar metadados', async () => {
    const {service,auditoria}=construir(new Set([id(101)]),['REGISTRADA','REGISTRADA']);
    await expect(service.editarMetadados(grupoId,{contratoIds:[id(101),id(102)],titulo:'Vistoria'},usuario))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(auditoria.registrarNaTransacao).not.toHaveBeenCalled();
  });

});
