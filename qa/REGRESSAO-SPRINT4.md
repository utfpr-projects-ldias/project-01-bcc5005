# Regularização da regressão da Sprint 04

Referência de análise: snapshot enviado em 24/11/2026, commit `078930d`.
O executor não exige esse commit nem branch específica. Compatibilidade do patch depende do conteúdo dos arquivos.

## Alterações
- Fixture integral das 63 migrations, com teste de paridade e verificação de schema em PostgreSQL na suíte HU06-04.
- Executor oficial distingue falha, ausência de testes e casos ignorados; descoberta Python cobre ambos os prefixos; inventário das suítes E2E protegido contra omissão/duplicidade.
- Roteiros históricos de regressão preservados, removendo bloqueios de branch/HEAD no fluxo normal e delegando o antigo runner R7 ao executor central.
- Seletores de tabelas, navegação contratual e indicadores atualizados nos roteiros afetados; testes de ordenação, estados semânticos e acessibilidade dos indicadores.
- Casos adicionais de cálculo dos cinco tipos, pesos parciais, integridade da quantidade e referência de comprovação direta.

## Critérios de produto
O PRD continua sendo a referência. EC-07: orientação posterior permite cálculo proporcional com pesos incompletos sem conclusão integral. EC-01: o motor limita o percentual a 100% preservando a medição; a política atual de reserva/bloqueio de novos lançamentos excedentes ainda exige decisão explícita sobre sua compatibilidade com o PRD. Não alterar a expectativa matemática para esconder essa diferença.

## Estado da validação
Este patch foi elaborado por inspeção estática, sem executar Jest, Playwright, QA Python, build, Docker ou migrations. As alterações não constituem homologação. Não houve revisão semântica exaustiva de todas as asserções e caminhos do acervo histórico. Permanecem por validar todos os fluxos reais, em especial concorrência de saldo, multicontrato, revisão/reativação, upload e modais diretos; falhas devem ser analisadas como defeito de produto ou teste obsoleto conforme o PRD, não simplesmente removidas. Verificação de CSS por presença textual não substitui estilos computados e navegação real.

Após aplicar, execute `./configurar-testes` se necessário e `./testes-all`. O relatório diferencia PASS/FAIL/SKIP; SKIP não é aprovação. Nenhum backup, reset ou commit automático integra a aplicação deste patch.
