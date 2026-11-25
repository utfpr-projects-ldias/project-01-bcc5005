import { classificarFalhaPersistencia } from './filtro-persistencia.js';
describe('SQLSTATE no limite HTTP',()=>{
  it.each(['23505','23503','23P01','40P01','40001','55P03'])('conflito %s',codigo=>expect(classificarFalhaPersistencia(codigo).status).toBe(409));
  it.each(['23514','23502','22P02','22001','22003','22007','22008'])('dados incompatíveis %s',codigo=>expect(classificarFalhaPersistencia(codigo).status).toBe(400));
  it.each(['08006','57014','57P01','53300'])('indisponibilidade %s',codigo=>expect(classificarFalhaPersistencia(codigo).status).toBe(503));
  it('não expõe erro SQL desconhecido',()=>{const r=classificarFalhaPersistencia('42P01');expect(r.status).toBe(500);expect(r.mensagem).not.toContain('42P01');});
});
