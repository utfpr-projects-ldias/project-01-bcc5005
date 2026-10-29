"use client";

/** Dashboard é só conteúdo: cabeçalho, navegação e logout persistem no layout raiz. */
export default function DashboardPage() {
  return <div className="min-w-0 space-y-6">
            <div className="p-6 rounded-2xl bg-brand-darkgreen/40 border border-brand-green/30 backdrop-blur-md">
              <h2 className="text-lg font-semibold text-brand-neon mb-2">Bem-vindo ao Painel</h2>
              <p className="text-sm text-foreground/70">
                Aqui você acompanhará a gestão de execução contratual, indicadores e relatórios da Etapa 1.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-5 rounded-xl bg-background border border-brand-green/20">
                <span className="text-sm text-foreground/60">Contratos Ativos</span>
                <p className="text-3xl font-bold text-brand-neon mt-2">—</p>
              </div>
              <div className="p-5 rounded-xl bg-background border border-brand-green/20">
                <span className="text-sm text-foreground/60">Entregáveis Pendentes</span>
                <p className="text-3xl font-bold text-brand-neon mt-2">—</p>
              </div>
              <div className="p-5 rounded-xl bg-background border border-brand-green/20">
                <span className="text-sm text-foreground/60">Avanço Médio</span>
                <p className="text-3xl font-bold text-brand-neon mt-2">—</p>
              </div>
            </div>
            <p className="text-sm text-foreground/60">Indicadores operacionais ainda não disponíveis.</p>
  </div>;
}
