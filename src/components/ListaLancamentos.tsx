import React, { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import {
  CATEGORIAS_GASTO,
  CategoriaGasto,
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
  formatarKm,
  formatarMoeda,
  parseValorNumerico,
  rotuloCategoria,
} from '../utils/formatters';

interface ListaLancamentosProps {
  periodo: FiltroPeriodo;
  onMudarPeriodo: (periodo: FiltroPeriodo) => void;
  lancamentos: Lancamento[];
  trajetos: Trajeto[];
  onEditarLancamento: (atualizado: Lancamento) => void;
  onExcluirLancamento: (id: string) => void;
  onExcluirTrajeto: (id: string) => void;
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
  onEditarLancamento,
  onExcluirLancamento,
  onExcluirTrajeto,
}) => {
  const [aba, setAba] = useState<'lancamentos' | 'trajetos'>('lancamentos');
  const [mostrarTodos, setMostrarTodos] = useState<boolean>(false);

  const [itemEditando, setItemEditando] = useState<Lancamento | null>(null);
  const [editTipo, setEditTipo] = useState<TipoLancamento>(TipoLancamento.GANHO);
  const [editCategoria, setEditCategoria] = useState<Plataforma | CategoriaGasto>(
    Plataforma.IFOOD
  );
  const [editValorTexto, setEditValorTexto] = useState<string>('');
  const [editObs, setEditObs] = useState<string>('');
  const [editErro, setEditErro] = useState<string | null>(null);

  useEffect(() => {
    setMostrarTodos(false);
  }, [periodo, aba]);

  const abrirEdicao = (item: Lancamento) => {
    setItemEditando(item);
    setEditTipo(item.tipo);
    setEditCategoria(item.categoria);
    setEditValorTexto(item.valor.toFixed(2).replace('.', ','));
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
    });
    setItemEditando(null);
  };

  const lancamentosOrdenados = [...lancamentos].sort(
    (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
  );

  const trajetosOrdenados = [...trajetos].sort(
    (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
  );

  const lancamentosVisiveis = mostrarTodos
    ? lancamentosOrdenados
    : lancamentosOrdenados.slice(0, LIMITE_INICIAL);

  const trajetosVisiveis = mostrarTodos
    ? trajetosOrdenados
    : trajetosOrdenados.slice(0, LIMITE_INICIAL);

  const totalListaAtual =
    aba === 'lancamentos'
      ? lancamentosOrdenados.length
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
          Lançamentos ({lancamentosOrdenados.length})
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
          lancamentosOrdenados.length === 0 ? (
            <p className="px-4 py-6 text-center text-[14px] font-semibold text-[var(--rota-text-soft)]">
              Nenhum ganho ou gasto registrado neste período.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--rota-line)]">
              {lancamentosVisiveis.map((item) => {
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
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ backgroundColor: 'var(--rota-backdrop)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-editar-lancamento"
        >
          <div className="w-full sm:max-w-[460px] rounded-t-[20px] sm:rounded-[20px] bg-[var(--rota-bg)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3">
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
    </div>
  );
};
