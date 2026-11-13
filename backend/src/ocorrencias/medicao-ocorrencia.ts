import type { EntityManager } from 'typeorm';
import type { Ocorrencia } from './ocorrencia.entity.js';

/** Cálculo central: medição por vínculo substitui a coluna legada apenas naquele par atividade/ocorrência.
 * Uma atividade pode medir quantidades DIFERENTES em ocorrências distintas, sem duplicar seu valor. */
export type ResumoMedicao = {
  quantidadeManual: number; quantidadeAtividadesRegistrada: number;
  quantidadeAtividadesVerificada: number; quantidadeRegistrada: number;
  quantidadeExecutada: number; quantidadeRestante: number | null;
  progressoPercentual: number | null; atividadesVerificadas: number; atividadesPendentes: number;
  evidenciasFoto: number; evidenciasRelatorio: number; requisitosAtendidos: boolean;
  metaAtingida: boolean; situacaoComprovacao: 'NAO_EXIGIDA' | 'PARCIAL' | 'APRESENTADA';
};
const texto = (s: number) => Math.round(s * 1000) / 1000;
export async function resumoMedicao(m: EntityManager, o: Ocorrencia): Promise<ResumoMedicao> {
  const [manual, atividades, provas] = await Promise.all([
    m.query(`SELECT COALESCE(SUM(quantidade),0)::text AS total FROM ocorrencia_lancamentos
      WHERE ocorrencia_id=$1 AND contrato_id=$2`, [o.id, o.contratoId]) as Promise<Array<{total:string}>>,
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
         AND (a."ocorrenciaId"=$1 OR am.atividade_id IS NOT NULL OR EXISTS (
           SELECT 1 FROM atividade_ocorrencias ao WHERE ao."atividadeId"=a.id AND ao."ocorrenciaId"=$1))`, [o.id, o.contratoId]) as Promise<Array<{registrada:string;verificada:string;verificadas:string;pendentes:string}>>,
    m.query(`SELECT
      COUNT(*) FILTER (WHERE lower(ev.tipo_evidencia) ~ '(foto|imagem|png|jpeg|jpg)')::text AS fotos,
      COUNT(*) FILTER (WHERE lower(ev.tipo_evidencia) ~ '(relat|report)')::text AS relatorios
      FROM ocorrencia_comprovantes oc
      JOIN comprovantes_evidencia c ON c.id=oc.comprovante_id AND c.contrato_id=oc.contrato_id
      JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id
      WHERE oc.ocorrencia_id=$1 AND oc.contrato_id=$2 AND c.status='VERIFICADA'
        AND NOT EXISTS (SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id
          AND (n.criado_em,n.id) > (c.criado_em,c.id))`, [o.id, o.contratoId]) as Promise<Array<{fotos:string;relatorios:string}>>,
  ]);
  const totalManual = Number(manual[0]?.total ?? 0);
  const registrada = Number(atividades[0]?.registrada ?? 0);
  const verificada = Number(atividades[0]?.verificada ?? 0);
  const executada = texto(totalManual + verificada);
  const comprometida = texto(totalManual + registrada);
  const meta = o.metaQuantidade == null ? null : Number(o.metaQuantidade);
  const fotos = Number(provas[0]?.fotos ?? 0);
  const relatorios = Number(provas[0]?.relatorios ?? 0);
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
      fotos + relatorios >= fotosNecessarias + relatoriosNecessarios + livres
    : evidenciaAtendidaLegada;
  const totalObrigatorio = formatoIndividual
    ? fotosNecessarias + relatoriosNecessarios + livres : minimoEvidencias;
  const atividadesVerificadas = Number(atividades[0]?.verificadas ?? 0);
  const atividadesPendentes = Number(atividades[0]?.pendentes ?? 0);
  const minimoAtividades = o.minimoAtividadesVerificadas ?? (o.exigeAtividade ? 1 : 0);
  const atividadeAtendida = atividadesVerificadas >= minimoAtividades;
  const metaAtingida = meta == null ? (atividadesVerificadas > 0 || executada > 0) : executada >= meta;
  const requisitosAtendidos = evidenciaAtendida && atividadeAtendida && atividadesPendentes === 0;
  return {
    quantidadeManual: totalManual, quantidadeAtividadesRegistrada: registrada,
    quantidadeAtividadesVerificada: verificada, quantidadeExecutada: executada,
    quantidadeRegistrada: comprometida, quantidadeRestante: meta == null ? null : texto(Math.max(0,meta - executada)),
    progressoPercentual: meta == null || meta <= 0 ? null : texto(Math.min(100, (executada / meta) * 100)),
    atividadesVerificadas, atividadesPendentes, evidenciasFoto: fotos, evidenciasRelatorio: relatorios,
    requisitosAtendidos, metaAtingida, situacaoComprovacao: totalObrigatorio === 0 ? 'NAO_EXIGIDA' : evidenciaAtendida ? 'APRESENTADA' : 'PARCIAL',
  };
}

/** Transição automática apenas para SOLICITAÇÃO: nunca aprova por conta própria. */
export function proximoStatusAutomatico(o: Ocorrencia, r: ResumoMedicao): 'NAO_INICIADO'|'EM_ANDAMENTO'|'EM_REVISAO'|'PENDENTE_CONCLUSAO' {
  if (o.status === 'EM_REVISAO') return 'EM_REVISAO';
  if (r.metaAtingida && r.requisitosAtendidos) return 'PENDENTE_CONCLUSAO';
  return o.status === 'EM_ANDAMENTO' || r.quantidadeRegistrada > 0 || r.atividadesVerificadas > 0 || r.atividadesPendentes > 0
    ? 'EM_ANDAMENTO' : 'NAO_INICIADO';
}
