import { jest } from '@jest/globals';
import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { CHAVE_POLITICA } from '../autorizacao/politica.decorator.js';
import { DocumentosController } from './documentos.controller.js';

const contratoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const documentoId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('TEC08-02: política HTTP e entrega segura', () => {
  it('todas as operações declaram escopo de contrato ou recurso persistido', () => {
    const prototipo = DocumentosController.prototype;
    for (const [metodo, acao, tipo] of [
      ['listar', 'documentos:listar', 'contrato'],
      ['editar', 'documentos:editar', 'recurso'],
      ['arquivar', 'documentos:arquivar', 'recurso'],
      ['anexar', 'documentos:anexar', 'contrato'],
      ['baixar', 'documentos:baixar', 'recurso'],
      ['detalhar', 'documentos:visualizar', 'recurso'],
    ]) {
      const politica = Reflect.getMetadata(CHAVE_POLITICA, prototipo[metodo as keyof DocumentosController]);
      expect(politica.acao).toBe(acao);
      expect(politica.escopoOperacional.tipo).toBe(tipo);
      if (tipo === 'recurso') {
        expect(politica.escopoOperacional.recurso).toBe('documento');
        expect(politica.escopoOperacional.parametroContratoPai).toBe('contratoId');
      }
    }
  });

  it('download retorna somente bytes autorizados e headers não executáveis', async () => {
    const conteudo = Buffer.from('%PDF-1.4\n%%EOF');
    const service = { baixar: jest.fn(async () => ({
      metadados: { nomeOriginal: 'contrato (1).pdf', tipoMime: 'application/pdf' }, conteudo,
    })) };
    const controller = new DocumentosController(service as never);
    const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn() };
    await controller.baixar(contratoId, documentoId, res as never);
    expect(service.baixar).toHaveBeenCalledWith(contratoId, documentoId);
    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining("filename*=UTF-8''contrato%20(1).pdf"));
    expect(res.send).toHaveBeenCalledWith(conteudo);
  });

  it('recusa POST sem arquivo antes de chamar o serviço', async () => {
    const service = { anexar: jest.fn() };
    const controller = new DocumentosController(service as never);
    expect(() => controller.anexar(contratoId, { categoria: 'ANEXO' } as never, undefined, {} as never)).toThrow(BadRequestException);
    expect(service.anexar).not.toHaveBeenCalled();
  });
});
