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

interface ResumoProps {
  periodo: FiltroPeriodo;
  onMudarPeriodo: (periodo: FiltroPeriodo) => void;
  lancamentos: Lancamento[];
  todosLancamentos: Lancamento[];
  trajetos: Trajeto[];
  kmEmAndamento?: number;
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

export const Resumo: React.FC<ResumoProps> = ({
  periodo,
  onMudarPeriodo,
  lancamentos,
  todosLancamentos,
  trajetos,
  kmEmAndamento = 0,
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

  const kmEntregas = entregasComKm.reduce(
    (acc, l) => acc + (l.kmEntrega ?? 0),
    0
  );
  const receitaEntregas = entregasComKm.reduce((acc, l) => acc + l.valor, 0);

  const modoEntregas = visaoKm === 'entregas';
  const receitaExibida = modoEntregas ? receitaEntregas : totalGanhos;
  const gastosExibidos =
    modoEntregas && entregasComKm.length === 0 ? 0 : totalGastos;
  const lucroExibido = receitaExibida - gastosExibidos;
  const kmExibido = modoEntregas ? kmEntregas : totalKm;

  const ganhoPorKm = kmExibido > 0 ? receitaExibida / kmExibido : 0;
  const custoPorKm = kmExibido > 0 ? gastosExibidos / kmExibido : 0;
  const lucroPorKm = kmExibido > 0 ? lucroExibido / kmExibido : 0;

  const ganhosPorPlataforma = PLATAFORMAS.map((plat: Plataforma) => {
    const soma = lancamentos
      .filter(
        (l) => l.tipo === TipoLancamento.GANHO && l.categoria === plat
      )
      .reduce((acc, l) => acc + l.valor, 0);
    return {
      plataforma: rotuloCategoria(plat),
      total: soma,
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
      </section>

      {/* Cartão de 3 colunas: Ganhos, Gastos, Lucro */}
      <section
        aria-label="Totais do período"
        className="rota-card grid grid-cols-3 gap-3 px-4 py-3.5"
      >
        <div className="min-w-0">
          <span className="block text-[13px] font-bold text-[var(--rota-text-soft)]">
            Ganhos
          </span>
          <span className="mt-0.5 block truncate text-[20px] leading-[24px] font-extrabold text-[var(--rota-text)] tabular-nums">
            {formatarMoeda(receitaExibida)}
          </span>
        </div>

        <div className="min-w-0">
          <span className="block text-[13px] font-bold text-[var(--rota-text-soft)]">
            Gastos
          </span>
          <span className="mt-0.5 block truncate text-[20px] leading-[24px] font-extrabold text-[var(--rota-danger)] tabular-nums">
            {formatarMoeda(gastosExibidos)}
          </span>
        </div>

        <div className="min-w-0">
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
