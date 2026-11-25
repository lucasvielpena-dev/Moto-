import React, { useEffect, useMemo, useState } from 'react';
import {
  CATEGORIAS_GASTO,
  CategoriaGasto,
  Lancamento,
  PLATAFORMAS,
  Plataforma,
  TipoLancamento,
} from '../types';
import { parseValorNumerico, rotuloCategoria } from '../utils/formatters';
import { useNativeBackHandler } from '../utils/nativeBack';

interface FormLancamentoProps {
  aberto: boolean;
  tipoInicial: TipoLancamento;
  lancamentos?: Lancamento[];
  onFechar: () => void;
  onAdicionar: (dados: {
    tipo: TipoLancamento;
    categoria: Plataforma | CategoriaGasto;
    valor: number;
    observacao?: string;
    entregas?: number;
  }) => void;
}

function ordenarPorFrequencia<T extends string>(
  opcoes: readonly T[],
  lancamentos: Lancamento[],
  tipo: TipoLancamento
): T[] {
  const contagem = new Map<string, number>();
  for (const item of lancamentos) {
    if (item.tipo === tipo) {
      contagem.set(item.categoria, (contagem.get(item.categoria) ?? 0) + 1);
    }
  }

  return [...opcoes].sort((a, b) => {
    const diff = (contagem.get(b) ?? 0) - (contagem.get(a) ?? 0);
    if (diff !== 0) return diff;
    return opcoes.indexOf(a) - opcoes.indexOf(b);
  });
}

export const FormLancamento: React.FC<FormLancamentoProps> = ({
  aberto,
  tipoInicial,
  lancamentos = [],
  onFechar,
  onAdicionar,
}) => {
  const plataformasOrdenadas = useMemo(
    () => ordenarPorFrequencia(PLATAFORMAS, lancamentos, TipoLancamento.GANHO),
    [lancamentos]
  );

  const categoriasGastoOrdenadas = useMemo(
    () =>
      ordenarPorFrequencia(CATEGORIAS_GASTO, lancamentos, TipoLancamento.GASTO),
    [lancamentos]
  );

  const [tipo, setTipo] = useState<TipoLancamento>(tipoInicial);
  const [plataforma, setPlataforma] = useState<Plataforma>(
    () => plataformasOrdenadas[0] ?? Plataforma.IFOOD
  );
  const [categoriaGasto, setCategoriaGasto] = useState<CategoriaGasto>(
    () => categoriasGastoOrdenadas[0] ?? CategoriaGasto.COMBUSTIVEL
  );
  const [valorTexto, setValorTexto] = useState<string>('');
  const [entregasTexto, setEntregasTexto] = useState<string>('1');
  const [mostrarObs, setMostrarObs] = useState<boolean>(false);
  const [observacao, setObservacao] = useState<string>('');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (aberto) {
      setTipo(tipoInicial);
      setPlataforma(plataformasOrdenadas[0] ?? Plataforma.IFOOD);
      setCategoriaGasto(
        categoriasGastoOrdenadas[0] ?? CategoriaGasto.COMBUSTIVEL
      );
      setValorTexto('');
      setEntregasTexto('1');
      setObservacao('');
      setMostrarObs(false);
      setErro(null);
    }
  }, [aberto, tipoInicial, plataformasOrdenadas, categoriasGastoOrdenadas]);

  useNativeBackHandler(aberto, onFechar);

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

  if (!aberto) {
    return null;
  }

  const ehGanho = tipo === TipoLancamento.GANHO;

  const entregasNum = (() => {
    const parsed = parseInt(entregasTexto.replace(/\D/g, ''), 10);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
  })();

  const ajustarEntregas = (delta: number) => {
    const proximo = Math.max(1, entregasNum + delta);
    setEntregasTexto(String(proximo));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    const valor = parseValorNumerico(valorTexto);
    if (Number.isNaN(valor) || valor <= 0) {
      setErro('Informe um valor maior que R$ 0,00.');
      return;
    }

    const categoria = ehGanho ? plataforma : categoriaGasto;
    const obsLimpa = observacao.trim();

    onAdicionar({
      tipo,
      categoria,
      valor: Number(valor.toFixed(2)),
      observacao: obsLimpa || undefined,
      entregas: ehGanho ? entregasNum : undefined,
    });
    onFechar();
  };

  return (
    <div
      onClick={onFechar}
      className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center"
      style={{ backgroundColor: 'var(--rota-backdrop)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-novo-lancamento"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[100dvh] sm:h-auto sm:max-h-[92dvh] w-full sm:max-w-[460px] flex-col bg-[var(--rota-bg)] sm:rounded-[20px] sm:overflow-hidden"
      >
        <header className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
          <h2
            id="titulo-novo-lancamento"
            className="text-[20px] font-extrabold text-[var(--rota-text)]"
          >
            Novo lançamento
          </h2>
          <button
            type="button"
            onClick={onFechar}
            className="inline-flex min-h-[48px] items-center justify-center rounded-[14px] px-3 text-[15px] font-bold text-[var(--rota-text-soft)] hover:text-[var(--rota-text)]"
          >
            Fechar
          </button>
        </header>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col justify-between gap-3 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <div className="space-y-3">
            {/* Seletor segmentado Ganho | Gasto */}
            <div
              role="tablist"
              aria-label="Tipo de lançamento"
              className="rota-segmented grid-cols-2"
            >
              <button
                type="button"
                role="tab"
                aria-selected={ehGanho}
                onClick={() => {
                  setTipo(TipoLancamento.GANHO);
                  setErro(null);
                }}
                className={`rota-segmented-btn ${
                  ehGanho
                    ? 'rota-segmented-btn-active'
                    : 'rota-segmented-btn-idle'
                }`}
              >
                Ganho
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={!ehGanho}
                onClick={() => {
                  setTipo(TipoLancamento.GASTO);
                  setErro(null);
                }}
                className={`rota-segmented-btn ${
                  !ehGanho
                    ? 'rota-segmented-btn-active'
                    : 'rota-segmented-btn-idle'
                }`}
              >
                Gasto
              </button>
            </div>

            {/* Cartão com Valor gigante centralizado */}
            <div className="rota-card p-5 text-center">
              <label
                htmlFor="input-valor-lancamento"
                className="block text-[13px] font-bold text-[var(--rota-text-soft)]"
              >
                Valor
              </label>
              <div className="mt-2 flex items-baseline justify-center gap-1.5">
                <span className="text-[24px] font-extrabold text-[var(--rota-text-soft)]">
                  R$
                </span>
                <input
                  id="input-valor-lancamento"
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={valorTexto}
                  onChange={(e) => {
                    setValorTexto(e.target.value);
                    if (erro) setErro(null);
                  }}
                  placeholder="0,00"
                  className="w-[210px] bg-transparent text-center text-[56px] leading-none font-extrabold text-[var(--rota-text)] placeholder:text-[var(--rota-text-soft)]/40 focus:outline-none tabular-nums"
                />
              </div>
              {erro && (
                <p
                  role="alert"
                  className="mt-2 text-[13px] font-bold text-[var(--rota-danger)]"
                >
                  {erro}
                </p>
              )}
            </div>

            {/* Campo opcional Entregas (somente para GANHO) */}
            {ehGanho && (
              <div className="rota-card px-4 py-2.5 flex items-center justify-between gap-3">
                <label
                  htmlFor="input-entregas-lancamento"
                  className="text-[14px] font-extrabold text-[var(--rota-text)]"
                >
                  Entregas
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Diminuir entregas"
                    onClick={() => ajustarEntregas(-1)}
                    className="flex h-[48px] w-[48px] items-center justify-center rounded-[12px] bg-[var(--rota-surface-2)] text-[18px] font-extrabold text-[var(--rota-text)] active:scale-[0.98]"
                  >
                    −
                  </button>
                  <div className="rota-input flex h-[48px] w-[64px] items-center justify-center px-2">
                    <input
                      id="input-entregas-lancamento"
                      type="text"
                      inputMode="numeric"
                      value={entregasTexto}
                      onChange={(e) =>
                        setEntregasTexto(e.target.value.replace(/\D/g, ''))
                      }
                      onBlur={() => setEntregasTexto(String(entregasNum))}
                      className="w-full bg-transparent text-center text-[16px] font-extrabold text-[var(--rota-text)] focus:outline-none tabular-nums"
                    />
                  </div>
                  <button
                    type="button"
                    aria-label="Aumentar entregas"
                    onClick={() => ajustarEntregas(1)}
                    className="flex h-[48px] w-[48px] items-center justify-center rounded-[12px] bg-[var(--rota-surface-2)] text-[18px] font-extrabold text-[var(--rota-text)] active:scale-[0.98]"
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {/* Grade 2x2 de 56px: Plataforma ou Categoria */}
            <div>
              <span className="mb-2 block text-[13px] font-bold text-[var(--rota-text-soft)]">
                {ehGanho ? 'Plataforma' : 'Categoria'}
              </span>
              <div
                role="group"
                aria-label={ehGanho ? 'Plataforma' : 'Categoria'}
                className="grid grid-cols-2 gap-3"
              >
                {ehGanho
                  ? plataformasOrdenadas.map((item) => {
                      const ativo = plataforma === item;
                      return (
                        <button
                          key={item}
                          type="button"
                          aria-pressed={ativo}
                          onClick={() => setPlataforma(item)}
                          className={`h-[56px] rounded-[16px] border-2 px-3 text-[15px] font-extrabold transition-colors active:scale-[0.98] truncate ${
                            ativo
                              ? 'bg-[var(--rota-accent-tint)] border-[var(--rota-accent)] text-[var(--rota-accent)]'
                              : 'bg-[var(--rota-surface)] border-[var(--rota-line)] text-[var(--rota-text)]'
                          }`}
                        >
                          {rotuloCategoria(item)}
                        </button>
                      );
                    })
                  : categoriasGastoOrdenadas.map((item) => {
                      const ativo = categoriaGasto === item;
                      return (
                        <button
                          key={item}
                          type="button"
                          aria-pressed={ativo}
                          onClick={() => setCategoriaGasto(item)}
                          className={`h-[56px] rounded-[16px] border-2 px-3 text-[15px] font-extrabold transition-colors active:scale-[0.98] truncate ${
                            ativo
                              ? 'bg-[var(--rota-accent-tint)] border-[var(--rota-accent)] text-[var(--rota-accent)]'
                              : 'bg-[var(--rota-surface)] border-[var(--rota-line)] text-[var(--rota-text)]'
                          }`}
                        >
                          {item}
                        </button>
                      );
                    })}
              </div>
            </div>

            {/* Observação opcional */}
            {!mostrarObs ? (
              <button
                type="button"
                onClick={() => setMostrarObs(true)}
                className="inline-flex min-h-[48px] items-center text-[14px] font-bold text-[var(--rota-accent)]"
              >
                + Adicionar observação
              </button>
            ) : (
              <div>
                <label
                  htmlFor="input-observacao-lancamento"
                  className="mb-1.5 block text-[13px] font-bold text-[var(--rota-text-soft)]"
                >
                  Observação (opcional)
                </label>
                <div className="rota-input flex h-[48px] items-center px-3.5">
                  <input
                    id="input-observacao-lancamento"
                    type="text"
                    maxLength={80}
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder={
                      ehGanho
                        ? 'Ex: gorjeta, chuva'
                        : 'Ex: posto, troca de peça'
                    }
                    className="w-full bg-transparent text-[15px] font-semibold text-[var(--rota-text)] placeholder:text-[var(--rota-text-soft)] focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="mt-2 flex h-[60px] w-full shrink-0 items-center justify-center rounded-[16px] bg-[var(--rota-accent)] text-[16px] font-extrabold text-[var(--rota-on-accent)] transition-transform active:scale-[0.99]"
          >
            {ehGanho ? 'Salvar ganho' : 'Salvar gasto'}
          </button>
        </form>
      </div>
    </div>
  );
};
