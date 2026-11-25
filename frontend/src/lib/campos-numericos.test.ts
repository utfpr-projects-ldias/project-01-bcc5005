import { decimalDigitado, decimalExibicao, decimalParaApi, decimalValido } from './campos-numericos';
test('digitação em pt-BR limita percentual a 100 e duas casas', () => {
 expect(decimalDigitado('110')).toBe('100');
 expect(decimalDigitado('80,123')).toBe('80,12');
 expect(decimalDigitado('20.50')).toBe('20,50');
 expect(decimalDigitado('abc12,5')).toBe('12,5');
 expect(decimalExibicao('20.5')).toBe('20,50');
 expect(decimalParaApi('30,25')).toBe('30.25');
 expect(decimalValido('0')).toBe(false);
 expect(decimalValido('0', 100, true)).toBe(true);
 expect(decimalValido('100,01')).toBe(false);
});
