import { resumoPercentualOcorrencia } from '../execucao/parcelas-execucao.js';
import type { EntityManager } from 'typeorm';
import type { Ocorrencia } from './ocorrencia.entity.js';
import { hojeCivil } from '../common/data-civil.js';

/** Cálculo central: medição por vínculo substitui a coluna legada apenas naquele par atividade/ocorrência.
 * Uma atividade pode medir quantidades DIFERENTES em ocorrências distintas, sem duplicar seu valor. */
export type ResumoMedicao = {
  quantidadeManual: number; quantidadeEvidenciasVerificadas?: number; quantidadeAtividadesRegistrada: number;
  quantidadeAtividadesVerificada: number; quantidadeRegistrada: number;
  quantidadeExecutada: number; quantidadeRestante: number | null;
  progressoPercentual: number | null; atividadesVerificadas: number; atividadesPendentes: number;
  evidenciasFoto: number; evidenciasRelatorio: number; evidenciasOutras: number; requisitosAtendidos: boolean;
  criteriosOperacionaisAtendidos: boolean; documentacaoAtendida: boolean;
  /** Pendências físicas impedem congelar a ocorrência, inclusive revisão sem reserva de saldo. */
  registrosExecucaoPendentes?: boolean;
  metaAtingida: boolean; situacaoComprovacao: 'NAO_EXIGIDA' | 'PARCIAL' | 'APRESENTADA';
};
const texto = (s: number) => Math.round(s * 1000) / 1000;
export async function resumoMedicao(m: EntityManager, o: Ocorrencia): Promise<ResumoMedicao> {
  const [manual, atividades, provas] = await Promise.all([
    m.query(`SELECT COALESCE(SUM(quantidade) FILTER (WHERE status_execucao='APROVADO'),0)::text AS total,
      COALESCE(SUM(quantidade) FILTER (WHERE status_execucao IN ('APROVADO','PENDENTE')),0)::text AS registrada,
      COUNT(*) FILTER (WHERE status_execucao IN ('PENDENTE','REJEITADO'))::text AS pendentes FROM ocorrencia_lancamentos
      WHERE ocorrencia_id=$1 AND contrato_id=$2 AND excluido_em IS NULL`, [o.id, o.contratoId]) as Promise<Array<{total:string;registrada?:string;pendentes?:string}>>,
    m.query(`SELECT
       COALESCE(SUM(COALESCE(am.quantidade, CASE WHEN a."ocorrenciaId"=$1 THEN a.quantidade_execucao ELSE 0 END))
         FILTER (WHERE a.status <> 'ARQUIVADA'),0)::text AS registrada,
       COALESCE(SUM(COALESCE(am.quantidade, CASE WHEN a."ocorrenciaId"=$1 THEN a.quantidade_execucao ELSE 0 END))
         FILTER (WHERE a.status='VERIFICADA'),0)::text AS verificada,
       COUNT(*) FILTER (WHERE a.status='VERIFICADA')::text AS verificadas,
       COUNT(*) FILTER (WHERE a.status NOT IN ('VERIFICADA','ARQUIVADA'))::text AS pendentes
       FROM atividades a
       LEFT JOIN atividade_ocorrencia_medicoes am ON am.atividade_id=a.id AND am.ocorrencia_id=$1
       WHERE a."contratoId"=$2 AND a."excluidaEm" IS NULL
         AND (a."ocorrenciaId"=$1 OR EXISTS (
           SELECT 1 FROM atividade_ocorrencias ao WHERE ao."atividadeId"=a.id AND ao."ocorrenciaId"=$1))`, [o.id, o.contratoId]) as Promise<Array<{registrada:string;verificada:string;verificadas:string;pendentes:string}>>,
    m.query(`SELECT
      COALESCE(SUM(c.quantidade_aprovada) FILTER (WHERE c.ocorrencia_quantidade_id=$1 AND c.origem_quantidade='NOVA_EXECUCAO'
        AND EXISTS (SELECT 1 FROM ocorrencia_comprovantes direto WHERE direto.ocorrencia_id=$1 AND direto.contrato_id=$2 AND direto.comprovante_id=c.id)
        AND NOT EXISTS (SELECT 1 FROM atividade_comprovantes ac
          JOIN atividades a ON a.id=ac.atividade_id AND a."excluidaEm" IS NULL AND a.status='VERIFICADA'
          LEFT JOIN atividade_ocorrencia_medicoes am ON am.atividade_id=a.id AND am.ocorrencia_id=$1
          WHERE ac.comprovante_id=c.id AND ac.contrato_id=c.contrato_id AND COALESCE(am.quantidade, CASE WHEN a."ocorrenciaId"=$1 THEN a.quantidade_execucao ELSE 0 END)>0)),0)::text AS quantidade,
      (SELECT COALESCE(SUM(p.quantidade_declarada),0)::text FROM comprovantes_evidencia p JOIN evidencias_esperadas ep ON ep.id=p.evidencia_esperada_id
        WHERE p.contrato_id=$2 AND p.ocorrencia_quantidade_id=$1 AND p.origem_quantidade='NOVA_EXECUCAO' AND p.status='PENDENTE_VERIFICACAO' AND ep.arquivado_em IS NULL
          AND NOT EXISTS (SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=p.evidencia_esperada_id AND (n.criado_em,n.id)>(p.criado_em,p.id))) AS pendente_quantidade,
      (SELECT COUNT(*)::text FROM comprovantes_evidencia p JOIN evidencias_esperadas ep ON ep.id=p.evidencia_esperada_id
        WHERE p.contrato_id=$2 AND p.ocorrencia_quantidade_id=$1 AND p.origem_quantidade='NOVA_EXECUCAO' AND p.status='REJEITADA' AND ep.arquivado_em IS NULL
          AND NOT EXISTS (SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=p.evidencia_esperada_id AND (n.criado_em,n.id)>(p.criado_em,p.id))) AS revisao_quantidade,
      COUNT(DISTINCT c.sha256)::text AS total,
      COUNT(DISTINCT c.sha256) FILTER (WHERE c.tipo_mime LIKE 'image/%' AND lower(ev.tipo_evidencia) ~ '(foto|imagem|png|jpeg|jpg)')::text AS fotos,
      COUNT(DISTINCT c.sha256) FILTER (WHERE c.tipo_mime NOT LIKE 'image/%' AND lower(ev.tipo_evidencia) !~ '(foto|imagem|png|jpeg|jpg)'
        AND lower(ev.tipo_evidencia) ~ '(relat|report)')::text AS relatorios
      FROM vw_provas_ocorrencia_r41 oc
      JOIN comprovantes_evidencia c ON c.id=oc.comprovante_id AND c.contrato_id=oc.contrato_id
      JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id
      WHERE oc.ocorrencia_id=$1 AND oc.contrato_id=$2 AND c.status='VERIFICADA' AND c.verificado_em IS NOT NULL
        AND ev.arquivado_em IS NULL AND ev.reaberto_em IS NULL
        AND NOT EXISTS (SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id
          AND (n.criado_em,n.id) > (c.criado_em,c.id))`, [o.id, o.contratoId]) as Promise<Array<{total:string;fotos:string;relatorios:string;quantidade?:string;pendente_quantidade?:string;revisao_quantidade?:string}>>,
  ]);
  const totalManual = Number(manual[0]?.total ?? 0);
  const registrada = Number(atividades[0]?.registrada ?? 0);
  const verificada = Number(atividades[0]?.verificada ?? 0);
  const quantidadeEvidencias = Number(provas[0]?.quantidade ?? 0);
  const executada = texto(totalManual + verificada + quantidadeEvidencias);
  const evidenciasPendentes=Number(provas[0]?.pendente_quantidade??0);
  const comprometida = texto(Number(manual[0]?.registrada ?? totalManual) + registrada + quantidadeEvidencias + evidenciasPendentes);
  const manuaisPendentes=Number(manual[0]?.pendentes??0);
  const meta = o.metaQuantidade == null ? null : Number(o.metaQuantidade);
  const fotos = Number(provas[0]?.fotos ?? 0);
  const relatorios = Number(provas[0]?.relatorios ?? 0);
  const totalProvas = Number(provas[0]?.total ?? (fotos + relatorios));
  const exige = o.evidenciaExigida ?? 'NENHUMA';
  // Colunas novas respeitam a quantidade configurada; registros anteriores à migration
  // preservam a semântica de 1 atividade ou 1 evidência por formato, se exigidas.
  const minimoEvidencias = o.minimoEvidenciasVerificadas ?? (exige === 'AMBOS' ? 2 : exige === 'NENHUMA' ? 0 : 1);
  const formatoIndividual = o.minimoFotos != null || o.minimoRelatorios != null || o.minimoEvidenciasLivres != null;
  const evidenciaAtendidaLegada = fotos + relatorios >= minimoEvidencias && (
    minimoEvidencias === 0 || exige === 'NENHUMA' ||
    ((exige === 'FOTO' || exige === 'AMBOS' ? fotos > 0 : true) &&
     (exige === 'RELATORIO' || exige === 'AMBOS' ? relatorios > 0 : true))
  ) && (minimoEvidencias === 0 || (exige === 'FOTO' ? fotos >= minimoEvidencias :
    exige === 'RELATORIO' ? relatorios >= minimoEvidencias : true));
  // Requisitos livres podem ser preenchidos por qualquer formato já verificado,
  // mas uma mesma evidência não satisfaz duas cotas ao mesmo tempo.
  const fotosNecessarias = o.minimoFotos ?? 0;
  const relatoriosNecessarios = o.minimoRelatorios ?? 0;
  const livres = o.minimoEvidenciasLivres ?? 0;
  const evidenciaAtendida = formatoIndividual
    ? fotos >= fotosNecessarias && relatorios >= relatoriosNecessarios &&
      totalProvas >= fotosNecessarias + relatoriosNecessarios + livres
    : evidenciaAtendidaLegada;
  const totalObrigatorio = formatoIndividual
    ? fotosNecessarias + relatoriosNecessarios + livres : minimoEvidencias;
  const atividadesVerificadas = Number(atividades[0]?.verificadas ?? 0);
  const atividadesPendentes = Number(atividades[0]?.pendentes ?? 0);
  const minimoAtividades = o.minimoAtividadesVerificadas ?? (o.exigeAtividade ? 1 : 0);
  const atividadeAtendida = atividadesVerificadas >= minimoAtividades;
  const parcelas = await resumoPercentualOcorrencia(m,o);
  // Uma prova reconhecida pode sustentar uma ocorrência descritiva sem atividade
  // obrigatória. Nunca transforma uma meta quantitativa em 100% nem aprova a ocorrência.
  const metaAtingida = parcelas ? parcelas.reconhecido>=10000 : meta == null
    ? (atividadesVerificadas > 0 || executada > 0 || (o.modoRegistro === 'DESCRITIVO' && totalProvas > 0))
    : executada >= meta;
  const registrosExecucaoPendentes = atividadesPendentes > 0 || manuaisPendentes > 0 || evidenciasPendentes > 0 ||
    Number(provas[0]?.revisao_quantidade ?? 0) > 0 || (parcelas?.reservado ?? 0) > 0 || Boolean(parcelas?.emRevisao);
  const criteriosOperacionaisAtendidos = atividadeAtendida && !registrosExecucaoPendentes;
  const requisitosAtendidos = evidenciaAtendida && criteriosOperacionaisAtendidos;
  return {
    quantidadeManual: totalManual, quantidadeEvidenciasVerificadas: quantidadeEvidencias, quantidadeAtividadesRegistrada: registrada,
    quantidadeAtividadesVerificada: verificada, quantidadeExecutada: executada,
    quantidadeRegistrada: comprometida, quantidadeRestante: meta == null ? null : texto(Math.max(0,meta - executada)),
    progressoPercentual: parcelas ? Math.min(100,parcelas.reconhecido/100) : meta == null || meta <= 0 ? null : texto(Math.min(100, (executada / meta) * 100)),
    atividadesVerificadas, atividadesPendentes, evidenciasFoto: fotos, evidenciasRelatorio: relatorios,
    evidenciasOutras: Math.max(0, totalProvas - fotos - relatorios),
    requisitosAtendidos, criteriosOperacionaisAtendidos, registrosExecucaoPendentes, documentacaoAtendida: evidenciaAtendida, metaAtingida, situacaoComprovacao: totalObrigatorio === 0 ? 'NAO_EXIGIDA' : evidenciaAtendida ? 'APRESENTADA' : 'PARCIAL',
  };
}

/** Um serviço CONTINUO só se torna elegível para aprovação a partir do fim civil previsto.
 * A meta física pode ser atingida antes, sem alterar o prazo operacional. */
export function conclusaoTemporalPermitida(tipo: string, termino: string | null | undefined,
  referencia: string = hojeCivil()): boolean {
  return tipo !== 'CONTINUO' || !termino || referencia >= termino;
}

/** Transição automática apenas para SOLICITAÇÃO: nunca aprova por conta própria. */
export function proximoStatusAutomatico(o: Ocorrencia, r: ResumoMedicao, prazoLiberado = true): 'NAO_INICIADO'|'EM_ANDAMENTO'|'EM_REVISAO'|'PENDENTE_CONCLUSAO' {
  if (o.status === 'EM_REVISAO') return 'EM_REVISAO';
  // Prova exclusivamente documental permite início e solicitação explícita,
  // mas não congela uma ocorrência descritiva automaticamente.
  const somenteProva = o.modoRegistro === 'DESCRITIVO' && r.atividadesVerificadas === 0 && r.quantidadeExecutada === 0 && r.progressoPercentual == null;
  if (prazoLiberado && r.metaAtingida && r.requisitosAtendidos && !somenteProva) return 'PENDENTE_CONCLUSAO';
  return o.status === 'EM_ANDAMENTO' || (o.execucoesPercentuais && (r.progressoPercentual??0)>0) || r.quantidadeExecutada > 0 || r.atividadesVerificadas > 0 || r.evidenciasFoto + r.evidenciasRelatorio + r.evidenciasOutras > 0 || Boolean(o.dataRealizada)
    ? 'EM_ANDAMENTO' : 'NAO_INICIADO';
}

/** Revalida a contribuição física sem alterar silenciosamente a decisão auditada. */
export async function medicaoAprovadaAtual(m: EntityManager, o: Ocorrencia): Promise<{ quantidade: string | null; apta: boolean }> {
  const original = o.quantidadeAprovada ?? o.quantidadeRealizada ?? null;
  if (!['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(o.status)) return { quantidade: null, apta: false };
  if(o.execucoesPercentuais){const r=await resumoMedicao(m,o);return {quantidade:null,apta:r.metaAtingida&&r.criteriosOperacionaisAtendidos};}
  if (o.modoRegistro === 'DESCRITIVO') {
    // Não revogar a aprovação física descritiva pela mera perda de um documento.
    // Se a decisão exigia atividades, revalidar os fatos operacionais exigidos.
    const minimo = o.minimoAtividadesVerificadas ?? (o.exigeAtividade ? 1 : 0);
    if (minimo === 0) return { quantidade: null, apta: true };
    const r = await resumoMedicao(m, o);
    return { quantidade: null, apta: r.atividadesVerificadas >= minimo && r.criteriosOperacionaisAtendidos };
  }
  // Compatibilidade com declarações quantitativas antigas sem meta. Não criar novas.
  if (o.metaQuantidade == null) return { quantidade: original, apta: true };
  const atual = await resumoMedicao(m, o);
  const quantidade = Math.min(Number(original ?? 0), atual.quantidadeExecutada);
  return { quantidade: quantidade.toFixed(3), apta: atual.metaAtingida && atual.criteriosOperacionaisAtendidos && quantidade >= Number(o.metaQuantidade) };
}

/** Quantidade reconhecida pelos registros individuais, sem converter fechamento
 * administrativo em aprovação integral. A aptidão formal continua separada. */
export async function medicaoReconhecidaAtual(m: EntityManager, o: Ocorrencia): Promise<string | null> {
  if (o.substituidaEm || o.modoRegistro === 'DESCRITIVO') return null;
  if (o.metaQuantidade != null) {
    const r = await resumoMedicao(m, o);
    return r.quantidadeExecutada.toFixed(3);
  }
  // Uma declaração legada não aprovada não entra no avanço oficial.
  const aprovada = o.quantidadeAprovada ?? (['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(o.status) ? o.quantidadeRealizada : null);
  return aprovada == null ? '0.000' : aprovada;
}
