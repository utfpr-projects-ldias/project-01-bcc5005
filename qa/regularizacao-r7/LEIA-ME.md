# R7 — Cobertura de QA e regressão após mudanças do frontend

Os **17 testes Python fonte** que terminam em `teste_*.py` (incluindo a HU07-06 recuperada)
são testes unitários/estáticos. PASS nesses testes NÃO significa navegação Chromium real.

O executor `testar_tudo.sh` reúne Jest completo, 16 E2E TS, tipagem/build/lint,
Python unittest de QA, pré-voo de serviços, e **tenta executar cada cenário Chromium
real** com seus requisitos específicos e dados sintéticos em DEV. Contratos de QA
são criados via API real após login SuperTokens. Nenhuma limpeza/reset de dados
é executada; dados de QA persistem. O status SKIP é explícito quando faltar
credencial, Playwright ou pré-requisito. Nenhum SKIP é contabilizado como PASS.

Roteiros de limpeza/reset, instalação e diagnósticos antigos não são cenários
funcionais: aparecem classificados no inventário e não são rodados como QA.

Escopo histórico R7: toda a árvore `qa`, não apenas TEC08-03. Desde R36/R37,
o executor central `./testes-all` executa o gate **funcional** HU06 com
Chromium, API e banco reais, sem preenchimento de aceite manual. Aprovação
formal do PR e avaliação estética subjetiva não são testes automatizáveis.
