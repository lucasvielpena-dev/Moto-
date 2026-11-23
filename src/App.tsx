import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Clock, Home, SlidersHorizontal } from 'lucide-react';
import { FormLancamento } from './components/FormLancamento';
import { ListaLancamentos } from './components/ListaLancamentos';
import { ManutencaoBackup } from './components/ManutencaoBackup';
import { Odometro, DadosEntregaFinalizada } from './components/Odometro';
import { Resumo } from './components/Resumo';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  CategoriaGasto,
  Entrega,
  FiltroPeriodo,
  Lancamento,
  Plataforma,
  StatusOdometro,
  TipoLancamento,
  Trajeto,
  Vencimento,
} from './types';
import {
  filtrarEntregasPorPeriodo,
  filtrarPorPeriodo,
  formatarKm,
  formatarMoeda,
  rotuloCategoria,
} from './utils/formatters';
import {
  ConfigTrocaOleo,
  DadosRestauracao,
  PreferenciaTema,
  carregarAltoContraste,
  carregarConfigOleo,
  carregarEntregas,
  carregarLancamentos,
  carregarMetaDiaria,
  carregarMinLucroKm,
  carregarModoMovimento,
  carregarPercentualReserva,
  carregarReservaKm,
  carregarReservaMes,
  carregarTema,
  carregarTrajetos,
  carregarVencimentos,
  gerarId,
  obterEntregasLancamento,
  salvarAltoContraste,
  salvarConfigOleo,
  salvarEntregas,
  salvarLancamentos,
  salvarMetaDiaria,
  salvarMinLucroKm,
  salvarPercentualReserva,
  salvarReservaKm,
  salvarReservaMes,
  salvarTema,
  salvarTrajetos,
  salvarVencimentos,
} from './utils/storage';
import { obterAvisoVencimentoMaisProximo } from './utils/vencimentos';

type AbaPrincipal = 'hoje' | 'resumo' | 'historico' | 'ajustes';

type AcaoDesfazer =
  | {
      acao: 'adicionado' | 'excluido';
      tipo: 'lancamento';
      item: Lancamento;
      rotulo: string;
    }
  | {
      acao: 'excluido';
      tipo: 'trajeto';
      item: Trajeto;
      rotulo: string;
    }
  | {
      acao: 'adicionado' | 'excluido';
      tipo: 'entrega';
      item: Entrega;
      lancamentoVinculado?: Lancamento;
      rotulo: string;
    };

function formatarDataPorExtenso(data: Date): string {
  const texto = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(data);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatarHora(isoData: string): string {
  const d = new Date(isoData);
  if (Number.isNaN(d.getTime())) return '--:--';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export default function App() {
  const [abaAtiva, setAbaAtiva] = useState<AbaPrincipal>('hoje');

  const [tema, setTema] = useState<PreferenciaTema>(() => carregarTema());
  const [altoContraste, setAltoContraste] = useState<boolean>(() =>
    carregarAltoContraste()
  );
  const [lancamentos, setLancamentos] = useState<Lancamento[]>(() =>
    carregarLancamentos()
  );
  const [trajetos, setTrajetos] = useState<Trajeto[]>(() =>
    carregarTrajetos()
  );
  const [entregas, setEntregas] = useState<Entrega[]>(() => carregarEntregas());
  const [metaDiaria, setMetaDiaria] = useState<number>(() =>
    carregarMetaDiaria()
  );
  const [minLucroKm, setMinLucroKm] = useState<number>(() =>
    carregarMinLucroKm()
  );
  const [percentualReserva, setPercentualReserva] = useState<number>(() =>
    carregarPercentualReserva()
  );
  const [reservaKm, setReservaKm] = useState<number>(() => carregarReservaKm());
  const [reservaMes, setReservaMes] = useState<number>(() =>
    carregarReservaMes()
  );
  const [vencimentos, setVencimentos] = useState<Vencimento[]>(() =>
    carregarVencimentos()
  );
  const [configOleo, setConfigOleo] = useState<ConfigTrocaOleo>(() =>
    carregarConfigOleo()
  );
  const [triggerFinalizarSeq, setTriggerFinalizarSeq] = useState<number>(0);
  const [odometroInfo, setOdometroInfo] = useState<{
    status: StatusOdometro;
    km: number;
    tempoSegundos: number;
    entregaAtiva: boolean;
    kmEntregaAtual: number;
    velocidadeKmh: number | null;
  }>({
    status: 'idle',
    km: 0,
    tempoSegundos: 0,
    entregaAtiva: false,
    kmEntregaAtual: 0,
    velocidadeKmh: null,
  });

  const [sheetLancamento, setSheetLancamento] = useState<{
    aberto: boolean;
    tipo: TipoLancamento;
  }>({
    aberto: false,
    tipo: TipoLancamento.GANHO,
  });

  const [periodo, setPeriodo] = useState<FiltroPeriodo>(FiltroPeriodo.HOJE);
  const [desfazer, setDesfazer] = useState<AcaoDesfazer | null>(null);
  const desfazerTimerRef = useRef<number | null>(null);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    const aplicarTema = () => {
      const prefersDark =
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      const resolved =
        tema === 'escuro'
          ? 'dark'
          : tema === 'claro'
            ? 'light'
            : prefersDark
              ? 'dark'
              : 'light';

      if (tema === 'claro' || tema === 'escuro') {
        document.documentElement.setAttribute('data-theme', resolved);
      } else {
        document.documentElement.removeAttribute('data-theme');
      }

      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) {
        metaTheme.setAttribute(
          'content',
          resolved === 'dark' ? '#0B0F17' : '#F6F7F9'
        );
      }
    };

    aplicarTema();
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', aplicarTema);
    return () => mediaQuery.removeEventListener('change', aplicarTema);
  }, [tema]);

  useEffect(() => {
    if (altoContraste) {
      document.documentElement.setAttribute('data-contrast', 'high');
    } else {
      document.documentElement.removeAttribute('data-contrast');
    }
  }, [altoContraste]);

  useEffect(() => {
    salvarLancamentos(lancamentos);
  }, [lancamentos]);

  useEffect(() => {
    salvarTrajetos(trajetos);
  }, [trajetos]);

  useEffect(() => {
    salvarEntregas(entregas);
  }, [entregas]);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const novo = url.searchParams.get('novo');
      if (novo === 'ganho' || novo === 'gasto') {
        setAbaAtiva('hoje');
        setSheetLancamento({
          aberto: true,
          tipo:
            novo === 'gasto' ? TipoLancamento.GASTO : TipoLancamento.GANHO,
        });
        url.searchParams.delete('novo');
        const destino = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState({}, '', destino || '/');
      }
    } catch {
      // Ignore malformed URLs safely
    }
  }, []);

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
      if (desfazer.acao === 'adicionado') {
        setLancamentos((anteriores) =>
          anteriores.filter((item) => item.id !== desfazer.item.id)
        );
      } else {
        setLancamentos((anteriores) => [desfazer.item, ...anteriores]);
      }
    } else if (desfazer.tipo === 'entrega') {
      if (desfazer.acao === 'adicionado') {
        setEntregas((anteriores) =>
          anteriores.filter((item) => item.id !== desfazer.item.id)
        );
        if (desfazer.lancamentoVinculado) {
          const idVinc = desfazer.lancamentoVinculado.id;
          setLancamentos((anteriores) =>
            anteriores.filter((item) => item.id !== idVinc)
          );
        }
      } else {
        setEntregas((anteriores) => [desfazer.item, ...anteriores]);
        if (desfazer.lancamentoVinculado) {
          const lancVinc = desfazer.lancamentoVinculado;
          setLancamentos((anteriores) => [lancVinc, ...anteriores]);
        }
      }
    } else {
      setTrajetos((anteriores) => [desfazer.item, ...anteriores]);
    }
    setDesfazer(null);
  };

  const handleTrocarAba = (novaAba: AbaPrincipal) => {
    setAbaAtiva(novaAba);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleIrParaAjustes = () => {
    setAbaAtiva('ajustes');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleMudarTema = (novoTema: PreferenciaTema) => {
    setTema(novoTema);
    salvarTema(novoTema);
  };

  const handleMudarAltoContraste = (ativo: boolean) => {
    setAltoContraste(ativo);
    salvarAltoContraste(ativo);
  };

  const handleMudarMetaDiaria = (novaMeta: number) => {
    setMetaDiaria(novaMeta);
    salvarMetaDiaria(novaMeta);
  };

  const handleMudarMinLucroKm = (novoMin: number) => {
    setMinLucroKm(novoMin);
    salvarMinLucroKm(novoMin);
  };

  const handleMudarPercentualReserva = (novoPercentual: number) => {
    const limitado = Math.max(
      0,
      Math.min(100, Number(novoPercentual.toFixed(1)))
    );
    setPercentualReserva(limitado);
    salvarPercentualReserva(limitado);
  };

  const handleMudarConfigOleo = (novaConfig: ConfigTrocaOleo) => {
    setConfigOleo(novaConfig);
    salvarConfigOleo(novaConfig);
  };

  const handleMudarReservaKm = (valor: number) => {
    setReservaKm(valor);
    salvarReservaKm(valor);
  };

  const handleMudarReservaMes = (valor: number) => {
    setReservaMes(valor);
    salvarReservaMes(valor);
  };

  const handleMudarVencimentos = (novos: Vencimento[]) => {
    setVencimentos(novos);
    salvarVencimentos(novos);
  };

  const handleOdometroStatusChange = useCallback(
    (info: {
      status: StatusOdometro;
      km: number;
      tempoSegundos: number;
      entregaAtiva: boolean;
      kmEntregaAtual: number;
      velocidadeKmh: number | null;
    }) => {
      setOdometroInfo(info);
    },
    []
  );

  const handleAdicionarLancamento = (
    dados: {
      tipo: TipoLancamento;
      categoria: Plataforma | CategoriaGasto;
      valor: number;
      observacao?: string;
      kmEntrega?: number;
      duracaoEntregaSegundos?: number;
      entregas?: number;
    },
    opcoes?: { suprimirToast?: boolean }
  ): Lancamento => {
    const novo: Lancamento = {
      id: gerarId(),
      tipo: dados.tipo,
      categoria: dados.categoria,
      valor: dados.valor,
      data: new Date().toISOString(),
      observacao: dados.observacao,
      kmEntrega: dados.kmEntrega,
      duracaoEntregaSegundos: dados.duracaoEntregaSegundos,
      entregas:
        dados.tipo === TipoLancamento.GANHO &&
        typeof dados.entregas === 'number' &&
        Number.isFinite(dados.entregas) &&
        Math.floor(dados.entregas) >= 1
          ? Math.floor(dados.entregas)
          : undefined,
    };
    setLancamentos((anteriores) => [novo, ...anteriores]);
    if (!opcoes?.suprimirToast) {
      agendarDesfazer({
        acao: 'adicionado',
        tipo: 'lancamento',
        item: novo,
        rotulo: `${rotuloCategoria(novo.categoria)} (${formatarMoeda(novo.valor)})`,
      });
    }
    return novo;
  };

  const handleFinalizarEntregaOdometro = (dados: DadosEntregaFinalizada) => {
    let lancamentoCriado: Lancamento | undefined;
    if (
      typeof dados.valor === 'number' &&
      dados.valor > 0 &&
      dados.plataforma
    ) {
      lancamentoCriado = handleAdicionarLancamento(
        {
          tipo: TipoLancamento.GANHO,
          categoria: dados.plataforma,
          valor: dados.valor,
          entregas: 1,
        },
        { suprimirToast: true }
      );
    }

    const novaEntrega: Entrega = {
      id: gerarId(),
      inicioIso: dados.inicioIso,
      fimIso: dados.fimIso,
      km: Number(Math.max(0, dados.km).toFixed(2)),
      duracaoSegundos: Math.max(0, Math.floor(dados.duracaoSegundos)),
      valor:
        typeof dados.valor === 'number' && dados.valor > 0
          ? Number(dados.valor.toFixed(2))
          : undefined,
      plataforma: dados.plataforma,
      lancamentoId: lancamentoCriado?.id,
    };

    setEntregas((anteriores) => [novaEntrega, ...anteriores]);

    if (lancamentoCriado) {
      agendarDesfazer({
        acao: 'adicionado',
        tipo: 'entrega',
        item: novaEntrega,
        lancamentoVinculado: lancamentoCriado,
        rotulo: `${rotuloCategoria(dados.plataforma!)} (${formatarMoeda(lancamentoCriado.valor)})`,
      });
    } else {
      agendarDesfazer({
        acao: 'adicionado',
        tipo: 'entrega',
        item: novaEntrega,
        rotulo: `Entrega de ${formatarKm(novaEntrega.km)} km`,
      });
    }
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
      acao: 'excluido',
      tipo: 'lancamento',
      item: encontrado,
      rotulo: `${rotuloCategoria(encontrado.categoria)} (${formatarMoeda(encontrado.valor)})`,
    });
  };

  const handleExcluirEntrega = (
    id: string,
    excluirLancamentoVinculado: boolean
  ) => {
    const encontrada = entregas.find((item) => item.id === id);
    if (!encontrada) return;
    setEntregas((anteriores) => anteriores.filter((item) => item.id !== id));

    let lancamentoVinculado: Lancamento | undefined;
    if (excluirLancamentoVinculado && encontrada.lancamentoId) {
      lancamentoVinculado = lancamentos.find(
        (l) => l.id === encontrada.lancamentoId
      );
      if (lancamentoVinculado) {
        const idVinc = lancamentoVinculado.id;
        setLancamentos((anteriores) =>
          anteriores.filter((item) => item.id !== idVinc)
        );
      }
    }

    agendarDesfazer({
      acao: 'excluido',
      tipo: 'entrega',
      item: encontrada,
      lancamentoVinculado,
      rotulo: `Entrega de ${formatarKm(encontrada.km)} km`,
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
      acao: 'excluido',
      tipo: 'trajeto',
      item: encontrado,
      rotulo: `Trajeto de ${formatarKm(encontrado.km)} km`,
    });
  };

  const handleRestaurarBackup = (dados: DadosRestauracao) => {
    setLancamentos(dados.lancamentos);
    setTrajetos(dados.trajetos);
    setMetaDiaria(dados.metaDiaria);
    salvarMetaDiaria(dados.metaDiaria);
    if (dados.configOleo) {
      handleMudarConfigOleo(dados.configOleo);
    }
    if (typeof dados.percentualReserva === 'number') {
      handleMudarPercentualReserva(dados.percentualReserva);
    }
    if (typeof dados.minLucroKm === 'number') {
      handleMudarMinLucroKm(dados.minLucroKm);
    }
    if (typeof dados.reservaKm === 'number') {
      handleMudarReservaKm(dados.reservaKm);
    }
    if (typeof dados.reservaMes === 'number') {
      handleMudarReservaMes(dados.reservaMes);
    }
    if (Array.isArray(dados.vencimentos)) {
      handleMudarVencimentos(dados.vencimentos);
    }
    if (Array.isArray(dados.entregas)) {
      setEntregas(dados.entregas);
    }
    if (typeof dados.altoContraste === 'boolean') {
      handleMudarAltoContraste(dados.altoContraste);
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

  const entregasDoPeriodo = useMemo(
    () => filtrarEntregasPorPeriodo(entregas, periodo),
    [entregas, periodo]
  );

  const kmEmAndamento =
    odometroInfo.status !== 'idle' ? odometroInfo.km : 0;
  const kmEntregaEmAndamento =
    odometroInfo.entregaAtiva ? odometroInfo.kmEntregaAtual : 0;
  const tempoEmAndamentoSegundos =
    odometroInfo.status !== 'idle' ? odometroInfo.tempoSegundos : 0;

  const lancamentosHoje = useMemo(
    () =>
      filtrarPorPeriodo(lancamentos, FiltroPeriodo.HOJE).sort(
        (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
      ),
    [lancamentos]
  );

  const entregasHoje = useMemo(
    () => filtrarEntregasPorPeriodo(entregas, FiltroPeriodo.HOJE),
    [entregas]
  );

  const resumoHoje = useMemo(() => {
    const trajHoje = filtrarPorPeriodo(trajetos, FiltroPeriodo.HOJE);
    const ganhosLista = lancamentosHoje.filter(
      (l) => l.tipo === TipoLancamento.GANHO
    );
    const ganhos = ganhosLista.reduce((acc, l) => acc + l.valor, 0);
    const entregasQtd = ganhosLista.reduce(
      (acc, l) => acc + obterEntregasLancamento(l),
      0
    );
    const idsLancamentoEntregas = new Set(
      entregasHoje.map((e) => e.lancamentoId).filter(Boolean)
    );
    const kmEntregasRegistradasHoje = entregasHoje.reduce(
      (acc, e) => acc + e.km,
      0
    );
    const kmEmEntregaLegado = ganhosLista.reduce(
      (acc, l) =>
        acc +
        (!idsLancamentoEntregas.has(l.id) &&
        typeof l.kmEntrega === 'number' &&
        l.kmEntrega > 0
          ? l.kmEntrega
          : 0),
      0
    );
    const gastos = lancamentosHoje
      .filter((l) => l.tipo === TipoLancamento.GASTO)
      .reduce((acc, l) => acc + l.valor, 0);
    const km = trajHoje.reduce((acc, t) => acc + t.km, 0) + kmEmAndamento;
    const kmEmEntrega =
      kmEntregasRegistradasHoje + kmEmEntregaLegado + kmEntregaEmAndamento;
    const kmDeslocamento = Math.max(0, km - kmEmEntrega);
    const tempoTotalSegundos =
      trajHoje.reduce((acc, t) => acc + (t.duracaoSegundos ?? 0), 0) +
      tempoEmAndamentoSegundos;
    return {
      ganhos,
      gastos,
      lucro: ganhos - gastos,
      km,
      kmEmEntrega,
      kmDeslocamento,
      temEntregaNoDia: entregasHoje.length > 0,
      entregas: entregasQtd,
      tempoTotalSegundos,
    };
  }, [
    lancamentosHoje,
    entregasHoje,
    trajetos,
    kmEmAndamento,
    kmEntregaEmAndamento,
    tempoEmAndamentoSegundos,
  ]);

  const ultimosDoisLancamentos = useMemo(
    () => lancamentosHoje.slice(0, 2),
    [lancamentosHoje]
  );

  const progressoMetaHoje =
    metaDiaria > 0
      ? Math.min(100, (resumoHoje.ganhos / metaDiaria) * 100)
      : 0;
  const faltamMetaHoje = Math.max(0, metaDiaria - resumoHoje.ganhos);

  const ganhoPorKmHoje =
    resumoHoje.km > 0 ? resumoHoje.ganhos / resumoHoje.km : 0;
  const custoPorKmHoje =
    resumoHoje.km > 0 ? resumoHoje.gastos / resumoHoje.km : 0;
  const lucroPorKmHoje =
    resumoHoje.km > 0 ? resumoHoje.lucro / resumoHoje.km : 0;
  const lucroRealPorKmHoje = lucroPorKmHoje - reservaKm;
  const compensouHoje =
    resumoHoje.km > 0 && lucroPorKmHoje > 0 && lucroPorKmHoje >= minLucroKm;

  const valorPorEntregaHoje =
    resumoHoje.entregas > 0 ? resumoHoje.ganhos / resumoHoje.entregas : 0;
  const entregasPorHoraHoje =
    resumoHoje.tempoTotalSegundos > 0
      ? resumoHoje.entregas / (resumoHoje.tempoTotalSegundos / 3600)
      : null;

  const avisoVencimento = useMemo(
    () => obterAvisoVencimentoMaisProximo(vencimentos),
    [vencimentos]
  );

  const dataHojeFormatada = useMemo(() => formatarDataPorExtenso(new Date()), []);

  const paddingBottomClass =
    abaAtiva === 'hoje'
      ? 'pb-[calc(136px+env(safe-area-inset-bottom))]'
      : 'pb-[calc(84px+env(safe-area-inset-bottom))]';

  return (
    <div
      className={`rota-no-print min-h-[100dvh] w-full overflow-x-hidden bg-[var(--rota-bg)] px-4 pt-2 ${paddingBottomClass}`}
    >
      <main className="mx-auto w-full max-w-[460px]">
        {/* Aba 1: Hoje */}
        <div
          role="tabpanel"
          aria-hidden={abaAtiva !== 'hoje'}
          className={abaAtiva === 'hoje' ? 'space-y-2.5' : 'hidden'}
        >
          {/* 1. Cabeçalho */}
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-[24px] leading-[28px] font-extrabold text-[var(--rota-text)]">
                Hoje
              </h1>
              <p className="truncate text-[13px] font-semibold text-[var(--rota-text-soft)]">
                {dataHojeFormatada}
              </p>
            </div>

            {(avisoVencimento || odometroInfo.status === 'running') && (
              <div className="flex flex-wrap items-center justify-end gap-1.5 max-w-full">
                {avisoVencimento && (
                  <button
                    type="button"
                    onClick={handleIrParaAjustes}
                    className={`inline-flex min-h-[48px] max-w-full items-center rounded-[14px] px-3 text-[13px] font-extrabold active:scale-[0.98] ${
                      avisoVencimento.vencido
                        ? 'bg-[var(--rota-danger-tint)] text-[var(--rota-danger)]'
                        : 'bg-[var(--rota-surface-2)] text-[var(--rota-text)]'
                    }`}
                  >
                    <span className="truncate">{avisoVencimento.texto}</span>
                  </button>
                )}

                {odometroInfo.status === 'running' && (
                  <span className="inline-flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-full bg-[var(--rota-success-tint)] px-2.5 py-1 text-[13px] font-extrabold text-[var(--rota-success)]">
                    <span
                      className="h-2 w-2 rounded-full bg-[var(--rota-success)]"
                      aria-hidden="true"
                    />
                    GPS ativo
                  </span>
                )}
              </div>
            )}
          </header>

          {/* 2. Cartão de ganhos */}
          <section aria-label="Ganhos de hoje" className="rota-card px-4 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="block text-[13px] font-bold text-[var(--rota-text-soft)]">
                Ganhos de hoje
              </span>
              <span className="text-[13px] font-bold text-[var(--rota-text-soft)] tabular-nums">
                {resumoHoje.entregas}{' '}
                {resumoHoje.entregas === 1 ? 'entrega' : 'entregas'}
              </span>
            </div>
            <span className="mt-0.5 block text-[38px] leading-[42px] font-extrabold text-[var(--rota-text)] tabular-nums">
              {formatarMoeda(resumoHoje.ganhos)}
            </span>

            {metaDiaria > 0 ? (
              <>
                <div
                  role="progressbar"
                  aria-label="Progresso da meta diária"
                  aria-valuemin={0}
                  aria-valuemax={metaDiaria}
                  aria-valuenow={Math.min(resumoHoje.ganhos, metaDiaria)}
                  className="mt-2 h-[10px] w-full overflow-hidden rounded-full bg-[var(--rota-surface-2)]"
                >
                  <div
                    className="h-full rounded-full bg-[var(--rota-accent)] transition-all duration-300"
                    style={{ width: `${progressoMetaHoje}%` }}
                  />
                </div>

                <div className="mt-1.5 flex items-center justify-between gap-2 text-[13px] font-semibold tabular-nums">
                  <span className="text-[var(--rota-text-soft)]">
                    {Math.round(progressoMetaHoje)}% da meta de{' '}
                    {formatarMoeda(metaDiaria)}
                  </span>
                  <span className="text-[var(--rota-text)] font-bold shrink-0">
                    {faltamMetaHoje > 0
                      ? `faltam ${formatarMoeda(faltamMetaHoje)}`
                      : 'meta batida'}
                  </span>
                </div>
              </>
            ) : (
              <div className="mt-1.5">
                <button
                  type="button"
                  onClick={handleIrParaAjustes}
                  className="inline-flex h-[48px] items-center rounded-[14px] bg-[var(--rota-accent-tint)] px-3.5 text-[14px] font-extrabold text-[var(--rota-accent)] active:scale-[0.98]"
                >
                  Definir meta
                </button>
              </div>
            )}

            <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--rota-line)] pt-2 text-[13px] font-semibold text-[var(--rota-text-soft)] tabular-nums">
              <span>
                {resumoHoje.entregas > 0
                  ? `${formatarMoeda(valorPorEntregaHoje)} por entrega`
                  : '— por entrega'}
              </span>
              <span className="shrink-0">
                {entregasPorHoraHoje !== null
                  ? `${entregasPorHoraHoje.toFixed(1).replace('.', ',')} entregas/h`
                  : '—'}
              </span>
            </div>
          </section>

          {/* 3. Cartão com 3 colunas: Gastos, Lucro, Distância + separação Em entrega / Deslocamento */}
          <section
            aria-label="Resumo rápido de hoje"
            className="rota-card px-4 py-2.5"
          >
            <div className="grid grid-cols-3 divide-x divide-[var(--rota-line)]">
              <div className="min-w-0 pr-2">
                <span className="block text-[13px] font-bold text-[var(--rota-text-soft)]">
                  Gastos
                </span>
                <span className="mt-0.5 block truncate text-[20px] leading-[24px] font-extrabold text-[var(--rota-danger)] tabular-nums">
                  {formatarMoeda(resumoHoje.gastos)}
                </span>
              </div>

              <div className="min-w-0 px-2.5">
                <span className="block text-[13px] font-bold text-[var(--rota-text-soft)]">
                  Lucro
                </span>
                <span
                  className={`mt-0.5 block truncate text-[20px] leading-[24px] font-extrabold tabular-nums ${
                    resumoHoje.lucro > 0
                      ? 'text-[var(--rota-success)]'
                      : resumoHoje.lucro < 0
                        ? 'text-[var(--rota-danger)]'
                        : 'text-[var(--rota-text)]'
                  }`}
                >
                  {formatarMoeda(resumoHoje.lucro)}
                </span>
              </div>

              <div className="min-w-0 pl-2.5">
                <span className="block text-[13px] font-bold text-[var(--rota-text-soft)]">
                  Distância
                </span>
                <span className="mt-0.5 block truncate text-[20px] leading-[24px] font-extrabold text-[var(--rota-text)] tabular-nums">
                  {formatarKm(resumoHoje.km)} km
                </span>
              </div>
            </div>

            {resumoHoje.temEntregaNoDia && (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[var(--rota-line)] pt-2 text-[13px] font-semibold text-[var(--rota-text-soft)] tabular-nums">
                <span>
                  Em entrega {formatarKm(resumoHoje.kmEmEntrega)} km ·{' '}
                  Deslocamento {formatarKm(resumoHoje.kmDeslocamento)} km
                </span>
              </div>
            )}
          </section>

          {/* 4. Cartão Lucro por km */}
          <section aria-label="Lucro por km de hoje" className="rota-card px-4 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-bold text-[var(--rota-text-soft)]">
                Lucro por km
              </span>
              {resumoHoje.km > 0 && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[13px] font-extrabold ${
                    compensouHoje
                      ? 'bg-[var(--rota-success-tint)] text-[var(--rota-success)]'
                      : 'bg-[var(--rota-danger-tint)] text-[var(--rota-danger)]'
                  }`}
                >
                  {compensouHoje ? 'Compensou' : 'Abaixo do mínimo'}
                </span>
              )}
            </div>

            <span className="mt-0.5 block text-[28px] leading-[32px] font-extrabold text-[var(--rota-text)] tabular-nums">
              {resumoHoje.km > 0 ? formatarMoeda(lucroPorKmHoje) : '—'}
            </span>

            <span className="mt-0.5 block text-[13px] font-semibold text-[var(--rota-text-soft)] tabular-nums">
              {formatarMoeda(ganhoPorKmHoje)} − {formatarMoeda(custoPorKmHoje)}{' '}
              por km
            </span>

            {reservaKm > 0 && (
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--rota-line)] pt-2 text-[13px] font-bold tabular-nums">
                <span className="text-[var(--rota-text-soft)]">
                  Lucro real por km
                </span>
                <span
                  className={
                    resumoHoje.km <= 0
                      ? 'text-[var(--rota-text)]'
                      : lucroRealPorKmHoje > 0
                        ? 'text-[var(--rota-success)]'
                        : lucroRealPorKmHoje < 0
                          ? 'text-[var(--rota-danger)]'
                          : 'text-[var(--rota-text)]'
                  }
                >
                  {resumoHoje.km > 0
                    ? formatarMoeda(lucroRealPorKmHoje)
                    : '—'}
                </span>
              </div>
            )}
          </section>

          {/* 5. Faixa do odômetro (sempre montada para manter GPS contínuo ao trocar de aba) */}
          <Odometro
            oculto={abaAtiva !== 'hoje'}
            lancamentos={lancamentos}
            entregas={entregas}
            triggerFinalizarSeq={triggerFinalizarSeq}
            onSalvarTrajeto={handleSalvarTrajeto}
            onFinalizarEntrega={handleFinalizarEntregaOdometro}
            onStatusChange={handleOdometroStatusChange}
          />

          {/* 6. Cartão com os 2 últimos lançamentos */}
          <section
            aria-label="Últimos lançamentos"
            className="rota-card overflow-hidden"
          >
            {ultimosDoisLancamentos.length === 0 ? (
              <div className="flex h-[56px] items-center justify-center px-4 text-[14px] font-semibold text-[var(--rota-text-soft)]">
                Nenhum lançamento hoje
              </div>
            ) : (
              <ul className="divide-y divide-[var(--rota-line)]">
                {ultimosDoisLancamentos.map((item) => {
                  const ehGanho = item.tipo === TipoLancamento.GANHO;
                  return (
                    <li
                      key={item.id}
                      className="flex h-[56px] items-center justify-between gap-3 px-4"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold text-[var(--rota-text)]">
                          {rotuloCategoria(item.categoria)}
                        </span>
                      </div>
                      <span className="shrink-0 text-[13px] font-semibold text-[var(--rota-text-soft)] tabular-nums">
                        {formatarHora(item.data)}
                      </span>
                      <span
                        className={`shrink-0 text-[15px] font-extrabold tabular-nums ${
                          ehGanho
                            ? 'text-[var(--rota-success)]'
                            : 'text-[var(--rota-danger)]'
                        }`}
                      >
                        {ehGanho ? '+' : '−'} {formatarMoeda(item.valor)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Aba 2: Resumo */}
        {abaAtiva === 'resumo' && (
          <div role="tabpanel">
            <Resumo
              periodo={periodo}
              onMudarPeriodo={setPeriodo}
              lancamentos={lancamentosDoPeriodo}
              todosLancamentos={lancamentos}
              trajetos={trajetosDoPeriodo}
              entregas={entregasDoPeriodo}
              kmEmAndamento={kmEmAndamento}
              kmEntregaEmAndamento={kmEntregaEmAndamento}
              tempoEmAndamentoSegundos={tempoEmAndamentoSegundos}
              reservaKm={reservaKm}
              reservaMes={reservaMes}
            />
          </div>
        )}

        {/* Aba 3: Histórico (exclusivo para lançamentos, entregas e trajetos) */}
        {abaAtiva === 'historico' && (
          <div role="tabpanel" className="space-y-3">
            <header>
              <h1 className="text-[26px] leading-[32px] font-extrabold text-[var(--rota-text)]">
                Histórico
              </h1>
            </header>

            <ListaLancamentos
              periodo={periodo}
              onMudarPeriodo={setPeriodo}
              lancamentos={lancamentosDoPeriodo}
              trajetos={trajetosDoPeriodo}
              entregas={entregasDoPeriodo}
              onEditarLancamento={handleEditarLancamento}
              onExcluirLancamento={handleExcluirLancamento}
              onExcluirTrajeto={handleExcluirTrajeto}
              onExcluirEntrega={handleExcluirEntrega}
            />
          </div>
        )}

        {/* Aba 4: Ajustes (Aparência, Meta diária, Lucro mínimo por km, Troca de óleo, Backup e CSV) */}
        {abaAtiva === 'ajustes' && (
          <div role="tabpanel" className="space-y-3">
            <header>
              <h1 className="text-[26px] leading-[32px] font-extrabold text-[var(--rota-text)]">
                Ajustes
              </h1>
            </header>

            <ManutencaoBackup
              tema={tema}
              onMudarTema={handleMudarTema}
              altoContraste={altoContraste}
              onMudarAltoContraste={handleMudarAltoContraste}
              todosLancamentos={lancamentos}
              todosTrajetos={trajetos}
              todasEntregas={entregas}
              metaDiaria={metaDiaria}
              onMudarMetaDiaria={handleMudarMetaDiaria}
              minLucroKm={minLucroKm}
              onMudarMinLucroKm={handleMudarMinLucroKm}
              reservaKm={reservaKm}
              onMudarReservaKm={handleMudarReservaKm}
              reservaMes={reservaMes}
              onMudarReservaMes={handleMudarReservaMes}
              vencimentos={vencimentos}
              onMudarVencimentos={handleMudarVencimentos}
              percentualReserva={percentualReserva}
              configOleoExterna={configOleo}
              onMudarConfigOleo={handleMudarConfigOleo}
              resumoHoje={{
                ganhos: resumoHoje.ganhos,
                gastos: resumoHoje.gastos,
                lucro: resumoHoje.lucro,
                km: resumoHoje.km,
                entregas: resumoHoje.entregas,
                lucroPorKm: lucroPorKmHoje,
              }}
              onRestaurarBackup={handleRestaurarBackup}
            />
          </div>
        )}
      </main>

      {/* 7. Botões fixos acima da barra inferior na aba Hoje (ou Finalizar entrega em movimento) */}
      {abaAtiva === 'hoje' && (
        <div className="fixed bottom-[calc(67px+env(safe-area-inset-bottom))] left-0 right-0 z-20 px-4 py-1.5 bg-[var(--rota-bg)]">
          <div className="mx-auto max-w-[460px]">
            {carregarModoMovimento() &&
            odometroInfo.status === 'running' &&
            odometroInfo.entregaAtiva &&
            odometroInfo.velocidadeKmh !== null &&
            odometroInfo.velocidadeKmh >= 15 ? (
              <button
                type="button"
                onClick={() => setTriggerFinalizarSeq((n) => n + 1)}
                className="flex h-[56px] w-full items-center justify-center rounded-[16px] bg-[var(--rota-success)] text-[16px] font-extrabold text-[var(--rota-on-success)] active:scale-[0.98]"
              >
                Finalizar entrega
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setSheetLancamento({
                      aberto: true,
                      tipo: TipoLancamento.GANHO,
                    })
                  }
                  className="flex h-[56px] items-center justify-center rounded-[16px] bg-[var(--rota-accent)] text-[16px] font-extrabold text-[var(--rota-on-accent)] active:scale-[0.98]"
                >
                  + Ganho
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSheetLancamento({
                      aberto: true,
                      tipo: TipoLancamento.GASTO,
                    })
                  }
                  className="flex h-[56px] items-center justify-center rounded-[16px] border-2 border-[var(--rota-line)] bg-[var(--rota-surface)] text-[16px] font-extrabold text-[var(--rota-text)] active:scale-[0.98]"
                >
                  − Gasto
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Formulário Novo lançamento em bottom sheet */}
      <FormLancamento
        aberto={sheetLancamento.aberto}
        tipoInicial={sheetLancamento.tipo}
        lancamentos={lancamentos}
        onFechar={() => setSheetLancamento((prev) => ({ ...prev, aberto: false }))}
        onAdicionar={(dados) => {
          handleAdicionarLancamento(dados);
        }}
      />

      {/* Toast flutuante para desfazer */}
      {desfazer && (
        <div
          role="status"
          className={`fixed left-4 right-4 z-40 mx-auto max-w-[460px] flex items-center justify-between gap-3 rounded-[16px] border border-[var(--rota-line)] bg-[var(--rota-surface)] px-4 py-2 ${
            abaAtiva === 'hoje'
              ? 'bottom-[calc(138px+env(safe-area-inset-bottom))]'
              : 'bottom-[calc(80px+env(safe-area-inset-bottom))]'
          }`}
        >
          <span className="truncate text-[13px] font-bold text-[var(--rota-text)]">
            {desfazer.tipo === 'entrega' && desfazer.acao === 'adicionado'
              ? `Adicionado · ${desfazer.rotulo}`
              : `${desfazer.acao === 'adicionado' ? 'Salvo: ' : 'Excluído: '}${desfazer.rotulo}`}
          </span>
          <button
            type="button"
            onClick={handleExecutarDesfazer}
            className="inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-[12px] bg-[var(--rota-accent)] px-4 text-[13px] font-extrabold text-[var(--rota-on-accent)] active:scale-[0.98]"
          >
            Desfazer
          </button>
        </div>
      )}

      {!isOnline && !desfazer && (
        <div
          role="status"
          className={`fixed left-4 right-4 z-40 mx-auto max-w-[460px] flex items-center justify-center rounded-[14px] border border-[var(--rota-line)] bg-[var(--rota-surface)] px-4 py-2 text-[13px] font-bold text-[var(--rota-text-soft)] ${
            abaAtiva === 'hoje'
              ? 'bottom-[calc(138px+env(safe-area-inset-bottom))]'
              : 'bottom-[calc(80px+env(safe-area-inset-bottom))]'
          }`}
        >
          Modo offline · Dados salvos no aparelho
        </div>
      )}

      {/* Barra de navegação inferior: 4 abas (~76px incluindo safe-area) */}
      <nav
        aria-label="Navegação principal"
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--rota-line)] bg-[var(--rota-surface)] pb-[env(safe-area-inset-bottom)]"
      >
        <div
          role="tablist"
          aria-label="Seções do aplicativo"
          className="mx-auto grid max-w-[460px] grid-cols-4 px-2 py-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={abaAtiva === 'hoje'}
            onClick={() => handleTrocarAba('hoje')}
            className={`flex min-h-[58px] flex-col items-center justify-center gap-0.5 rounded-[12px] text-[13px] whitespace-nowrap transition-colors ${
              abaAtiva === 'hoje'
                ? 'font-extrabold text-[var(--rota-accent)]'
                : 'font-semibold text-[var(--rota-text-soft)]'
            }`}
          >
            <Home className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden="true" />
            Hoje
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={abaAtiva === 'resumo'}
            onClick={() => handleTrocarAba('resumo')}
            className={`flex min-h-[58px] flex-col items-center justify-center gap-0.5 rounded-[12px] text-[13px] whitespace-nowrap transition-colors ${
              abaAtiva === 'resumo'
                ? 'font-extrabold text-[var(--rota-accent)]'
                : 'font-semibold text-[var(--rota-text-soft)]'
            }`}
          >
            <BarChart3
              className="h-5 w-5 shrink-0"
              strokeWidth={2}
              aria-hidden="true"
            />
            Resumo
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={abaAtiva === 'historico'}
            onClick={() => handleTrocarAba('historico')}
            className={`flex min-h-[58px] flex-col items-center justify-center gap-0.5 rounded-[12px] text-[13px] whitespace-nowrap transition-colors ${
              abaAtiva === 'historico'
                ? 'font-extrabold text-[var(--rota-accent)]'
                : 'font-semibold text-[var(--rota-text-soft)]'
            }`}
          >
            <Clock
              className="h-5 w-5 shrink-0"
              strokeWidth={2}
              aria-hidden="true"
            />
            Histórico
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={abaAtiva === 'ajustes'}
            onClick={() => handleTrocarAba('ajustes')}
            className={`flex min-h-[58px] flex-col items-center justify-center gap-0.5 rounded-[12px] text-[13px] whitespace-nowrap transition-colors ${
              abaAtiva === 'ajustes'
                ? 'font-extrabold text-[var(--rota-accent)]'
                : 'font-semibold text-[var(--rota-text-soft)]'
            }`}
          >
            <SlidersHorizontal
              className="h-5 w-5 shrink-0"
              strokeWidth={2}
              aria-hidden="true"
            />
            Ajustes
          </button>
        </div>
      </nav>
    </div>
  );
}
