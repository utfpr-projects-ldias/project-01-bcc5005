import type {MigrationInterface,QueryRunner} from 'typeorm';
export class ParcelasAtividadePorEntregavel1798140000000 implements MigrationInterface {
 name='ParcelasAtividadePorEntregavel1798140000000';
 async up(q:QueryRunner){
  await q.query(`DROP INDEX uq_execucoes_origem_r47`);
  await q.query(`CREATE UNIQUE INDEX uq_execucoes_origem_r47 ON execucoes_entregavel(origem,origem_id) WHERE origem_id IS NOT NULL AND origem<>'ATIVIDADE'`);
  await q.query(`CREATE UNIQUE INDEX uq_execucoes_atividade_entregavel ON execucoes_entregavel(origem_id,entregavel_id) WHERE origem='ATIVIDADE' AND origem_id IS NOT NULL`);
 }
 async down(q:QueryRunner){
  const [r]=await q.query(`SELECT EXISTS(SELECT 1 FROM execucoes_entregavel WHERE origem='ATIVIDADE' AND origem_id IS NOT NULL GROUP BY origem_id HAVING count(*)>1) AS possui`);
  if(r.possui)throw new Error('Existem atividades com múltiplas contribuições; preserve o histórico antes de reverter.');
  await q.query(`DROP INDEX uq_execucoes_atividade_entregavel`);
  await q.query(`DROP INDEX uq_execucoes_origem_r47`);
  await q.query(`CREATE UNIQUE INDEX uq_execucoes_origem_r47 ON execucoes_entregavel(origem,origem_id) WHERE origem_id IS NOT NULL`);
 }
}
