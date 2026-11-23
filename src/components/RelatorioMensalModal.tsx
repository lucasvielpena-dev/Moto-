import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer } from 'lucide-react';
import {
  CATEGORIAS_GASTO,
  Lancamento,
  PLATAFORMAS,
  TipoLancamento,
  Trajeto,
} from '../types';
import { formatarKm, formatarMoeda, rotuloCategoria } from '../utils/formatters';
import { obterEntregasLancamento } from '../utils/storage';

interface RelatorioMensalModalProps {
  aberto: boolean;
  onFechar: () => void;
  todosLancamentos: Lancamento[];
  todosTrajetos: Trajeto[];
  reservaKm: number;
  reservaMes: number;
}

function chaveMesDeData(isoData: string): string | null {
  const d = new Date(isoData);
  if (Number.isNaN(d.getTime())) return null;
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}

function formatarNomeMes(chaveMes: string): string {
  const [anoStr, mesStr] = chaveMes.split('-');
  const ano = Number(anoStr);
  const mes = Number(mesStr);
  if (!Number.isFinite(ano) || !Number.isFinite(mes)) return chaveMes;
  const data = new Date(ano, mes - 1, 1);
  const texto = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(data);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatarHoraSimples(isoData: string): string {
  const d = new Date(isoData);
  if (Number.isNaN(d.getTime())) return '--:--';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function formatarDiaTitulo(chaveDia: string): string {
  const [ano, mes, dia] = chaveDia.split('-').map(Number);
  const d = new Date(ano, mes - 1, dia);
  if (Number.isNaN(d.getTime())) return chaveDia;
  const texto = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export const RelatorioMensalModal: React.FC<RelatorioMensalModalProps> = ({
  aberto,
  onFechar,
  todosLancamentos,
  todosTrajetos,
  reservaKm,
  reservaMes,
}) => {
  const mesAtual = useMemo(() => {
    const agora = new Date();
    return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const [mesSelecionado, setMesSelecionado] = useState<string>(mesAtual);

  const mesesDisponiveis = useMemo(() => {
    const set = new Set<string>([mesAtual]);
    for (const l of todosLancamentos) {
      const m = chaveMesDeData(l.data);
      if (m) set.add(m);
    }
    for (const t of todosTrajetos) {
      const m = chaveMesDeData(t.data);
      if (m) set.add(m);
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [todosLancamentos, todosTrajetos, mesAtual]);

  const dadosMes = useMemo(() => {
    const lancamentosMes = todosLancamentos
      .filter((l) => chaveMesDeData(l.data) === mesSelecionado)
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

    const trajetosMes = todosTrajetos.filter(
      (t) => chaveMesDeData(t.data) === mesSelecionado
    );

    const ganhos = lancamentosMes
      .filter((l) => l.tipo === TipoLancamento.GANHO)
      .reduce((acc, l) => acc + l.valor, 0);

    const gastos = lancamentosMes
      .filter((l) => l.tipo === TipoLancamento.GASTO)
      .reduce((acc, l) => acc + l.valor, 0);

    const lucro = ganhos - gastos;
    const km = trajetosMes.reduce((acc, t) => acc + t.km, 0);
    const entregas = lancamentosMes.reduce(
      (acc, l) => acc + obterEntregasLancamento(l),
      0
    );
    const lucroPorKm = km > 0 ? lucro / km : 0;

    const temReservas = reservaKm > 0 || reservaMes > 0;
    const totalReservar = reservaKm * km + reservaMes;
    const lucroLivre = lucro - totalReservar;

    const porPlataforma = PLATAFORMAS.map((plat) => {
      const itens = lancamentosMes.filter(
        (l) => l.tipo === TipoLancamento.GANHO && l.categoria === plat
      );
      const total = itens.reduce((acc, l) => acc + l.valor, 0);
      const entregasPlat = itens.reduce(
        (acc, l) => acc + obterEntregasLancamento(l),
        0
      );
      return {
        nome: rotuloCategoria(plat),
        total,
        entregas: entregasPlat,
        percentual: ganhos > 0 ? (total / ganhos) * 100 : 0,
      };
    });

    const porCategoriaGasto = CATEGORIAS_GASTO.map((cat) => {
      const total = lancamentosMes
        .filter((l) => l.tipo === TipoLancamento.GASTO && l.categoria === cat)
        .reduce((acc, l) => acc + l.valor, 0);
      return {
        nome: cat,
        total,
      };
    });

    const diasMap = new Map<
      string,
      {
        chaveDia: string;
        lancamentos: Lancamento[];
        km: number;
        ganhos: number;
        gastos: number;
      }
    >();

    const garantirDia = (isoData: string) => {
      const d = new Date(isoData);
      if (Number.isNaN(d.getTime())) return null;
      const chaveDia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!diasMap.has(chaveDia)) {
        diasMap.set(chaveDia, {
          chaveDia,
          lancamentos: [],
          km: 0,
          ganhos: 0,
          gastos: 0,
        });
      }
      return diasMap.get(chaveDia)!;
    };

    for (const l of lancamentosMes) {
      const diaObj = garantirDia(l.data);
      if (!diaObj) continue;
      diaObj.lancamentos.push(l);
      if (l.tipo === TipoLancamento.GANHO) {
        diaObj.ganhos += l.valor;
      } else {
        diaObj.gastos += l.valor;
      }
    }

    for (const t of trajetosMes) {
      const diaObj = garantirDia(t.data);
      if (!diaObj) continue;
      diaObj.km += t.km;
    }

    const dias = Array.from(diasMap.values()).sort((a, b) =>
      a.chaveDia.localeCompare(b.chaveDia)
    );

    return {
      ganhos,
      gastos,
      lucro,
      km,
      entregas,
      lucroPorKm,
      temReservas,
      totalReservar,
      lucroLivre,
      porPlataforma,
      porCategoriaGasto,
      dias,
    };
  }, [todosLancamentos, todosTrajetos, mesSelecionado, reservaKm, reservaMes]);

  useEffect(() => {
    if (!aberto) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onFechar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [aberto, onFechar]);

  if (!aberto || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="rota-print-overlay fixed inset-0 z-50 flex flex-col bg-[var(--rota-bg)] overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-relatorio-mes"
    >
      {/* Barra de ações (oculta na impressão) */}
      <header className="rota-no-print sticky top-0 z-10 border-b border-[var(--rota-line)] bg-[var(--rota-surface)] px-4 py-2.5">
        <div className="mx-auto flex max-w-[680px] flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <label
              htmlFor="select-mes-relatorio"
              className="text-[13px] font-bold text-[var(--rota-text-soft)]"
            >
              Mês:
            </label>
            <select
              id="select-mes-relatorio"
              value={mesSelecionado}
              onChange={(e) => setMesSelecionado(e.target.value)}
              className="min-h-[48px] rounded-[12px] bg-[var(--rota-surface-2)] px-3 text-[14px] font-extrabold text-[var(--rota-text)] focus:outline-none"
            >
              {mesesDisponiveis.map((m) => (
                <option key={m} value={m}>
                  {formatarNomeMes(m)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const androidBridge = (
                  window as Window & {
                    RotaAndroid?: { printPage?: () => void };
                  }
                ).RotaAndroid;
                if (androidBridge?.printPage) {
                  androidBridge.printPage();
                } else {
                  window.print();
                }
              }}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-[14px] bg-[var(--rota-accent)] px-4 text-[14px] font-extrabold text-[var(--rota-on-accent)] active:scale-[0.98]"
            >
              <Printer className="h-4 w-4 shrink-0" aria-hidden="true" />
              Imprimir ou salvar em PDF
            </button>
            <button
              type="button"
              onClick={onFechar}
              className="inline-flex min-h-[48px] items-center justify-center rounded-[14px] px-3 text-[15px] font-bold text-[var(--rota-text-soft)] hover:text-[var(--rota-text)]"
            >
              Fechar
            </button>
          </div>
        </div>
      </header>

      {/* Folha do relatório (sempre tema claro na impressão) */}
      <div className="rota-print-sheet mx-auto w-full max-w-[680px] p-4 sm:p-6">
        <article className="rota-print-card rounded-[20px] bg-white p-5 sm:p-6 text-[#0F172A] space-y-5 border border-[#E6E9EF]">
          <div className="border-b border-[#E6E9EF] pb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2
                id="titulo-relatorio-mes"
                className="text-[22px] font-extrabold text-[#0F172A]"
              >
                Rota — Relatório mensal
              </h2>
              <p className="text-[14px] font-bold text-[#5B6577]">
                {formatarNomeMes(mesSelecionado)}
              </p>
            </div>
            <span className="text-[13px] font-semibold text-[#5B6577]">
              Emitido em {new Date().toLocaleDateString('pt-BR')}
            </span>
          </div>

          {/* Totais */}
          <section aria-label="Totais do mês" className="space-y-2">
            <h3 className="text-[15px] font-extrabold text-[#0F172A]">
              Resumo do mês
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-[14px] bg-[#F6F7F9] p-3.5 tabular-nums">
              <div>
                <span className="block text-[13px] font-bold text-[#5B6577]">
                  Ganhos
                </span>
                <span className="text-[18px] font-extrabold text-[#0F172A]">
                  {formatarMoeda(dadosMes.ganhos)}
                </span>
              </div>
              <div>
                <span className="block text-[13px] font-bold text-[#5B6577]">
                  Gastos
                </span>
                <span className="text-[18px] font-extrabold text-[#B42318]">
                  {formatarMoeda(dadosMes.gastos)}
                </span>
              </div>
              <div>
                <span className="block text-[13px] font-bold text-[#5B6577]">
                  Lucro
                </span>
                <span
                  className={`text-[18px] font-extrabold ${
                    dadosMes.lucro > 0
                      ? 'text-[#0E7A4F]'
                      : dadosMes.lucro < 0
                        ? 'text-[#B42318]'
                        : 'text-[#0F172A]'
                  }`}
                >
                  {formatarMoeda(dadosMes.lucro)}
                </span>
              </div>
              <div>
                <span className="block text-[13px] font-bold text-[#5B6577]">
                  Distância
                </span>
                <span className="text-[18px] font-extrabold text-[#0F172A]">
                  {formatarKm(dadosMes.km)} km
                </span>
              </div>
              <div>
                <span className="block text-[13px] font-bold text-[#5B6577]">
                  Entregas
                </span>
                <span className="text-[18px] font-extrabold text-[#0F172A]">
                  {dadosMes.entregas}
                </span>
              </div>
              <div>
                <span className="block text-[13px] font-bold text-[#5B6577]">
                  Lucro por km
                </span>
                <span className="text-[18px] font-extrabold text-[#0F172A]">
                  {dadosMes.km > 0 ? formatarMoeda(dadosMes.lucroPorKm) : '—'}
                </span>
              </div>
              {dadosMes.temReservas && (
                <>
                  <div>
                    <span className="block text-[13px] font-bold text-[#5B6577]">
                      Reservar
                    </span>
                    <span className="text-[18px] font-extrabold text-[#0F172A]">
                      {formatarMoeda(dadosMes.totalReservar)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[13px] font-bold text-[#5B6577]">
                      Lucro livre
                    </span>
                    <span className="text-[18px] font-extrabold text-[#0F172A]">
                      {formatarMoeda(dadosMes.lucroLivre)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Ganhos por plataforma e Gastos por categoria */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <section aria-label="Ganhos por plataforma" className="space-y-2">
              <h3 className="text-[15px] font-extrabold text-[#0F172A]">
                Ganhos por plataforma
              </h3>
              <ul className="divide-y divide-[#E6E9EF] border-t border-b border-[#E6E9EF]">
                {dadosMes.porPlataforma.map((item) => (
                  <li
                    key={item.nome}
                    className="flex items-center justify-between gap-2 py-2 text-[13px] tabular-nums"
                  >
                    <span className="font-bold text-[#0F172A]">
                      {item.nome}{' '}
                      <span className="font-semibold text-[#5B6577]">
                        ({item.entregas} ent. · {Math.round(item.percentual)}%)
                      </span>
                    </span>
                    <span className="font-extrabold text-[#0F172A]">
                      {formatarMoeda(item.total)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-label="Gastos por categoria" className="space-y-2">
              <h3 className="text-[15px] font-extrabold text-[#0F172A]">
                Gastos por categoria
              </h3>
              <ul className="divide-y divide-[#E6E9EF] border-t border-b border-[#E6E9EF]">
                {dadosMes.porCategoriaGasto.map((item) => (
                  <li
                    key={item.nome}
                    className="flex items-center justify-between gap-2 py-2 text-[13px] tabular-nums"
                  >
                    <span className="font-bold text-[#0F172A]">
                      {item.nome}
                    </span>
                    <span className="font-extrabold text-[#B42318]">
                      {formatarMoeda(item.total)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Lista de lançamentos por dia */}
          <section aria-label="Lançamentos por dia" className="space-y-3">
            <h3 className="text-[15px] font-extrabold text-[#0F172A]">
              Lançamentos por dia
            </h3>

            {dadosMes.dias.length === 0 ? (
              <p className="text-[14px] font-semibold text-[#5B6577]">
                Nenhum lançamento ou trajeto registrado neste mês.
              </p>
            ) : (
              <div className="space-y-3">
                {dadosMes.dias.map((dia) => (
                  <div
                    key={dia.chaveDia}
                    className="border border-[#E6E9EF] rounded-[12px] overflow-hidden break-inside-avoid"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-[#F6F7F9] px-3 py-2 text-[13px] tabular-nums">
                      <span className="font-extrabold text-[#0F172A]">
                        {formatarDiaTitulo(dia.chaveDia)}
                      </span>
                      <span className="font-bold text-[#5B6577]">
                        +{formatarMoeda(dia.ganhos)} · −{formatarMoeda(dia.gastos)}
                        {dia.km > 0 ? ` · ${formatarKm(dia.km)} km` : ''}
                      </span>
                    </div>

                    {dia.lancamentos.length > 0 && (
                      <ul className="divide-y divide-[#E6E9EF]">
                        {dia.lancamentos.map((item) => {
                          const ehGanho = item.tipo === TipoLancamento.GANHO;
                          const qtdEntregas = obterEntregasLancamento(item);
                          return (
                            <li
                              key={item.id}
                              className="flex items-center justify-between gap-2 px-3 py-2 text-[13px] tabular-nums"
                            >
                              <div className="min-w-0">
                                <span className="font-bold text-[#0F172A]">
                                  {formatarHoraSimples(item.data)} ·{' '}
                                  {rotuloCategoria(item.categoria)}
                                </span>
                                {ehGanho && qtdEntregas > 1 && (
                                  <span className="ml-1.5 font-semibold text-[#5B6577]">
                                    ({qtdEntregas} entregas)
                                  </span>
                                )}
                                {item.observacao && (
                                  <span className="ml-1.5 font-semibold text-[#5B6577]">
                                    · {item.observacao}
                                  </span>
                                )}
                              </div>
                              <span
                                className={`shrink-0 font-extrabold ${
                                  ehGanho ? 'text-[#0E7A4F]' : 'text-[#B42318]'
                                }`}
                              >
                                {ehGanho ? '+' : '−'}{' '}
                                {formatarMoeda(item.valor)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </article>
      </div>
    </div>,
    document.body
  );
};
