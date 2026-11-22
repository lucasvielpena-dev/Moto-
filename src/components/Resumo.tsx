import React, { useMemo, useState } from 'react';
import {
  FiltroPeriodo,
  Lancamento,
  PLATAFORMAS,
  Plataforma,
  TipoLancamento,
  Trajeto,
} from '../types';
import { formatarKm, formatarMoeda, rotuloCategoria } from '../utils/formatters';
import { obterEntregasLancamento } from '../utils/storage';

interface ResumoProps {
  periodo: FiltroPeriodo;
  onMudarPeriodo: (periodo: FiltroPeriodo) => void;
  lancamentos: Lancamento[];
  todosLancamentos: Lancamento[];
  trajetos: Trajeto[];
  kmEmAndamento?: number;
  kmEntregaEmAndamento?: number;
  tempoEmAndamentoSegundos?: number;
  reservaKm?: number;
  reservaMes?: number;
}

interface DadoDiaGrafico {
  chave: string;
  rotulo: string;
  lucro: number;
  ehHoje: boolean;
}

const OPCOES_PERIODO: { valor: FiltroPeriodo; rotulo: string }[] = [
  { valor: FiltroPeriodo.HOJE, rotulo: 'Hoje' },
  { valor: FiltroPeriodo.SETE_DIAS, rotulo: '7 dias' },
  { valor: FiltroPeriodo.MES, rotulo: 'Mês' },
];

const DIAS_SEMANA_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_SEMANA_COMPLETOS = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

export const Resumo: React.FC<ResumoProps> = ({
  periodo,
  onMudarPeriodo,
  lancamentos,
  todosLancamentos,
  trajetos,
  kmEmAndamento = 0,
  kmEntregaEmAndamento = 0,
  tempoEmAndamentoSegundos = 0,
  reservaKm = 0,
  reservaMes = 0,
}) => {
  const [visaoKm, setVisaoKm] = useState<'total' | 'entregas'>('total');

  const totalGanhos = lancamentos
    .filter((l) => l.tipo === TipoLancamento.GANHO)
    .reduce((acc, l) => acc + l.valor, 0);

  const totalGastos = lancamentos
    .filter((l) => l.tipo === TipoLancamento.GASTO)
    .reduce((acc, l) => acc + l.valor, 0);

  const totalKmSalvos = trajetos.reduce((acc, t) => acc + t.km, 0);
  const totalKm = totalKmSalvos + kmEmAndamento;
  const tempoTotalSegundos =
    trajetos.reduce((acc, t) => acc + (t.duracaoSegundos ?? 0), 0) +
    tempoEmAndamentoSegundos;

  const entregasComKm = useMemo(
    () =>
      lancamentos.filter(
        (l) =>
          l.tipo === TipoLancamento.GANHO &&
          typeof l.kmEntrega === 'number' &&
          l.kmEntrega > 0
      ),
    [lancamentos]
  );

  const kmEntregasSalvos = entregasComKm.reduce(
    (acc, l) => acc + (l.kmEntrega ?? 0),
    0
  );
  const kmEntregas = kmEntregasSalvos + kmEntregaEmAndamento;
  const kmDeslocamento = Math.max(0, totalKm - kmEntregas);
  const percentualKmEntrega =
    totalKm > 0 ? Math.min(100, (kmEntregas / totalKm) * 100) : 0;
  const percentualKmDeslocamento =
    totalKm > 0 ? Math.max(0, 100 - percentualKmEntrega) : 0;

  const receitaEntregas = entregasComKm.reduce((acc, l) => acc + l.valor, 0);

  const modoEntregas = visaoKm === 'entregas';
  const receitaExibida = modoEntregas ? receitaEntregas : totalGanhos;
  const gastosExibidos =
    modoEntregas && entregasComKm.length === 0 ? 0 : totalGastos;
  const lucroExibido = receitaExibida - gastosExibidos;
  const kmExibido = modoEntregas ? kmEntregas : totalKm;

  const entregasPeriodo = useMemo(() => {
    const base = modoEntregas
      ? entregasComKm
      : lancamentos.filter((l) => l.tipo === TipoLancamento.GANHO);
    return base.reduce((acc, l) => acc + obterEntregasLancamento(l), 0);
  }, [lancamentos, entregasComKm, modoEntregas]);

  const valorPorEntrega =
    entregasPeriodo > 0 ? receitaExibida / entregasPeriodo : 0;
  const entregasPorHora =
    tempoTotalSegundos > 0
      ? entregasPeriodo / (tempoTotalSegundos / 3600)
      : null;

  const ganhoPorKm = kmExibido > 0 ? receitaExibida / kmExibido : 0;
  const custoPorKm = kmExibido > 0 ? gastosExibidos / kmExibido : 0;
  const lucroPorKm = kmExibido > 0 ? lucroExibido / kmExibido : 0;
  const lucroRealPorKm = lucroPorKm - reservaKm;

  const mostrarReservasMes =
    periodo === FiltroPeriodo.MES && (reservaKm > 0 || reservaMes > 0);
  const totalReservarMes = reservaKm * kmExibido + reservaMes;
  const lucroLivreMes = lucroExibido - totalReservarMes;

  const ganhosPorPlataforma = PLATAFORMAS.map((plat: Plataforma) => {
    const itens = lancamentos.filter(
      (l) => l.tipo === TipoLancamento.GANHO && l.categoria === plat
    );
    const soma = itens.reduce((acc, l) => acc + l.valor, 0);
    const entregasPlat = itens.reduce(
      (acc, l) => acc + obterEntregasLancamento(l),
      0
    );
    return {
      plataforma: rotuloCategoria(plat),
      total: soma,
      entregas: entregasPlat,
      valorPorEntrega: entregasPlat > 0 ? soma / entregasPlat : 0,
      percentual: totalGanhos > 0 ? (soma / totalGanhos) * 100 : 0,
    };
  });

  const dadosUltimos7Dias = useMemo<DadoDiaGrafico[]>(() => {
    const hoje = new Date();
    const ganhosPorDia = new Map<string, number>();
    const gastosPorDia = new Map<string, number>();

    for (const item of todosLancamentos) {
      const d = new Date(item.data);
      if (Number.isNaN(d.getTime())) continue;
      const chave = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (item.tipo === TipoLancamento.GANHO) {
        ganhosPorDia.set(chave, (ganhosPorDia.get(chave) ?? 0) + item.valor);
      } else {
        gastosPorDia.set(chave, (gastosPorDia.get(chave) ?? 0) + item.valor);
      }
    }

    const lista: DadoDiaGrafico[] = [];
    for (let offset = 6; offset >= 0; offset--) {
      const dia = new Date(
        hoje.getFullYear(),
        hoje.getMonth(),
        hoje.getDate() - offset
      );
      const chave = `${dia.getFullYear()}-${dia.getMonth()}-${dia.getDate()}`;
      const nomeDia = DIAS_SEMANA_CURTOS[dia.getDay()];
      const ganhosDia = ganhosPorDia.get(chave) ?? 0;
      const gastosDia = gastosPorDia.get(chave) ?? 0;

      lista.push({
        chave,
        rotulo: offset === 0 ? 'Hoje' : nomeDia,
        lucro: Number((ganhosDia - gastosDia).toFixed(2)),
        ehHoje: offset === 0,
      });
    }
    return lista;
  }, [todosLancamentos]);

  const maxAbsLucro7Dias = Math.max(
    1,
    ...dadosUltimos7Dias.map((d) => Math.abs(d.lucro))
  );

  // Melhores dias e horários (visível apenas se houver lançamentos em pelo menos 14 dias diferentes)
  const analiseMelhoresDiasHorarios = useMemo(() => {
    const diasComDados = new Map<string, number>(); // chaveDia -> diaSemana (0..6)
    const somaGanhosPorDiaSemana = [0, 0, 0, 0, 0, 0, 0];
    const somaGanhosPorFaixa = {
      madrugada: 0,
      manha: 0,
      tarde: 0,
      noite: 0,
    };

    for (const item of todosLancamentos) {
      const d = new Date(item.data);
      if (Number.isNaN(d.getTime())) continue;
      const chaveDia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!diasComDados.has(chaveDia)) {
        diasComDados.set(chaveDia, d.getDay());
      }

      if (item.tipo === TipoLancamento.GANHO) {
        const diaSem = d.getDay();
        somaGanhosPorDiaSemana[diaSem] += item.valor;
        const hora = d.getHours();
        if (hora >= 6 && hora < 12) {
          somaGanhosPorFaixa.manha += item.valor;
        } else if (hora >= 12 && hora < 18) {
          somaGanhosPorFaixa.tarde += item.valor;
        } else if (hora >= 18) {
          somaGanhosPorFaixa.noite += item.valor;
        } else {
          somaGanhosPorFaixa.madrugada += item.valor;
        }
      }
    }

    const totalDiasUnicos = diasComDados.size;
    if (totalDiasUnicos < 14) {
      return null;
    }

    const qtdDiasPorSemana = [0, 0, 0, 0, 0, 0, 0];
    for (const diaSem of diasComDados.values()) {
      qtdDiasPorSemana[diaSem] += 1;
    }

    const mediasDiasSemana = DIAS_SEMANA_CURTOS.map((rotulo, idx) => {
      const qtd = qtdDiasPorSemana[idx];
      const media = qtd > 0 ? somaGanhosPorDiaSemana[idx] / qtd : 0;
      return {
        diaSemana: idx,
        rotulo,
        nomeCompleto: DIAS_SEMANA_COMPLETOS[idx],
        media,
      };
    });

    const melhorDia = mediasDiasSemana.reduce((melhor, atual) =>
      atual.media > melhor.media ? atual : melhor
    );
    const maxMediaDiaSemana = Math.max(
      1,
      ...mediasDiasSemana.map((d) => d.media)
    );

    const faixas = [
      {
        id: 'manha',
        rotulo: 'Manhã (6–12h)',
        media: somaGanhosPorFaixa.manha / totalDiasUnicos,
      },
      {
        id: 'tarde',
        rotulo: 'Tarde (12–18h)',
        media: somaGanhosPorFaixa.tarde / totalDiasUnicos,
      },
      {
        id: 'noite',
        rotulo: 'Noite (18–24h)',
        media: somaGanhosPorFaixa.noite / totalDiasUnicos,
      },
      {
        id: 'madrugada',
        rotulo: 'Madrugada (0–6h)',
        media: somaGanhosPorFaixa.madrugada / totalDiasUnicos,
      },
    ];

    const melhorFaixa = faixas.reduce((melhor, atual) =>
      atual.media > melhor.media ? atual : melhor
    );

    return {
      melhorDia,
      melhorFaixa,
      mediasDiasSemana,
      maxMediaDiaSemana,
    };
  }, [todosLancamentos]);

  return (
    <div className="space-y-3">
      {/* Título + alternador compacto Total / Entregas */}
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-[24px] leading-[28px] font-extrabold tracking-tight text-[var(--rota-text)]">
          Resumo
        </h1>

        <div
          role="tablist"
          aria-label="Modo de cálculo por quilômetro"
          className="rota-segmented grid-cols-2 w-[196px]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={visaoKm === 'total'}
            onClick={() => setVisaoKm('total')}
            className={`rota-segmented-btn ${
              visaoKm === 'total'
                ? 'rota-segmented-btn-active'
                : 'rota-segmented-btn-idle'
            }`}
          >
            Total
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={visaoKm === 'entregas'}
            onClick={() => setVisaoKm('entregas')}
            className={`rota-segmented-btn ${
              visaoKm === 'entregas'
                ? 'rota-segmented-btn-active'
                : 'rota-segmented-btn-idle'
            }`}
          >
            Entregas
          </button>
        </div>
      </header>

      {/* Seletor Hoje | 7 dias | Mês */}
      <div
        role="tablist"
        aria-label="Filtrar resumo por período"
        className="rota-segmented grid-cols-3"
      >
        {OPCOES_PERIODO.map((opcao) => {
          const ativo = periodo === opcao.valor;
          return (
            <button
              key={opcao.valor}
              type="button"
              role="tab"
              aria-selected={ativo}
              onClick={() => onMudarPeriodo(opcao.valor)}
              className={`rota-segmented-btn ${
                ativo
                  ? 'rota-segmented-btn-active'
                  : 'rota-segmented-btn-idle'
              }`}
            >
              {opcao.rotulo}
            </button>
          );
        })}
      </div>

      {/* Cartão Lucro por km · N km rodados */}
      <section aria-label="Lucro por quilômetro" className="rota-card px-4 py-3.5">
        <span className="block text-[13px] font-bold text-[var(--rota-text-soft)] tabular-nums">
          Lucro por km · {formatarKm(kmExibido)} km rodados
        </span>
        <span
          className={`mt-1 block text-[40px] leading-[44px] font-extrabold tabular-nums ${
            kmExibido <= 0
              ? 'text-[var(--rota-text)]'
              : lucroPorKm > 0
                ? 'text-[var(--rota-success)]'
                : lucroPorKm < 0
                  ? 'text-[var(--rota-danger)]'
                  : 'text-[var(--rota-text)]'
          }`}
        >
          {kmExibido > 0 ? formatarMoeda(lucroPorKm) : '—'}
        </span>
        <span className="mt-1 block text-[13px] font-semibold text-[var(--rota-text-soft)] tabular-nums">
          {formatarMoeda(ganhoPorKm)} − {formatarMoeda(custoPorKm)} por km
        </span>
        {reservaKm > 0 && (
          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[var(--rota-line)] pt-2.5 text-[13px] font-bold tabular-nums">
            <span className="text-[var(--rota-text-soft)]">
              Lucro real por km
            </span>
            <span
              className={
                kmExibido <= 0
                  ? 'text-[var(--rota-text)]'
                  : lucroRealPorKm > 0
                    ? 'text-[var(--rota-success)]'
                    : lucroRealPorKm < 0
                      ? 'text-[var(--rota-danger)]'
                      : 'text-[var(--rota-text)]'
              }
            >
              {kmExibido > 0 ? formatarMoeda(lucroRealPorKm) : '—'}
            </span>
          </div>
        )}
      </section>

      {/* Cartão Separação de km: Em entrega vs Deslocamento */}
      <section
        aria-label="Separação de quilômetros"
        className="rota-card px-4 py-3.5 space-y-2.5"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-extrabold text-[var(--rota-text)]">
            Km em entrega vs deslocamento
          </h2>
          <span className="text-[13px] font-bold text-[var(--rota-text-soft)] tabular-nums">
            {formatarKm(totalKm)} km total
          </span>
        </div>

        <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--rota-surface-2)]">
          <div
            className="h-full rounded-full bg-[var(--rota-accent)] transition-all duration-300"
            style={{ width: `${percentualKmEntrega}%` }}
          />
        </div>

        <div className="grid grid-cols-2 divide-x divide-[var(--rota-line)] pt-0.5">
          <div className="min-w-0 pr-3">
            <span className="block text-[13px] font-bold text-[var(--rota-text-soft)] tabular-nums">
              Em entrega ({Math.round(percentualKmEntrega)}%)
            </span>
            <span className="mt-0.5 block truncate text-[18px] leading-[22px] font-extrabold text-[var(--rota-accent)] tabular-nums">
              {formatarKm(kmEntregas)} km
            </span>
          </div>

          <div className="min-w-0 pl-3">
            <span className="block text-[13px] font-bold text-[var(--rota-text-soft)] tabular-nums">
              Deslocamento ({Math.round(percentualKmDeslocamento)}%)
            </span>
            <span className="mt-0.5 block truncate text-[18px] leading-[22px] font-extrabold text-[var(--rota-text)] tabular-nums">
              {formatarKm(kmDeslocamento)} km
            </span>
          </div>
        </div>
      </section>

      {/* Cartão de 3 colunas: Ganhos, Gastos, Lucro (+ Reservas no Mês) */}
      <section
        aria-label="Totais do período"
        className="rota-card px-4 py-3.5 space-y-3"
      >
        <div className="grid grid-cols-3 divide-x divide-[var(--rota-line)]">
          <div className="min-w-0 pr-2">
            <span className="block text-[13px] font-bold text-[var(--rota-text-soft)]">
              Ganhos
            </span>
            <span className="mt-0.5 block truncate text-[20px] leading-[24px] font-extrabold text-[var(--rota-text)] tabular-nums">
              {formatarMoeda(receitaExibida)}
            </span>
          </div>

          <div className="min-w-0 px-2.5">
            <span className="block text-[13px] font-bold text-[var(--rota-text-soft)]">
              Gastos
            </span>
            <span className="mt-0.5 block truncate text-[20px] leading-[24px] font-extrabold text-[var(--rota-danger)] tabular-nums">
              {formatarMoeda(gastosExibidos)}
            </span>
          </div>

          <div className="min-w-0 pl-2.5">
            <span className="block text-[13px] font-bold text-[var(--rota-text-soft)]">
              Lucro
            </span>
            <span
              className={`mt-0.5 block truncate text-[20px] leading-[24px] font-extrabold tabular-nums ${
                lucroExibido > 0
                  ? 'text-[var(--rota-success)]'
                  : lucroExibido < 0
                    ? 'text-[var(--rota-danger)]'
                    : 'text-[var(--rota-text)]'
              }`}
            >
              {formatarMoeda(lucroExibido)}
            </span>
          </div>
        </div>

        {mostrarReservasMes && (
          <div className="grid grid-cols-2 divide-x divide-[var(--rota-line)] border-t border-[var(--rota-line)] pt-3">
            <div className="min-w-0 pr-3">
              <span className="block text-[13px] font-bold text-[var(--rota-text-soft)]">
                Reservar
              </span>
              <span className="mt-0.5 block truncate text-[18px] leading-[22px] font-extrabold text-[var(--rota-text)] tabular-nums">
                {formatarMoeda(totalReservarMes)}
              </span>
            </div>

            <div className="min-w-0 pl-3">
              <span className="block text-[13px] font-bold text-[var(--rota-text-soft)]">
                Lucro livre
              </span>
              <span
                className={`mt-0.5 block truncate text-[18px] leading-[22px] font-extrabold tabular-nums ${
                  lucroLivreMes > 0
                    ? 'text-[var(--rota-success)]'
                    : lucroLivreMes < 0
                      ? 'text-[var(--rota-danger)]'
                      : 'text-[var(--rota-text)]'
                }`}
              >
                {formatarMoeda(lucroLivreMes)}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Cartão de Entregas no período */}
      <section
        aria-label="Entregas do período"
        className="rota-card grid grid-cols-3 divide-x divide-[var(--rota-line)] px-4 py-3.5"
      >
        <div className="min-w-0 pr-2">
          <span className="block text-[13px] font-bold text-[var(--rota-text-soft)]">
            Entregas
          </span>
          <span className="mt-0.5 block truncate text-[20px] leading-[24px] font-extrabold text-[var(--rota-text)] tabular-nums">
            {entregasPeriodo}
          </span>
        </div>

        <div className="min-w-0 px-2.5">
          <span className="block text-[13px] font-bold text-[var(--rota-text-soft)]">
            Por entrega
          </span>
          <span className="mt-0.5 block truncate text-[20px] leading-[24px] font-extrabold text-[var(--rota-text)] tabular-nums">
            {entregasPeriodo > 0 ? formatarMoeda(valorPorEntrega) : '—'}
          </span>
        </div>

        <div className="min-w-0 pl-2.5">
          <span className="block text-[13px] font-bold text-[var(--rota-text-soft)]">
            Entregas/h
          </span>
          <span className="mt-0.5 block truncate text-[20px] leading-[24px] font-extrabold text-[var(--rota-text)] tabular-nums">
            {entregasPorHora !== null
              ? entregasPorHora.toFixed(1).replace('.', ',')
              : '—'}
          </span>
        </div>
      </section>

      {/* Cartão Lucro por dia (7 dias, divs proporcionais sem Recharts) */}
      <section aria-label="Lucro por dia" className="rota-card px-4 py-3.5">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-extrabold text-[var(--rota-text)]">
            Lucro por dia
          </h2>
          <span className="text-[13px] font-semibold text-[var(--rota-text-soft)] tabular-nums">
            Últimos 7 dias
          </span>
        </div>

        <div className="grid grid-cols-7 gap-2 items-end">
          {dadosUltimos7Dias.map((dia) => {
            const alturaPx =
              dia.lucro === 0
                ? 4
                : Math.max(
                    8,
                    Math.round((Math.abs(dia.lucro) / maxAbsLucro7Dias) * 72)
                  );
            const barraBg =
              dia.lucro < 0
                ? 'var(--rota-danger)'
                : dia.ehHoje
                  ? 'var(--rota-accent)'
                  : 'var(--rota-accent-tint)';

            return (
              <div
                key={dia.chave}
                className="flex flex-col items-center justify-end"
                title={`${dia.rotulo}: ${formatarMoeda(dia.lucro)}`}
              >
                <div className="flex h-[74px] w-full items-end justify-center border-b border-[var(--rota-line)] pb-1">
                  <div
                    className="w-full max-w-[28px] rounded-[6px] transition-all duration-300"
                    style={{
                      height: `${alturaPx}px`,
                      backgroundColor: barraBg,
                    }}
                  />
                </div>
                <span
                  className={`mt-1.5 text-[13px] leading-none ${
                    dia.ehHoje
                      ? 'font-extrabold text-[var(--rota-accent)]'
                      : 'font-semibold text-[var(--rota-text-soft)]'
                  }`}
                >
                  {dia.rotulo}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Cartão Melhores dias e horários (visível apenas >= 14 dias diferentes) */}
      {analiseMelhoresDiasHorarios && (
        <section
          aria-label="Melhores dias e horários"
          className="rota-card px-4 py-3.5 space-y-3"
        >
          <h2 className="text-[15px] font-extrabold text-[var(--rota-text)]">
            Melhores dias e horários
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <span className="block text-[13px] font-bold text-[var(--rota-text-soft)]">
                Melhor dia da semana
              </span>
              <span className="mt-0.5 block truncate text-[17px] leading-[22px] font-extrabold text-[var(--rota-text)]">
                {analiseMelhoresDiasHorarios.melhorDia.nomeCompleto}
              </span>
              <span className="block text-[13px] font-semibold text-[var(--rota-text-soft)] tabular-nums">
                {formatarMoeda(analiseMelhoresDiasHorarios.melhorDia.media)}/dia
              </span>
            </div>

            <div className="min-w-0">
              <span className="block text-[13px] font-bold text-[var(--rota-text-soft)]">
                Melhor faixa
              </span>
              <span className="mt-0.5 block truncate text-[17px] leading-[22px] font-extrabold text-[var(--rota-text)]">
                {analiseMelhoresDiasHorarios.melhorFaixa.rotulo}
              </span>
              <span className="block text-[13px] font-semibold text-[var(--rota-text-soft)] tabular-nums">
                {formatarMoeda(analiseMelhoresDiasHorarios.melhorFaixa.media)}
                /dia
              </span>
            </div>
          </div>

          <div className="space-y-1.5 pt-1 border-t border-[var(--rota-line)]">
            {analiseMelhoresDiasHorarios.mediasDiasSemana.map((item) => {
              const largura =
                item.media > 0
                  ? Math.max(
                      4,
                      Math.round(
                        (item.media /
                          analiseMelhoresDiasHorarios.maxMediaDiaSemana) *
                          100
                      )
                    )
                  : 0;
              const ehMelhor =
                item.diaSemana ===
                  analiseMelhoresDiasHorarios.melhorDia.diaSemana &&
                item.media > 0;
              return (
                <div
                  key={item.diaSemana}
                  className="grid grid-cols-[34px_1fr_auto] items-center gap-2 text-[13px] tabular-nums"
                >
                  <span
                    className={
                      ehMelhor
                        ? 'font-extrabold text-[var(--rota-accent)]'
                        : 'font-bold text-[var(--rota-text-soft)]'
                    }
                  >
                    {item.rotulo}
                  </span>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--rota-surface-2)]">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${largura}%`,
                        backgroundColor: ehMelhor
                          ? 'var(--rota-accent)'
                          : 'var(--rota-text-soft)',
                      }}
                    />
                  </div>
                  <span className="font-bold text-[var(--rota-text)]">
                    {formatarMoeda(item.media)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Cartão Por plataforma */}
      <section aria-label="Por plataforma" className="rota-card px-4 py-3.5">
        <h2 className="mb-3 text-[15px] font-extrabold text-[var(--rota-text)]">
          Por plataforma
        </h2>

        <div className="space-y-2.5">
          {ganhosPorPlataforma.map((item) => (
            <div key={item.plataforma}>
              <div className="flex items-baseline justify-between gap-2 text-[14px] leading-[18px]">
                <div className="min-w-0 truncate">
                  <span className="font-bold text-[var(--rota-text)]">
                    {item.plataforma}
                  </span>
                  <span className="ml-1.5 text-[13px] font-semibold text-[var(--rota-text-soft)] tabular-nums">
                    {Math.round(item.percentual)}%
                    {item.entregas > 0
                      ? ` · ${formatarMoeda(item.valorPorEntrega)}/ent.`
                      : ''}
                  </span>
                </div>
                <span className="font-extrabold text-[var(--rota-text)] tabular-nums shrink-0">
                  {formatarMoeda(item.total)}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--rota-surface-2)]">
                <div
                  className="h-full rounded-full bg-[var(--rota-accent)] transition-all duration-300"
                  style={{ width: `${Math.min(100, item.percentual)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
