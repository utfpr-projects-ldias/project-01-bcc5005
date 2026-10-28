"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MenuLateral, MenuMobile } from "@/app/components/menu-modulos";
import Session from "supertokens-web-js/recipe/session";

type StatusContrato =
  | "Planejamento"
  | "Em execução"
  | "Em encerramento"
  | "Concluído"
  | "Suspenso"
  | "Cancelado";
type ModoCalculo = "Simples" | "Ponderado";

export default function NovoContratoPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [modoVigencia, setModoVigencia] = useState<"data" | "duracao">("data");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutError("");
    try {
      await Session.signOut();
      router.replace("/login");
      router.refresh();
    } catch {
      setLogoutError("Não foi possível encerrar a sessão.");
    } finally {
      setIsLoggingOut(false);
    }
  }



  // Campos do PRD §8.2 + Anexo PDF
  const [formData, setFormData] = useState({
    numero_contrato: "",
    orgao_contratante: "",
    objeto: "",
    inicio_vigencia: "",
    termino_vigencia: "",
    duracao_meses: "12",
    status: "Planejamento" as StatusContrato,
    modo_calculo: "Simples" as ModoCalculo,
    processo_administrativo: "",
    unidade_responsavel: "",
    descricao: "",
    data_assinatura: "",
    responsavel_interno: "",
    fiscal_gestor: "",
    observacoes: "",
    anexo_pdf: null as File | null,
  });

  // Cálculo inclusivo de vigência (ex: 17/10/2026 + 12 meses -> 16/10/2027)
  function calcularTerminoPorMeses(inicio: string, mesesStr: string) {
    if (!inicio || !mesesStr) return "";
    const [ano, mes, dia] = inicio.split("-").map(Number);
    const meses = parseInt(mesesStr, 10);
    if (isNaN(ano) || isNaN(mes) || isNaN(dia) || isNaN(meses)) return "";

    const dataObj = new Date(ano, mes - 1 + meses, dia - 1);
    const y = dataObj.getFullYear();
    const m = String(dataObj.getMonth() + 1).padStart(2, "0");
    const d = String(dataObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setErrorMsg("");

    let terminoFinal = formData.termino_vigencia;
    if (modoVigencia === "duracao") {
      terminoFinal = calcularTerminoPorMeses(formData.inicio_vigencia, formData.duracao_meses);
    }

    try {
      // Simulação da chamada POST /contratos incluindo o arquivo PDF
      await new Promise((resolve) => setTimeout(resolve, 800));

      const payload = {
        ...formData,
        termino_vigencia: terminoFinal,
        nome_arquivo_pdf: formData.anexo_pdf ? formData.anexo_pdf.name : null,
      };

      console.log("Contrato e PDF validados e prontos para persistência:", payload);

      router.push("/contratos");
    } catch (err: unknown) {
      const status =
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        typeof err.status === "number"
          ? err.status
          : 500;
      if (status === 400) {
        setErrorMsg("Dados inválidos. Verifique os campos obrigatórios preenchidos.");
      } else if (status === 401) {
        setErrorMsg("Sessão expirada. Faça login novamente.");
        router.replace("/login");
      } else if (status === 403) {
        setErrorMsg("Acesso negado: apenas Administradores podem cadastrar contratos.");
      } else if (status === 409) {
        setErrorMsg("Conflito: Já existe um contrato cadastrado com este número.");
      } else {
        setErrorMsg("Falha de comunicação com o servidor. Tente novamente.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground font-sans">
      
      <MenuLateral />

      {/* Conteúdo Principal à Direita */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Topbar */}
        <header className="min-h-20 border-b border-brand-green/20 bg-background/80 backdrop-blur-md px-4 py-3 md:px-8 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-40">
          <h1 className="text-xl font-bold text-foreground">Novo Contrato</h1>

          <div className="flex items-center gap-4">
            {logoutError && <p className="text-sm text-red-400">{logoutError}</p>}
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={isLoggingOut}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-60"
            >
              {isLoggingOut ? "Saindo..." : "Sair"}
            </button>
          </div>
        </header>
        <MenuMobile />

        {/* Formulário */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          <div className="max-w-3xl mx-auto space-y-6">
            
            <div className="flex items-center justify-between border-b border-brand-green/20 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-brand-neon">Cadastro da Entidade Raiz</h2>
                <p className="text-sm text-foreground/70">Preencha os dados obrigatórios, vigência e anexe o PDF do contrato.</p>
              </div>
              <Link
                href="/contratos"
                className="text-sm text-foreground/70 hover:text-brand-green"
              >
                ← Voltar para listagem
              </Link>
            </div>

            {errorMsg && (
              <div role="alert" className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6 bg-brand-darkgreen/10 p-6 rounded-2xl border border-brand-green/20">
              
              {/* Dados Principais */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground/70 mb-1">Número do Contrato *</label>
                  <input
                    type="text"
                    required
                    value={formData.numero_contrato}
                    onChange={(e) => setFormData({ ...formData, numero_contrato: e.target.value })}
                    placeholder="Ex: CT-015/2026"
                    className="w-full px-3 py-2 rounded-lg bg-background border border-brand-green/30 text-sm text-foreground focus:outline-none focus:border-brand-green"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/70 mb-1">Órgão Contratante *</label>
                  <input
                    type="text"
                    required
                    value={formData.orgao_contratante}
                    onChange={(e) => setFormData({ ...formData, orgao_contratante: e.target.value })}
                    placeholder="Ex: Secretaria de Obras"
                    className="w-full px-3 py-2 rounded-lg bg-background border border-brand-green/30 text-sm text-foreground focus:outline-none focus:border-brand-green"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground/70 mb-1">Objeto do Contrato *</label>
                <textarea
                  required
                  rows={3}
                  value={formData.objeto}
                  onChange={(e) => setFormData({ ...formData, objeto: e.target.value })}
                  placeholder="Descreva o escopo e objeto resumido..."
                  className="w-full px-3 py-2 rounded-lg bg-background border border-brand-green/30 text-sm text-foreground focus:outline-none focus:border-brand-green"
                />
              </div>

              {/* Vigência Operacional com seletor dual */}
              <div className="p-4 rounded-xl bg-background border border-brand-green/20 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-brand-neon">Vigência Operacional</span>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setModoVigencia("data")}
                      className={`px-2.5 py-1 rounded ${modoVigencia === "data" ? "bg-brand-green text-background font-medium" : "text-foreground/70"}`}
                    >
                      Informar Término
                    </button>
                    <button
                      type="button"
                      onClick={() => setModoVigencia("duracao")}
                      className={`px-2.5 py-1 rounded ${modoVigencia === "duracao" ? "bg-brand-green text-background font-medium" : "text-foreground/70"}`}
                    >
                      Duração (Meses)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-foreground/70 mb-1">Início da Vigência *</label>
                    <input
                      type="date"
                      required
                      value={formData.inicio_vigencia}
                      onChange={(e) => setFormData({ ...formData, inicio_vigencia: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-brand-green/30 text-sm text-foreground focus:outline-none focus:border-brand-green"
                    />
                  </div>

                  {modoVigencia === "data" ? (
                    <div>
                      <label className="block text-xs font-medium text-foreground/70 mb-1">Término da Vigência *</label>
                      <input
                        type="date"
                        required
                        value={formData.termino_vigencia}
                        onChange={(e) => setFormData({ ...formData, termino_vigencia: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-background border border-brand-green/30 text-sm text-foreground focus:outline-none focus:border-brand-green"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-foreground/70 mb-1">Duração em Meses *</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={formData.duracao_meses}
                        onChange={(e) => setFormData({ ...formData, duracao_meses: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-background border border-brand-green/30 text-sm text-foreground focus:outline-none focus:border-brand-green"
                      />
                      {formData.inicio_vigencia && (
                        <p className="text-xs text-foreground/50 mt-1">
                          Término calculado: {calcularTerminoPorMeses(formData.inicio_vigencia, formData.duracao_meses)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Status e Modo de Cálculo */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground/70 mb-1">Status Operacional *</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as StatusContrato })}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-brand-green/30 text-sm text-foreground focus:outline-none focus:border-brand-green"
                  >
                    <option value="Planejamento">Planejamento</option>
                    <option value="Em execução">Em execução</option>
                    <option value="Em encerramento">Em encerramento</option>
                    <option value="Concluído">Concluído</option>
                    <option value="Suspenso">Suspenso</option>
                    <option value="Cancelado">Cancelado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/70 mb-1">Modo de Cálculo *</label>
                  <select
                    value={formData.modo_calculo}
                    onChange={(e) => setFormData({ ...formData, modo_calculo: e.target.value as ModoCalculo })}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-brand-green/30 text-sm text-foreground focus:outline-none focus:border-brand-green"
                  >
                    <option value="Simples">Simples</option>
                    <option value="Ponderado">Ponderado</option>
                  </select>
                </div>
              </div>

              {/* Campo de Anexo PDF do Contrato */}
              <div className="p-4 rounded-xl bg-background border border-brand-green/20 space-y-2">
                <label className="block text-xs font-semibold text-brand-neon">Documento do Contrato (PDF)</label>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setFormData({ ...formData, anexo_pdf: file });
                  }}
                  className="w-full text-sm text-foreground/70 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand-green file:text-background hover:file:opacity-90 cursor-pointer"
                />
                <p className="text-xs text-foreground/50">Anexe o arquivo PDF oficial emitido pelo órgão contratante.</p>
              </div>

              {/* Campos Opcionais PRD */}
              <div className="border-t border-brand-green/20 pt-4 space-y-4">
                <h3 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">Campos Opcionais (PRD)</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-foreground/70 mb-1">Processo Administrativo</label>
                    <input
                      type="text"
                      value={formData.processo_administrativo}
                      onChange={(e) => setFormData({ ...formData, processo_administrativo: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-brand-green/30 text-sm text-foreground focus:outline-none focus:border-brand-green"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground/70 mb-1">Unidade Responsável</label>
                    <input
                      type="text"
                      value={formData.unidade_responsavel}
                      onChange={(e) => setFormData({ ...formData, unidade_responsavel: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-brand-green/30 text-sm text-foreground focus:outline-none focus:border-brand-green"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-foreground/70 mb-1">Data de Assinatura</label>
                    <input
                      type="date"
                      value={formData.data_assinatura}
                      onChange={(e) => setFormData({ ...formData, data_assinatura: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-brand-green/30 text-sm text-foreground focus:outline-none focus:border-brand-green"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground/70 mb-1">Fiscal / Gestor (Informativo)</label>
                    <input
                      type="text"
                      value={formData.fiscal_gestor}
                      onChange={(e) => setFormData({ ...formData, fiscal_gestor: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-brand-green/30 text-sm text-foreground focus:outline-none focus:border-brand-green"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Link
                  href="/contratos"
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-brand-green/30 text-foreground/80 hover:bg-brand-darkgreen/20"
                >
                  Cancelar
                </Link>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2 rounded-lg text-sm font-semibold bg-brand-green text-background hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {submitting ? "Salvando..." : "Salvar Contrato"}
                </button>
              </div>

            </form>

          </div>
        </main>

      </div>
    </div>
  );
}