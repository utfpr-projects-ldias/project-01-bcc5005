import { BadRequestException } from '@nestjs/common';
import { consultaEvidenciasConsolidadas } from './consulta-evidencias-consolidadas.js';
const contrato='a66aabb1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
describe('Evidências consolidadas',()=>{
  it('usa a versão atual, delimita o contrato e não retorna chaves de armazenamento',()=>{
    const q=consultaEvidenciasConsolidadas(contrato,{});
    expect(q.dados).toContain('e.contrato_id=$1');
    expect(q.dados).toContain('ORDER BY c.criado_em DESC,c.id DESC LIMIT 1');
    expect(q.dados).toContain("COALESCE(ult.status,'SEM_ENVIO')");
    expect(q.dados).not.toContain('storage_key');
    expect(q.dados).not.toContain('sha256');
  });
  it('inclui evidências arquivadas apenas quando solicitado, preservando o escopo',()=>{
    const normal=consultaEvidenciasConsolidadas(contrato,{});
    const calendario=consultaEvidenciasConsolidadas(contrato,{incluirArquivadas:'1'});
    expect(normal.contagem).toContain('ev.arquivado_em IS NULL');
    expect(calendario.contagem).not.toContain('ev.arquivado_em IS NULL');
    expect(calendario.contagem).toContain('e.contrato_id=$1');
    expect(calendario.dados).toContain('ev.arquivado_em AS "arquivadoEm"');
  });
  it('aplica os mesmos filtros parametrizados antes de paginar e preserva todos os vínculos',()=>{
    const busca="a%' OR 1=1 --";
    const q=consultaEvidenciasConsolidadas(contrato,{busca,status:'VERIFICADA',atividade:'Instalação',ocorrencia:'Novembro',dataInicio:'2026-11-24',dataFim:'2026-11-24',page:'3',limit:'5'});
    expect(q.contagem).toContain('atividade_comprovantes');expect(q.contagem).toContain('ocorrencia_comprovantes');
    expect(q.dados).not.toContain(busca);expect(q.parametros).toContain(busca);
    expect(q.parametros).toContain('2026-11-24T03:00:00.000Z');expect(q.parametros).toContain('2026-11-25T03:00:00.000Z');
    expect(q.paginados.slice(-2)).toEqual([5,10]);expect(q.contagem).not.toContain('OFFSET');
  });
  it('filtra a revisão documental incluindo comprovante reaberto',()=>{
    const q=consultaEvidenciasConsolidadas(contrato,{status:'REJEITADA'});
    expect(q.contagem).toContain("ev.reaberto_em IS NOT NULL");
    expect(q.contagem).toContain("THEN 'REJEITADA'");
    expect(q.parametros).toEqual([contrato,'REJEITADA']);
  });
  it.each([{status:'INVALIDA'},{etapaId:'invalido'},{page:'0'},{limit:'51'},{dataInicio:'2026-02-30'},{dataInicio:'2026-11-25',dataFim:'2026-11-24'}])('rejeita filtros inválidos: %j',filtros=>{
    expect(()=>consultaEvidenciasConsolidadas(contrato,filtros as Record<string,string>)).toThrow(BadRequestException);
  });
});
