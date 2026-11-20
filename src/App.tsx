import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Clock, Navigation, RotateCcw, WifiOff } from 'lucide-react';
import { FormLancamento } from './components/FormLancamento';
import { ListaLancamentos } from './components/ListaLancamentos';
import { ManutencaoBackup } from './components/ManutencaoBackup';
import { Odometro } from './components/Odometro';
import { PWAInstallButton } from './components/PWAInstallButton';
import { Resumo } from './components/Resumo';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  CategoriaGasto,
  FiltroPeriodo,
  Lancamento,
  Plataforma,
  TipoLancamento,
  Trajeto,
} from './types';
import {
  filtrarPorPeriodo,
  formatarKm,
  formatarMoeda,
  rotuloCategoria,
} from './utils/formatters';
import {
  ConfigTrocaOleo,
  carregarLancamentos,
  carregarMetaDiaria,
  carregarTrajetos,
  gerarId,
  salvarConfigOleo,
  salvarLancamentos,
  salvarMetaDiaria,
  salvarTrajetos,
} from './utils/storage';

type AbaPrincipal = 'registrar' | 'resumo' | 'historico';

type AcaoDesfazer =
  | { tipo: 'lancamento'; item: Lancamento; rotulo: string }
  | { tipo: 'trajeto'; item: Trajeto; rotulo: string };

export default function App() {
  const [abaAtiva, setAbaAtiva] = useState<AbaPrincipal>('registrar');
  const [lancamentos, setLancamentos] = useState<Lancamento[]>(() =>
    carregarLancamentos()
  );
  const [trajetos, setTrajetos] = useState<Trajeto[]>(() =>
    carregarTrajetos()
  );
  const [metaDiaria, setMetaDiaria] = useState<number>(() =>
    carregarMetaDiaria()
  );
  const [periodo, setPeriodo] = useState<FiltroPeriodo>(FiltroPeriodo.HOJE);
  const [desfazer, setDesfazer] = useState<AcaoDesfazer | null>(null);
  const desfazerTimerRef = useRef<number | null>(null);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    salvarLancamentos(lancamentos);
  }, [lancamentos]);

  useEffect(() => {
    salvarTrajetos(trajetos);
  }, [trajetos]);

  useEffect(() => {
    return () => {
      if (desfazerTimerRef.current !== null) {
        window.clearTimeout(desfazerTimerRef.current);
      }
    };
  }, []);

  const agendarDesfazer = (acao: AcaoDesfazer) => {
    if (desfazerTimerRef.current !== null) {
      window.clearTimeout(desfazerTimerRef.current);
    }
    setDesfazer(acao);
    desfazerTimerRef.current = window.setTimeout(() => {
      setDesfazer(null);
      desfazerTimerRef.current = null;
    }, 5000);
  };

  const handleExecutarDesfazer = () => {
    if (!desfazer) return;
    if (desfazerTimerRef.current !== null) {
      window.clearTimeout(desfazerTimerRef.current);
      desfazerTimerRef.current = null;
    }
    if (desfazer.tipo === 'lancamento') {
      setLancamentos((anteriores) => [desfazer.item, ...anteriores]);
    } else {
      setTrajetos((anteriores) => [desfazer.item, ...anteriores]);
    }
    setDesfazer(null);
  };

  const handleTrocarAba = (novaAba: AbaPrincipal) => {
    setAbaAtiva(novaAba);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleMudarMetaDiaria = (novaMeta: number) => {
    setMetaDiaria(novaMeta);
    salvarMetaDiaria(novaMeta);
  };

  const handleAdicionarLancamento = (dados: {
    tipo: TipoLancamento;
    categoria: Plataforma | CategoriaGasto;
    valor: number;
    observacao?: string;
  }) => {
    const novo: Lancamento = {
      id: gerarId(),
      tipo: dados.tipo,
      categoria: dados.categoria,
      valor: dados.valor,
      data: new Date().toISOString(),
      observacao: dados.observacao,
    };
    setLancamentos((anteriores) => [novo, ...anteriores]);
  };

  const handleEditarLancamento = (atualizado: Lancamento) => {
    setLancamentos((anteriores) =>
      anteriores.map((item) => (item.id === atualizado.id ? atualizado : item))
    );
  };

  const handleExcluirLancamento = (id: string) => {
    const encontrado = lancamentos.find((item) => item.id === id);
    if (!encontrado) return;
    setLancamentos((anteriores) => anteriores.filter((item) => item.id !== id));
    agendarDesfazer({
      tipo: 'lancamento',
      item: encontrado,
      rotulo: `${rotuloCategoria(encontrado.categoria)} (${formatarMoeda(encontrado.valor)})`,
    });
  };

  const handleSalvarTrajeto = (
    km: number,
    origem: 'gps' | 'manual',
    duracaoSegundos?: number
  ) => {
    const novo: Trajeto = {
      id: gerarId(),
      data: new Date().toISOString(),
      km: Number(km.toFixed(2)),
      origem,
      duracaoSegundos,
    };
    setTrajetos((anteriores) => [novo, ...anteriores]);
  };

  const handleExcluirTrajeto = (id: string) => {
    const encontrado = trajetos.find((item) => item.id === id);
    if (!encontrado) return;
    setTrajetos((anteriores) => anteriores.filter((item) => item.id !== id));
    agendarDesfazer({
      tipo: 'trajeto',
      item: encontrado,
      rotulo: `Trajeto de ${formatarKm(encontrado.km)} km`,
    });
  };

  const handleRestaurarBackup = (
    novosLancamentos: Lancamento[],
    novosTrajetos: Trajeto[],
    novaMetaDiaria: number,
    novaConfigOleo?: ConfigTrocaOleo
  ) => {
    setLancamentos(novosLancamentos);
    setTrajetos(novosTrajetos);
    setMetaDiaria(novaMetaDiaria);
    salvarMetaDiaria(novaMetaDiaria);
    if (novaConfigOleo) {
      salvarConfigOleo(novaConfigOleo);
    }
    setDesfazer(null);
  };

  const lancamentosDoPeriodo = useMemo(
    () => filtrarPorPeriodo(lancamentos, periodo),
    [lancamentos, periodo]
  );

  const trajetosDoPeriodo = useMemo(
    () => filtrarPorPeriodo(trajetos, periodo),
    [trajetos, periodo]
  );

  const resumoHoje = useMemo(() => {
    const lancHoje = filtrarPorPeriodo(lancamentos, FiltroPeriodo.HOJE);
    const trajHoje = filtrarPorPeriodo(trajetos, FiltroPeriodo.HOJE);
    const ganhos = lancHoje
      .filter((l) => l.tipo === TipoLancamento.GANHO)
      .reduce((acc, l) => acc + l.valor, 0);
    const gastos = lancHoje
      .filter((l) => l.tipo === TipoLancamento.GASTO)
      .reduce((acc, l) => acc + l.valor, 0);
    const km = trajHoje.reduce((acc, t) => acc + t.km, 0);
    return { ganhos, gastos, lucro: ganhos - gastos, km };
  }, [lancamentos, trajetos]);

  const progressoMetaHoje =
    metaDiaria > 0
      ? Math.min(100, (resumoHoje.ganhos / metaDiaria) * 100)
      : 0;
  const faltaMetaHoje = Math.max(0, metaDiaria - resumoHoje.ganhos);
  const rotuloLucroHoje =
    resumoHoje.gastos === 0 ? 'Lucro estimado' : 'Lucro';

  return (
    <div className="app-canvas min-h-screen w-full overflow-x-hidden px-3 sm:px-4 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <div className="relative z-10 mx-auto w-full max-w-[540px]">
        {/* 1. Cabeçalho compacto */}
        <header className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/icon.svg"
              alt="Rota"
              className="h-10 w-10 shrink-0 rounded-2xl"
            />
            <div className="min-w-0">
              <h1 className="text-base font-semibold leading-tight tracking-tight text-[#F5F7FA] whitespace-nowrap">
                Rota
              </h1>
              <p className="text-xs font-medium text-[#9AA6B8] truncate">
                Controle diário de entregas
              </p>
            </div>
          </div>
          <PWAInstallButton />
        </header>

        <main>
          {/* Aba 1: Registrar */}
          <div
            role="tabpanel"
            aria-hidden={abaAtiva !== 'registrar'}
            className={abaAtiva === 'registrar' ? 'space-y-4' : 'hidden'}
          >
            {/* 2. Resumo do turno */}
            <section
              aria-label="Turno de hoje"
              className="neu-card p-4 sm:p-6"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="card-title">Turno de hoje</h2>
                <button
                  type="button"
                  onClick={() => handleTrocarAba('resumo')}
                  className="inline-flex min-h-[44px] -my-2.5 items-center px-2 -mr-2 rounded-xl text-xs font-semibold text-[#70B7F0] hover:text-[#F5F7FA] transition-colors whitespace-nowrap"
                >
                  Ver resumo
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="neu-tile px-3 py-2.5">
                  <span className="block text-xs font-medium text-[#9AA6B8]">
                    Receita
                  </span>
                  <span className="mt-0.5 block text-sm sm:text-base font-bold text-[#35D39A] tabular-nums">
                    {formatarMoeda(resumoHoje.ganhos)}
                  </span>
                </div>

                <div className="neu-tile px-3 py-2.5">
                  <span className="block text-xs font-medium text-[#9AA6B8]">
                    Despesas
                  </span>
                  <span
                    className={`mt-0.5 block text-sm sm:text-base font-bold tabular-nums ${
                      resumoHoje.gastos > 0
                        ? 'text-[#F48C8C]'
                        : 'text-[#F5F7FA]'
                    }`}
                  >
                    {formatarMoeda(resumoHoje.gastos)}
                  </span>
                </div>

                <div className="neu-tile px-3 py-2.5">
                  <span className="block text-xs font-medium text-[#9AA6B8]">
                    {rotuloLucroHoje}
                  </span>
                  <span
                    className={`mt-0.5 block text-sm sm:text-base font-bold tabular-nums ${
                      resumoHoje.lucro > 0
                        ? 'text-[#35D39A]'
                        : resumoHoje.lucro < 0
                          ? 'text-[#F48C8C]'
                          : 'text-[#F5F7FA]'
                    }`}
                  >
                    {formatarMoeda(resumoHoje.lucro)}
                  </span>
                </div>

                <div className="neu-tile px-3 py-2.5">
                  <span className="block text-xs font-medium text-[#9AA6B8]">
                    Distância
                  </span>
                  <span className="mt-0.5 block text-sm sm:text-base font-bold text-[#F5F7FA] tabular-nums">
                    {formatarKm(resumoHoje.km)} km
                  </span>
                </div>
              </div>

              {/* Barra de progresso e meta logo abaixo dos indicadores */}
              <div className="mt-3 pt-3 border-t border-white/6">
                <div
                  role="progressbar"
                  aria-label="Progresso da meta diária"
                  aria-valuemin={0}
                  aria-valuemax={metaDiaria > 0 ? metaDiaria : 100}
                  aria-valuenow={
                    metaDiaria > 0 ? Math.min(resumoHoje.ganhos, metaDiaria) : 0
                  }
                  className="h-2 w-full overflow-hidden rounded-full bg-[#131A26]"
                >
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      metaDiaria > 0 && resumoHoje.ganhos >= metaDiaria
                        ? 'bg-[#35D39A]'
                        : 'bg-[#3186D1]'
                    }`}
                    style={{ width: `${progressoMetaHoje}%` }}
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs tabular-nums">
                  {metaDiaria > 0 ? (
                    <>
                      <span className="font-medium text-[#F5F7FA]">
                        {Math.round(progressoMetaHoje)}% da meta diária
                      </span>
                      <span className="text-[#9AA6B8]">
                        {resumoHoje.ganhos >= metaDiaria
                          ? `${formatarMoeda(resumoHoje.ganhos)} de ${formatarMoeda(metaDiaria)}`
                          : `Faltam ${formatarMoeda(faltaMetaHoje)}`}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-[#9AA6B8]">
                        Meta diária não definida
                      </span>
                      <button
                        type="button"
                        onClick={() => handleTrocarAba('resumo')}
                        className="inline-flex min-h-[44px] -my-2.5 items-center px-2 -mr-2 rounded-xl font-semibold text-[#70B7F0] hover:text-[#F5F7FA] transition-colors"
                      >
                        Definir meta
                      </button>
                    </>
                  )}
                </div>
              </div>
            </section>

            {/* 3. Odômetro */}
            <Odometro onSalvarTrajeto={handleSalvarTrajeto} />

            {/* 4. Registro rápido de ganho ou gasto */}
            <FormLancamento
              lancamentos={lancamentos}
              onAdicionar={handleAdicionarLancamento}
            />
          </div>

          {/* Aba 2: Resumo financeiro e metas */}
          {abaAtiva === 'resumo' && (
            <div role="tabpanel" className="space-y-4">
              <Resumo
                periodo={periodo}
                onMudarPeriodo={setPeriodo}
                lancamentos={lancamentosDoPeriodo}
                todosLancamentos={lancamentos}
                trajetos={trajetosDoPeriodo}
                metaDiaria={metaDiaria}
                onMudarMetaDiaria={handleMudarMetaDiaria}
              />
            </div>
          )}

          {/* Aba 3: Histórico, manutenção e backup */}
          {abaAtiva === 'historico' && (
            <div role="tabpanel" className="space-y-4">
              <ListaLancamentos
                periodo={periodo}
                onMudarPeriodo={setPeriodo}
                lancamentos={lancamentosDoPeriodo}
                trajetos={trajetosDoPeriodo}
                onEditarLancamento={handleEditarLancamento}
                onExcluirLancamento={handleExcluirLancamento}
                onExcluirTrajeto={handleExcluirTrajeto}
              />
              <ManutencaoBackup
                todosLancamentos={lancamentos}
                todosTrajetos={trajetos}
                metaDiaria={metaDiaria}
                onRestaurarBackup={handleRestaurarBackup}
              />
            </div>
          )}
        </main>
      </div>

      {/* Toast flutuante para desfazer exclusão */}
      {desfazer && (
        <div
          role="status"
          className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-3 right-3 z-40 mx-auto max-w-[508px] flex items-center justify-between gap-3 rounded-2xl bg-[#1B2432] px-4 py-2 shadow-lg"
        >
          <span className="text-xs font-medium text-[#9AA6B8] truncate">
            Excluído:{' '}
            <strong className="font-semibold text-[#F5F7FA]">
              {desfazer.rotulo}
            </strong>
          </span>
          <button
            type="button"
            onClick={handleExecutarDesfazer}
            className="btn-primary-glow inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-2xl px-3.5 text-xs font-semibold text-[#F5F7FA] whitespace-nowrap active:scale-[0.98]"
          >
            <RotateCcw
              className="h-4 w-4"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Desfazer
          </button>
        </div>
      )}

      {!isOnline && !desfazer && (
        <div
          role="status"
          className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-3 right-3 z-40 mx-auto max-w-[508px] flex items-center justify-center gap-2 rounded-2xl bg-[#1B2432] px-4 py-2.5 text-xs font-medium text-[#F5F7FA] shadow-lg text-center"
        >
          <WifiOff
            className="h-4 w-4 shrink-0 text-[#70B7F0]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span>Modo offline · Dados salvos no aparelho</span>
        </div>
      )}

      {/* 5. Navegação inferior leve e acessível */}
      <nav
        aria-label="Navegação principal"
        className="fixed bottom-0 left-0 right-0 z-30 bg-[#0E131D]/95 backdrop-blur-md border-t border-white/6 pb-[env(safe-area-inset-bottom)]"
      >
        <div
          role="tablist"
          aria-label="Seções do aplicativo"
          className="mx-auto grid max-w-[540px] grid-cols-3 gap-2 px-3 sm:px-4 py-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={abaAtiva === 'registrar'}
            onClick={() => handleTrocarAba('registrar')}
            className={`min-h-[48px] rounded-2xl px-2 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors duration-150 ${
              abaAtiva === 'registrar'
                ? 'bg-[#3186D1]/20 text-[#F5F7FA]'
                : 'text-[#9AA6B8] hover:text-[#F5F7FA]'
            }`}
          >
            <Navigation
              className={`h-[18px] w-[18px] shrink-0 ${
                abaAtiva === 'registrar' ? 'text-[#70B7F0]' : ''
              }`}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Registrar
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={abaAtiva === 'resumo'}
            onClick={() => handleTrocarAba('resumo')}
            className={`min-h-[48px] rounded-2xl px-2 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors duration-150 ${
              abaAtiva === 'resumo'
                ? 'bg-[#3186D1]/20 text-[#F5F7FA]'
                : 'text-[#9AA6B8] hover:text-[#F5F7FA]'
            }`}
          >
            <BarChart3
              className={`h-[18px] w-[18px] shrink-0 ${
                abaAtiva === 'resumo' ? 'text-[#70B7F0]' : ''
              }`}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Resumo
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={abaAtiva === 'historico'}
            onClick={() => handleTrocarAba('historico')}
            className={`min-h-[48px] rounded-2xl px-2 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors duration-150 ${
              abaAtiva === 'historico'
                ? 'bg-[#3186D1]/20 text-[#F5F7FA]'
                : 'text-[#9AA6B8] hover:text-[#F5F7FA]'
            }`}
          >
            <Clock
              className={`h-[18px] w-[18px] shrink-0 ${
                abaAtiva === 'historico' ? 'text-[#70B7F0]' : ''
              }`}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Histórico
          </button>
        </div>
      </nav>
    </div>
  );
}
