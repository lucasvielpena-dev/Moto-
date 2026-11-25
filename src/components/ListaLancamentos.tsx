import React, { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import {
  CATEGORIAS_GASTO,
  CategoriaGasto,
  Entrega,
  FiltroPeriodo,
  Lancamento,
  PLATAFORMAS,
  Plataforma,
  TipoLancamento,
  Trajeto,
} from '../types';
import {
  formatarDataHora,
  formatarDuracao,
  formatarDuracaoCurta,
  formatarKm,
  formatarMoeda,
  parseValorNumerico,
  rotuloCategoria,
} from '../utils/formatters';
import { obterEntregasLancamento } from '../utils/storage';
import { useNativeBackHandler } from '../utils/nativeBack';

interface ListaLancamentosProps {
  periodo: FiltroPeriodo;
  onMudarPeriodo: (periodo: FiltroPeriodo) => void;
  lancamentos: Lancamento[];
  trajetos: Trajeto[];
  entregas?: Entrega[];
  onEditarLancamento: (atualizado: Lancamento) => void;
  onExcluirLancamento: (id: string) => void;
  onExcluirTrajeto: (id: string) => void;
  onExcluirEntrega?: (id: string, excluirLancamentoVinculado: boolean) => void;
}

const OPCOES_PERIODO: { valor: FiltroPeriodo; rotulo: string }[] = [
  { valor: FiltroPeriodo.HOJE, rotulo: 'Hoje' },
  { valor: FiltroPeriodo.SETE_DIAS, rotulo: '7 dias' },
  { valor: FiltroPeriodo.MES, rotulo: 'Mês' },
];

const LIMITE_INICIAL = 6;

export const ListaLancamentos: React.FC<ListaLancamentosProps> = ({
  periodo,
  onMudarPeriodo,
  lancamentos,
  trajetos,
  entregas = [],
  onEditarLancamento,
  onExcluirLancamento,
  onExcluirTrajeto,
  onExcluirEntrega,
}) => {
  const [aba, setAba] = useState<'lancamentos' | 'trajetos'>('lancamentos');
  const [mostrarTodos, setMostrarTodos] = useState<boolean>(false);
  const [entregaConfirmandoExcluir, setEntregaConfirmandoExcluir] =
    useState<Entrega | null>(null);

  const [itemEditando, setItemEditando] = useState<Lancamento | null>(null);
  const [editTipo, setEditTipo] = useState<TipoLancamento>(TipoLancamento.GANHO);
  const [editCategoria, setEditCategoria] = useState<Plataforma | CategoriaGasto>(
    Plataforma.IFOOD
  );
  const [editValorTexto, setEditValorTexto] = useState<string>('');
  const [editEntregasTexto, setEditEntregasTexto] = useState<string>('1');
  const [editObs, setEditObs] = useState<string>('');
  const [editErro, setEditErro] = useState<string | null>(null);

  useNativeBackHandler(Boolean(itemEditando), () => setItemEditando(null));
  useNativeBackHandler(Boolean(entregaConfirmandoExcluir), () =>
    setEntregaConfirmandoExcluir(null)
  );

  useEffect(() => {
    if (!itemEditando && !entregaConfirmandoExcluir) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (entregaConfirmandoExcluir) {
          setEntregaConfirmandoExcluir(null);
        } else if (itemEditando) {
          setItemEditando(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [itemEditando, entregaConfirmandoExcluir]);

  useEffect(() => {
    setMostrarTodos(false);
    setEntregaConfirmandoExcluir(null);
  }, [periodo, aba]);

  const abrirEdicao = (item: Lancamento) => {
    setItemEditando(item);
    setEditTipo(item.tipo);
    setEditCategoria(item.categoria);
    setEditValorTexto(item.valor.toFixed(2).replace('.', ','));
    setEditEntregasTexto(String(obterEntregasLancamento(item) || 1));
    setEditObs(item.observacao ?? '');
    setEditErro(null);
  };

  const salvarEdicao = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemEditando) return;

    const valor = parseValorNumerico(editValorTexto);
    if (Number.isNaN(valor) || valor <= 0) {
      setEditErro('Informe um valor maior que R$ 0,00.');
      return;
    }

    const parsedEntregas = parseInt(editEntregasTexto.replace(/\D/g, ''), 10);
    const entregasValidas =
      Number.isFinite(parsedEntregas) && parsedEntregas >= 1
        ? parsedEntregas
        : 1;

    onEditarLancamento({
      ...itemEditando,
      tipo: editTipo,
      categoria: editCategoria,
      valor: Number(valor.toFixed(2)),
      observacao: editObs.trim() || undefined,
      kmEntrega:
        editTipo === TipoLancamento.GANHO ? itemEditando.kmEntrega : undefined,
      duracaoEntregaSegundos:
        editTipo === TipoLancamento.GANHO
          ? itemEditando.duracaoEntregaSegundos
          : undefined,
      entregas:
        editTipo === TipoLancamento.GANHO ? entregasValidas : undefined,
    });
    setItemEditando(null);
  };

  type RegistroHistorico =
    | { tipoRegistro: 'lancamento'; dataOrdenacao: number; item: Lancamento }
    | { tipoRegistro: 'entrega'; dataOrdenacao: number; entrega: Entrega };

  const registrosCombinados: RegistroHistorico[] = [
    ...lancamentos.map((item) => ({
      tipoRegistro: 'lancamento' as const,
      dataOrdenacao: new Date(item.data).getTime(),
      item,
    })),
    ...entregas.map((entrega) => ({
      tipoRegistro: 'entrega' as const,
      dataOrdenacao: new Date(entrega.fimIso || entrega.inicioIso).getTime(),
      entrega,
    })),
  ].sort((a, b) => b.dataOrdenacao - a.dataOrdenacao);

  const trajetosOrdenados = [...trajetos].sort(
    (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
  );

  const registrosVisiveis = mostrarTodos
    ? registrosCombinados
    : registrosCombinados.slice(0, LIMITE_INICIAL);

  const trajetosVisiveis = mostrarTodos
    ? trajetosOrdenados
    : trajetosOrdenados.slice(0, LIMITE_INICIAL);

  const totalListaAtual =
    aba === 'lancamentos'
      ? registrosCombinados.length
      : trajetosOrdenados.length;

  return (
    <div className="space-y-3">
      {/* Filtro Hoje / 7 dias / Mês */}
      <div
        role="tablist"
        aria-label="Filtrar histórico por período"
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

      {/* Alternador Lançamentos | Trajetos */}
      <div
        role="tablist"
        aria-label="Alternar entre lançamentos e trajetos"
        className="rota-segmented grid-cols-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'lancamentos'}
          onClick={() => setAba('lancamentos')}
          className={`rota-segmented-btn ${
            aba === 'lancamentos'
              ? 'rota-segmented-btn-active'
              : 'rota-segmented-btn-idle'
          }`}
        >
          Lançamentos ({registrosCombinados.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'trajetos'}
          onClick={() => setAba('trajetos')}
          className={`rota-segmented-btn ${
            aba === 'trajetos'
              ? 'rota-segmented-btn-active'
              : 'rota-segmented-btn-idle'
          }`}
        >
          Trajetos ({trajetosOrdenados.length})
        </button>
      </div>

      {/* Lista em cartão único sem cartões aninhados */}
      <div className="rota-card overflow-hidden">
        {aba === 'lancamentos' ? (
          registrosCombinados.length === 0 ? (
            <p className="px-4 py-6 text-center text-[14px] font-semibold text-[var(--rota-text-soft)]">
              Nenhum ganho, gasto ou entrega registrado neste período.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--rota-line)]">
              {registrosVisiveis.map((reg) => {
                if (reg.tipoRegistro === 'entrega') {
                  const { entrega } = reg;
                  const tituloEntrega = `Entrega · ${formatarKm(entrega.km)} km · ${formatarDuracaoCurta(entrega.duracaoSegundos)}`;
                  const temValor =
                    typeof entrega.valor === 'number' && entrega.valor > 0;
                  return (
                    <li
                      key={`ent-${entrega.id}`}
                      className="flex min-h-[56px] items-center justify-between gap-2 px-4 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold text-[var(--rota-text)] tabular-nums">
                          {tituloEntrega}
                        </p>
                        <p className="truncate text-[13px] font-semibold text-[var(--rota-text-soft)] tabular-nums">
                          {formatarDataHora(entrega.fimIso)}
                          {entrega.plataforma
                            ? ` · ${rotuloCategoria(entrega.plataforma)}`
                            : ''}
                        </p>
                      </div>

                      <div className="-mr-2 flex shrink-0 items-center">
                        {temValor && (
                          <span className="mr-1 text-[15px] font-extrabold text-[var(--rota-accent)] tabular-nums whitespace-nowrap">
                            {formatarMoeda(entrega.valor!)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setEntregaConfirmandoExcluir(entrega)}
                          aria-label={`Excluir ${tituloEntrega}`}
                          className="flex h-[48px] w-[48px] items-center justify-center rounded-[12px] text-[var(--rota-text-soft)] hover:bg-[var(--rota-danger-tint)] hover:text-[var(--rota-danger)] active:scale-[0.98]"
                        >
                          <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  );
                }

                const { item } = reg;
                const ehGanho = item.tipo === TipoLancamento.GANHO;
                const nomeCategoria = rotuloCategoria(item.categoria);
                return (
                  <li
                    key={item.id}
                    className="flex min-h-[56px] items-center justify-between gap-2 px-4 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold text-[var(--rota-text)]">
                        {nomeCategoria}
                      </p>
                      <p className="truncate text-[13px] font-semibold text-[var(--rota-text-soft)] tabular-nums">
                        {formatarDataHora(item.data)}
                        {ehGanho && obterEntregasLancamento(item) > 1
                          ? ` · ${obterEntregasLancamento(item)} entregas`
                          : ''}
                        {typeof item.kmEntrega === 'number' &&
                        item.kmEntrega > 0
                          ? ` · ${formatarKm(item.kmEntrega)} km`
                          : ''}
                        {item.observacao ? ` · ${item.observacao}` : ''}
                      </p>
                    </div>

                    <div className="-mr-2 flex shrink-0 items-center">
                      <span
                        className={`mr-1 text-[15px] font-extrabold tabular-nums whitespace-nowrap ${
                          ehGanho
                            ? 'text-[var(--rota-success)]'
                            : 'text-[var(--rota-danger)]'
                        }`}
                      >
                        {ehGanho ? '+' : '−'} {formatarMoeda(item.valor)}
                      </span>
                      <button
                        type="button"
                        onClick={() => abrirEdicao(item)}
                        aria-label={`Editar ${nomeCategoria} de ${formatarMoeda(item.valor)}`}
                        className="flex h-[48px] w-[48px] items-center justify-center rounded-[12px] text-[var(--rota-text-soft)] hover:bg-[var(--rota-surface-2)] hover:text-[var(--rota-text)] active:scale-[0.98]"
                      >
                        <Pencil className="h-4 w-4 shrink-0" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onExcluirLancamento(item.id)}
                        aria-label={`Excluir ${nomeCategoria} de ${formatarMoeda(item.valor)}`}
                        className="flex h-[48px] w-[48px] items-center justify-center rounded-[12px] text-[var(--rota-text-soft)] hover:bg-[var(--rota-danger-tint)] hover:text-[var(--rota-danger)] active:scale-[0.98]"
                      >
                        <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : trajetosOrdenados.length === 0 ? (
          <p className="px-4 py-6 text-center text-[14px] font-semibold text-[var(--rota-text-soft)]">
            Nenhum trajeto salvo neste período.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--rota-line)]">
            {trajetosVisiveis.map((trajeto) => (
              <li
                key={trajeto.id}
                className="flex min-h-[56px] items-center justify-between gap-2 px-4 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-extrabold text-[var(--rota-text)] tabular-nums">
                    {formatarKm(trajeto.km)} km
                  </p>
                  <p className="truncate text-[13px] font-semibold text-[var(--rota-text-soft)] tabular-nums">
                    {formatarDataHora(trajeto.data)} ·{' '}
                    {trajeto.origem === 'gps' ? 'GPS' : 'Manual'}
                    {trajeto.duracaoSegundos
                      ? ` · ${formatarDuracao(trajeto.duracaoSegundos)}`
                      : ''}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onExcluirTrajeto(trajeto.id)}
                  aria-label={`Excluir trajeto de ${formatarKm(trajeto.km)} km`}
                  className="-mr-2 flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-[12px] text-[var(--rota-text-soft)] hover:bg-[var(--rota-danger-tint)] hover:text-[var(--rota-danger)] active:scale-[0.98]"
                >
                  <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {totalListaAtual > LIMITE_INICIAL && (
        <button
          type="button"
          onClick={() => setMostrarTodos((prev) => !prev)}
          className="rota-card flex min-h-[48px] w-full items-center justify-center px-4 text-[14px] font-bold text-[var(--rota-accent)] active:scale-[0.99]"
        >
          {mostrarTodos ? 'Mostrar menos' : `Ver todos (${totalListaAtual})`}
        </button>
      )}

      {/* Modal de edição */}
      {itemEditando && (
        <div
          onClick={() => setItemEditando(null)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ backgroundColor: 'var(--rota-backdrop)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-editar-lancamento"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] overflow-y-auto w-full sm:max-w-[460px] rounded-t-[20px] sm:rounded-[20px] bg-[var(--rota-bg)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3"
          >
            <div className="flex items-center justify-between gap-3">
              <h2
                id="titulo-editar-lancamento"
                className="text-[20px] font-extrabold text-[var(--rota-text)]"
              >
                Editar lançamento
              </h2>
              <button
                type="button"
                onClick={() => setItemEditando(null)}
                className="inline-flex min-h-[48px] items-center justify-center rounded-[14px] px-3 text-[15px] font-bold text-[var(--rota-text-soft)] hover:text-[var(--rota-text)]"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={salvarEdicao} className="rota-card p-4 space-y-3">
              <div
                role="tablist"
                aria-label="Tipo de lançamento"
                className="rota-segmented grid-cols-2"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={editTipo === TipoLancamento.GANHO}
                  onClick={() => {
                    setEditTipo(TipoLancamento.GANHO);
                    setEditCategoria(Plataforma.IFOOD);
                  }}
                  className={`rota-segmented-btn ${
                    editTipo === TipoLancamento.GANHO
                      ? 'rota-segmented-btn-active'
                      : 'rota-segmented-btn-idle'
                  }`}
                >
                  Ganho
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={editTipo === TipoLancamento.GASTO}
                  onClick={() => {
                    setEditTipo(TipoLancamento.GASTO);
                    setEditCategoria(CategoriaGasto.COMBUSTIVEL);
                  }}
                  className={`rota-segmented-btn ${
                    editTipo === TipoLancamento.GASTO
                      ? 'rota-segmented-btn-active'
                      : 'rota-segmented-btn-idle'
                  }`}
                >
                  Gasto
                </button>
              </div>

              <div>
                <span className="mb-1.5 block text-[13px] font-bold text-[var(--rota-text-soft)]">
                  {editTipo === TipoLancamento.GANHO
                    ? 'Plataforma'
                    : 'Categoria'}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {(editTipo === TipoLancamento.GANHO
                    ? PLATAFORMAS
                    : CATEGORIAS_GASTO
                  ).map((cat) => {
                    const ativo = editCategoria === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        aria-pressed={ativo}
                        onClick={() => setEditCategoria(cat)}
                        className={`h-[48px] rounded-[14px] border-2 px-3 text-[14px] font-bold truncate transition-colors ${
                          ativo
                            ? 'bg-[var(--rota-accent-tint)] border-[var(--rota-accent)] text-[var(--rota-accent)]'
                            : 'bg-[var(--rota-surface-2)] border-transparent text-[var(--rota-text)]'
                        }`}
                      >
                        {rotuloCategoria(cat)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label
                  htmlFor="input-edit-valor"
                  className="mb-1.5 block text-[13px] font-bold text-[var(--rota-text-soft)]"
                >
                  Valor
                </label>
                <div className="rota-input flex h-[48px] items-center px-3.5">
                  <span className="mr-2 text-[15px] font-bold text-[var(--rota-text-soft)]">
                    R$
                  </span>
                  <input
                    id="input-edit-valor"
                    type="text"
                    inputMode="decimal"
                    value={editValorTexto}
                    onChange={(e) => {
                      setEditValorTexto(e.target.value);
                      if (editErro) setEditErro(null);
                    }}
                    className="w-full bg-transparent text-[16px] font-extrabold text-[var(--rota-text)] focus:outline-none tabular-nums"
                  />
                </div>
                {editErro && (
                  <p className="mt-1.5 text-[13px] font-bold text-[var(--rota-danger)]">
                    {editErro}
                  </p>
                )}
              </div>

              {editTipo === TipoLancamento.GANHO && (
                <div>
                  <label
                    htmlFor="input-edit-entregas"
                    className="mb-1.5 block text-[13px] font-bold text-[var(--rota-text-soft)]"
                  >
                    Entregas
                  </label>
                  <div className="rota-input flex h-[48px] items-center px-3.5">
                    <input
                      id="input-edit-entregas"
                      type="text"
                      inputMode="numeric"
                      value={editEntregasTexto}
                      onChange={(e) =>
                        setEditEntregasTexto(e.target.value.replace(/\D/g, ''))
                      }
                      className="w-full bg-transparent text-[16px] font-extrabold text-[var(--rota-text)] focus:outline-none tabular-nums"
                    />
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="input-edit-obs"
                  className="mb-1.5 block text-[13px] font-bold text-[var(--rota-text-soft)]"
                >
                  Observação
                </label>
                <div className="rota-input flex h-[48px] items-center px-3.5">
                  <input
                    id="input-edit-obs"
                    type="text"
                    maxLength={80}
                    value={editObs}
                    onChange={(e) => setEditObs(e.target.value)}
                    placeholder="Opcional"
                    className="w-full bg-transparent text-[15px] font-semibold text-[var(--rota-text)] placeholder:text-[var(--rota-text-soft)] focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="flex h-[52px] w-full items-center justify-center rounded-[14px] bg-[var(--rota-accent)] text-[15px] font-extrabold text-[var(--rota-on-accent)] active:scale-[0.98]"
              >
                Salvar alterações
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Confirmação de exclusão de entrega */}
      {entregaConfirmandoExcluir && (
        <div
          onClick={() => setEntregaConfirmandoExcluir(null)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ backgroundColor: 'var(--rota-backdrop)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-excluir-entrega"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-[420px] rounded-t-[20px] sm:rounded-[20px] bg-[var(--rota-bg)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3"
          >
            <h2
              id="titulo-excluir-entrega"
              className="text-[18px] font-extrabold text-[var(--rota-text)]"
            >
              Excluir entrega
            </h2>
            <p className="text-[14px] font-semibold text-[var(--rota-text-soft)]">
              {entregaConfirmandoExcluir.lancamentoId
                ? `Entrega de ${formatarKm(entregaConfirmandoExcluir.km)} km (${formatarMoeda(entregaConfirmandoExcluir.valor ?? 0)}). Também excluir o lançamento de ganho vinculado?`
                : `Deseja excluir a entrega de ${formatarKm(entregaConfirmandoExcluir.km)} km?`}
            </p>

            <div className="space-y-2">
              {entregaConfirmandoExcluir.lancamentoId ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const id = entregaConfirmandoExcluir.id;
                      setEntregaConfirmandoExcluir(null);
                      onExcluirEntrega?.(id, true);
                    }}
                    className="flex h-[48px] w-full items-center justify-center rounded-[14px] bg-[var(--rota-danger)] px-4 text-[14px] font-extrabold text-white active:scale-[0.98]"
                  >
                    Excluir entrega e ganho
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const id = entregaConfirmandoExcluir.id;
                      setEntregaConfirmandoExcluir(null);
                      onExcluirEntrega?.(id, false);
                    }}
                    className="flex h-[48px] w-full items-center justify-center rounded-[14px] bg-[var(--rota-surface-2)] px-4 text-[14px] font-extrabold text-[var(--rota-text)] active:scale-[0.98]"
                  >
                    Excluir só a entrega
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const id = entregaConfirmandoExcluir.id;
                    setEntregaConfirmandoExcluir(null);
                    onExcluirEntrega?.(id, false);
                  }}
                  className="flex h-[48px] w-full items-center justify-center rounded-[14px] bg-[var(--rota-danger)] px-4 text-[14px] font-extrabold text-white active:scale-[0.98]"
                >
                  Excluir entrega
                </button>
              )}

              <button
                type="button"
                onClick={() => setEntregaConfirmandoExcluir(null)}
                className="flex h-[48px] w-full items-center justify-center rounded-[14px] bg-[var(--rota-surface)] px-4 text-[14px] font-bold text-[var(--rota-text-soft)] active:scale-[0.98]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
