import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Printer, Share2, Trash2 } from 'lucide-react';
import { Lancamento, Trajeto, Vencimento } from '../types';
import {
  formatarKm,
  formatarMoeda,
  parseValorNumerico,
} from '../utils/formatters';
import {
  BackupRota,
  ConfigTrocaOleo,
  PreferenciaTema,
  carregarConfigOleo,
  gerarConteudoCsv,
  gerarId,
  salvarConfigOleo,
  validarEConverterBackupJson,
} from '../utils/storage';
import {
  SUGESTOES_VENCIMENTO,
  calcularDiasParaVencimento,
  formatarDataVencimento,
} from '../utils/vencimentos';
import { PWAInstallButton } from './PWAInstallButton';
import { RelatorioMensalModal } from './RelatorioMensalModal';

interface ResumoHojeCompartilhar {
  ganhos: number;
  gastos: number;
  lucro: number;
  km: number;
  entregas: number;
  lucroPorKm: number;
}

interface ManutencaoBackupProps {
  tema: PreferenciaTema;
  onMudarTema: (tema: PreferenciaTema) => void;
  todosLancamentos: Lancamento[];
  todosTrajetos: Trajeto[];
  metaDiaria: number;
  onMudarMetaDiaria: (meta: number) => void;
  minLucroKm: number;
  onMudarMinLucroKm: (valor: number) => void;
  reservaKm: number;
  onMudarReservaKm: (valor: number) => void;
  reservaMes: number;
  onMudarReservaMes: (valor: number) => void;
  vencimentos: Vencimento[];
  onMudarVencimentos: (vencimentos: Vencimento[]) => void;
  percentualReserva: number;
  configOleoExterna?: ConfigTrocaOleo;
  onMudarConfigOleo?: (config: ConfigTrocaOleo) => void;
  resumoHoje: ResumoHojeCompartilhar;
  onRestaurarBackup: (
    lancamentos: Lancamento[],
    trajetos: Trajeto[],
    metaDiaria: number,
    configOleo?: ConfigTrocaOleo,
    percentualReserva?: number,
    minLucroKm?: number,
    reservaKm?: number,
    reservaMes?: number,
    vencimentos?: Vencimento[]
  ) => void;
}

function baixarArquivo(conteudo: string, nomeArquivo: string, mime: string) {
  const blob = new Blob([conteudo], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copiarTextoAreaTransferencia(texto: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // fallback below
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = texto;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

const OPCOES_TEMA: { valor: PreferenciaTema; rotulo: string }[] = [
  { valor: 'auto', rotulo: 'Automático' },
  { valor: 'claro', rotulo: 'Claro' },
  { valor: 'escuro', rotulo: 'Escuro' },
];

export const ManutencaoBackup: React.FC<ManutencaoBackupProps> = ({
  tema,
  onMudarTema,
  todosLancamentos,
  todosTrajetos,
  metaDiaria,
  onMudarMetaDiaria,
  minLucroKm,
  onMudarMinLucroKm,
  reservaKm,
  onMudarReservaKm,
  reservaMes,
  onMudarReservaMes,
  vencimentos,
  onMudarVencimentos,
  percentualReserva,
  configOleoExterna,
  onMudarConfigOleo,
  resumoHoje,
  onRestaurarBackup,
}) => {
  const [configOleoInterna, setConfigOleoInterna] = useState<ConfigTrocaOleo>(
    () => configOleoExterna ?? carregarConfigOleo()
  );
  const configOleo = configOleoExterna ?? configOleoInterna;

  const [metaTexto, setMetaTexto] = useState<string>(() =>
    metaDiaria > 0 ? metaDiaria.toFixed(2).replace('.', ',') : ''
  );
  const [minLucroTexto, setMinLucroTexto] = useState<string>(() =>
    minLucroKm > 0 ? minLucroKm.toFixed(2).replace('.', ',') : ''
  );
  const [reservaKmTexto, setReservaKmTexto] = useState<string>(() =>
    reservaKm > 0 ? reservaKm.toFixed(2).replace('.', ',') : ''
  );
  const [reservaMesTexto, setReservaMesTexto] = useState<string>(() =>
    reservaMes > 0 ? reservaMes.toFixed(2).replace('.', ',') : ''
  );
  const [intervaloOleoTexto, setIntervaloOleoTexto] = useState<string>(() =>
    String(configOleo.intervaloKm)
  );
  const [mensagemBackup, setMensagemBackup] = useState<{
    texto: string;
    erro?: boolean;
  } | null>(null);
  const [relatorioMesAberto, setRelatorioMesAberto] = useState<boolean>(false);

  // Vencimentos UI state
  const [editandoVencimentoId, setEditandoVencimentoId] = useState<
    string | null
  >(null);
  const [vencimentoNome, setVencimentoNome] = useState<string>('');
  const [vencimentoData, setVencimentoData] = useState<string>('');
  const [erroVencimento, setErroVencimento] = useState<string | null>(null);
  const inputVencimentoDataRef = useRef<HTMLInputElement | null>(null);

  const inputRestoreRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setIntervaloOleoTexto(String(configOleo.intervaloKm));
  }, [configOleo.intervaloKm]);

  useEffect(() => {
    const parsed = parseValorNumerico(metaTexto);
    if (metaDiaria <= 0 && metaTexto.trim() !== '') {
      setMetaTexto('');
    } else if (
      metaDiaria > 0 &&
      (Number.isNaN(parsed) || Math.abs(parsed - metaDiaria) > 0.009)
    ) {
      setMetaTexto(metaDiaria.toFixed(2).replace('.', ','));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaDiaria]);

  useEffect(() => {
    const parsed = parseValorNumerico(minLucroTexto);
    if (minLucroKm <= 0 && minLucroTexto.trim() !== '') {
      setMinLucroTexto('');
    } else if (
      minLucroKm > 0 &&
      (Number.isNaN(parsed) || Math.abs(parsed - minLucroKm) > 0.009)
    ) {
      setMinLucroTexto(minLucroKm.toFixed(2).replace('.', ','));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minLucroKm]);

  useEffect(() => {
    const parsed = parseValorNumerico(reservaKmTexto);
    if (reservaKm <= 0 && reservaKmTexto.trim() !== '') {
      setReservaKmTexto('');
    } else if (
      reservaKm > 0 &&
      (Number.isNaN(parsed) || Math.abs(parsed - reservaKm) > 0.009)
    ) {
      setReservaKmTexto(reservaKm.toFixed(2).replace('.', ','));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservaKm]);

  useEffect(() => {
    const parsed = parseValorNumerico(reservaMesTexto);
    if (reservaMes <= 0 && reservaMesTexto.trim() !== '') {
      setReservaMesTexto('');
    } else if (
      reservaMes > 0 &&
      (Number.isNaN(parsed) || Math.abs(parsed - reservaMes) > 0.009)
    ) {
      setReservaMesTexto(reservaMes.toFixed(2).replace('.', ','));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservaMes]);

  const handleMetaChange = (valorDigitado: string) => {
    setMetaTexto(valorDigitado);
    if (!valorDigitado.trim()) {
      onMudarMetaDiaria(0);
      return;
    }
    const parsed = parseValorNumerico(valorDigitado);
    if (!Number.isNaN(parsed) && parsed > 0) {
      onMudarMetaDiaria(Number(parsed.toFixed(2)));
    }
  };

  const handleMinLucroChange = (valorDigitado: string) => {
    setMinLucroTexto(valorDigitado);
    const limpo = valorDigitado.trim().replace(',', '.');
    if (limpo === '' || Number(limpo) === 0) {
      onMudarMinLucroKm(0);
      return;
    }
    const parsed = parseValorNumerico(valorDigitado);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      onMudarMinLucroKm(Number(parsed.toFixed(2)));
    }
  };

  const handleReservaKmChange = (valorDigitado: string) => {
    setReservaKmTexto(valorDigitado);
    const limpo = valorDigitado.trim().replace(',', '.');
    if (limpo === '' || Number(limpo) === 0) {
      onMudarReservaKm(0);
      return;
    }
    const parsed = parseValorNumerico(valorDigitado);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      onMudarReservaKm(Number(parsed.toFixed(2)));
    }
  };

  const handleReservaMesChange = (valorDigitado: string) => {
    setReservaMesTexto(valorDigitado);
    const limpo = valorDigitado.trim().replace(',', '.');
    if (limpo === '' || Number(limpo) === 0) {
      onMudarReservaMes(0);
      return;
    }
    const parsed = parseValorNumerico(valorDigitado);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      onMudarReservaMes(Number(parsed.toFixed(2)));
    }
  };

  const atualizarConfigOleo = (atualizado: ConfigTrocaOleo) => {
    if (onMudarConfigOleo) {
      onMudarConfigOleo(atualizado);
    } else {
      setConfigOleoInterna(atualizado);
      salvarConfigOleo(atualizado);
    }
  };

  const exibirMensagemBackup = (texto: string, erro = false) => {
    setMensagemBackup({ texto, erro });
    window.setTimeout(() => {
      setMensagemBackup((atual) => (atual?.texto === texto ? null : atual));
    }, 3000);
  };

  const totalKmHistorico = useMemo(
    () => todosTrajetos.reduce((acc, t) => acc + t.km, 0),
    [todosTrajetos]
  );

  const handleIntervaloOleoChange = (valorDigitado: string) => {
    setIntervaloOleoTexto(valorDigitado);
    const parsed = parseValorNumerico(valorDigitado);
    if (!Number.isNaN(parsed) && parsed >= 100) {
      atualizarConfigOleo({
        ...configOleo,
        intervaloKm: Math.round(parsed),
      });
    }
  };

  const handleRegistrarTrocaOleo = () => {
    atualizarConfigOleo({
      ...configOleo,
      kmBase: Number(totalKmHistorico.toFixed(2)),
      ultimaTrocaData: new Date().toISOString(),
    });
  };

  const kmDesdeTrocaOleo = Math.max(0, totalKmHistorico - configOleo.kmBase);
  const faltaParaTrocaOleo = Math.max(
    0,
    configOleo.intervaloKm - kmDesdeTrocaOleo
  );
  const progressoOleo =
    configOleo.intervaloKm > 0
      ? Math.min(100, (kmDesdeTrocaOleo / configOleo.intervaloKm) * 100)
      : 0;
  const oleoVencido = kmDesdeTrocaOleo >= configOleo.intervaloKm;

  const criarPayloadBackup = (): BackupRota => ({
    versao: 1,
    exportadoEm: new Date().toISOString(),
    metaDiaria,
    minLucroKm,
    reservaKm,
    reservaMes,
    percentualReserva,
    configOleo,
    vencimentos: vencimentos.length > 0 ? vencimentos : undefined,
    lancamentos: todosLancamentos,
    trajetos: todosTrajetos,
  });

  const handleExportarCsv = () => {
    if (todosLancamentos.length === 0 && todosTrajetos.length === 0) {
      exibirMensagemBackup('Não há dados para exportar ainda.', true);
      return;
    }
    const dataStr = new Date().toISOString().slice(0, 10);
    const csv = gerarConteudoCsv(todosLancamentos, todosTrajetos);
    baixarArquivo(
      csv,
      `rota-relatorio-${dataStr}.csv`,
      'text/csv;charset=utf-8;'
    );
    exibirMensagemBackup('Planilha CSV baixada!');
  };

  const handleSalvarBackup = () => {
    const dataStr = new Date().toISOString().slice(0, 10);
    const payload = criarPayloadBackup();
    baixarArquivo(
      JSON.stringify(payload, null, 2),
      `rota-backup-${dataStr}.json`,
      'application/json'
    );
    exibirMensagemBackup('Backup salvo no aparelho!');
  };

  const handleCompartilharBackup = async () => {
    const dataStr = new Date().toISOString().slice(0, 10);
    const nomeArquivo = `rota-backup-${dataStr}.json`;
    const json = JSON.stringify(criarPayloadBackup(), null, 2);

    try {
      const arquivo = new File([json], nomeArquivo, {
        type: 'application/json',
      });
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [arquivo] })
      ) {
        await navigator.share({
          files: [arquivo],
          title: 'Backup Rota',
        });
        exibirMensagemBackup('Backup compartilhado!');
        return;
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
    }

    baixarArquivo(json, nomeArquivo, 'application/json');
    exibirMensagemBackup('Backup baixado no aparelho!');
  };

  const handleCompartilharResumoDia = async () => {
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    const lucroKmTexto =
      resumoHoje.km > 0 ? formatarMoeda(resumoHoje.lucroPorKm) : '—';
    const texto = [
      `Rota — Resumo de hoje (${dataHoje})`,
      `Ganhos: ${formatarMoeda(resumoHoje.ganhos)}`,
      `Gastos: ${formatarMoeda(resumoHoje.gastos)}`,
      `Lucro: ${formatarMoeda(resumoHoje.lucro)}`,
      `Distância: ${formatarKm(resumoHoje.km)} km`,
      `Entregas: ${resumoHoje.entregas}`,
      `Lucro por km: ${lucroKmTexto}`,
    ].join('\n');

    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function'
    ) {
      try {
        await navigator.share({ text: texto });
        exibirMensagemBackup('Resumo compartilhado!');
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
      }
    }

    const copiado = await copiarTextoAreaTransferencia(texto);
    if (copiado) {
      exibirMensagemBackup('Resumo copiado!');
    } else {
      exibirMensagemBackup('Não foi possível copiar o resumo.', true);
    }
  };

  const handleArquivoBackupSelecionado = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const texto = await file.text();
      const backup = validarEConverterBackupJson(texto);
      if (!backup) {
        exibirMensagemBackup('Arquivo de backup inválido.', true);
        return;
      }

      onRestaurarBackup(
        backup.lancamentos,
        backup.trajetos,
        backup.metaDiaria,
        backup.configOleo,
        backup.percentualReserva,
        backup.minLucroKm,
        backup.reservaKm,
        backup.reservaMes,
        backup.vencimentos
      );

      if (backup.configOleo) {
        atualizarConfigOleo(backup.configOleo);
        setIntervaloOleoTexto(String(backup.configOleo.intervaloKm));
      }

      exibirMensagemBackup('Dados restaurados com sucesso!');
    } catch {
      exibirMensagemBackup('Não foi possível ler o arquivo.', true);
    }
  };

  const vencimentosOrdenados = useMemo(
    () =>
      [...vencimentos].sort((a, b) =>
        a.dataVencimento.localeCompare(b.dataVencimento)
      ),
    [vencimentos]
  );

  const handleSelecionarSugestaoVencimento = (sugestao: string) => {
    setEditandoVencimentoId(null);
    setVencimentoNome(sugestao);
    setErroVencimento(null);
    window.setTimeout(() => {
      inputVencimentoDataRef.current?.focus();
    }, 30);
  };

  const handleEditarVencimento = (item: Vencimento) => {
    setEditandoVencimentoId(item.id);
    setVencimentoNome(item.nome);
    setVencimentoData(item.dataVencimento);
    setErroVencimento(null);
  };

  const handleSalvarVencimento = (e: React.FormEvent) => {
    e.preventDefault();
    const nomeLimpo = vencimentoNome.trim();
    if (!nomeLimpo) {
      setErroVencimento('Informe o nome do documento.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimentoData)) {
      setErroVencimento('Escolha a data de vencimento.');
      return;
    }

    if (editandoVencimentoId) {
      onMudarVencimentos(
        vencimentos.map((v) =>
          v.id === editandoVencimentoId
            ? { ...v, nome: nomeLimpo, dataVencimento: vencimentoData }
            : v
        )
      );
    } else {
      onMudarVencimentos([
        ...vencimentos,
        {
          id: gerarId(),
          nome: nomeLimpo,
          dataVencimento: vencimentoData,
        },
      ]);
    }

    setEditandoVencimentoId(null);
    setVencimentoNome('');
    setVencimentoData('');
    setErroVencimento(null);
  };

  const handleExcluirVencimento = (id: string) => {
    onMudarVencimentos(vencimentos.filter((v) => v.id !== id));
    if (editandoVencimentoId === id) {
      setEditandoVencimentoId(null);
      setVencimentoNome('');
      setVencimentoData('');
    }
  };

  return (
    <div className="space-y-3">
      {/* Aparência */}
      <section aria-labelledby="titulo-aparencia" className="rota-card p-3.5">
        <h3
          id="titulo-aparencia"
          className="mb-2.5 text-[15px] font-extrabold text-[var(--rota-text)]"
        >
          Aparência
        </h3>
        <div
          role="tablist"
          aria-label="Tema do aplicativo"
          className="rota-segmented grid-cols-3"
        >
          {OPCOES_TEMA.map((opcao) => {
            const ativo = tema === opcao.valor;
            return (
              <button
                key={opcao.valor}
                type="button"
                role="tab"
                aria-selected={ativo}
                onClick={() => onMudarTema(opcao.valor)}
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
      </section>

      {/* Meta diária */}
      <section aria-labelledby="titulo-meta-diaria" className="rota-card p-3.5">
        <div className="flex items-center justify-between gap-3">
          <label
            id="titulo-meta-diaria"
            htmlFor="input-meta-diaria"
            className="text-[15px] font-extrabold text-[var(--rota-text)]"
          >
            Meta diária
          </label>
          <div className="rota-input flex h-[48px] w-[144px] shrink-0 items-center px-3">
            <span className="mr-1.5 text-[14px] font-bold text-[var(--rota-text-soft)]">
              R$
            </span>
            <input
              id="input-meta-diaria"
              type="text"
              inputMode="decimal"
              value={metaTexto}
              onChange={(e) => handleMetaChange(e.target.value)}
              placeholder="200,00"
              className="w-full bg-transparent text-right text-[16px] font-extrabold text-[var(--rota-text)] placeholder:text-[var(--rota-text-soft)]/60 focus:outline-none tabular-nums"
            />
          </div>
        </div>
      </section>

      {/* Lucro mínimo por km */}
      <section aria-labelledby="titulo-min-lucro-km" className="rota-card p-3.5">
        <div className="flex items-center justify-between gap-3">
          <label
            id="titulo-min-lucro-km"
            htmlFor="input-min-lucro-km"
            className="text-[15px] font-extrabold text-[var(--rota-text)]"
          >
            Lucro mínimo por km
          </label>
          <div className="rota-input flex h-[48px] w-[144px] shrink-0 items-center px-3">
            <span className="mr-1.5 text-[14px] font-bold text-[var(--rota-text-soft)]">
              R$
            </span>
            <input
              id="input-min-lucro-km"
              type="text"
              inputMode="decimal"
              value={minLucroTexto}
              onChange={(e) => handleMinLucroChange(e.target.value)}
              placeholder="0,00"
              className="w-full bg-transparent text-right text-[16px] font-extrabold text-[var(--rota-text)] placeholder:text-[var(--rota-text-soft)]/60 focus:outline-none tabular-nums"
            />
          </div>
        </div>
      </section>

      {/* Reservas (desgaste por km e reserva mensal) */}
      <section
        aria-labelledby="titulo-reservas"
        className="rota-card p-3.5 space-y-3"
      >
        <h3
          id="titulo-reservas"
          className="text-[15px] font-extrabold text-[var(--rota-text)]"
        >
          Reservas
        </h3>

        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="input-reserva-km"
            className="min-w-0 text-[14px] font-bold text-[var(--rota-text)] leading-snug"
          >
            Reserva de desgaste da moto (R$ por km)
          </label>
          <div className="rota-input flex h-[48px] w-[132px] shrink-0 items-center px-3">
            <span className="mr-1.5 text-[14px] font-bold text-[var(--rota-text-soft)]">
              R$
            </span>
            <input
              id="input-reserva-km"
              type="text"
              inputMode="decimal"
              value={reservaKmTexto}
              onChange={(e) => handleReservaKmChange(e.target.value)}
              placeholder="0,00"
              className="w-full bg-transparent text-right text-[16px] font-extrabold text-[var(--rota-text)] placeholder:text-[var(--rota-text-soft)]/60 focus:outline-none tabular-nums"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <label
              htmlFor="input-reserva-mes"
              className="block text-[14px] font-bold text-[var(--rota-text)] leading-snug"
            >
              Reserva mensal (R$)
            </label>
            <span className="block text-[13px] font-semibold text-[var(--rota-text-soft)]">
              IPVA, seguro, MEI etc.
            </span>
          </div>
          <div className="rota-input flex h-[48px] w-[132px] shrink-0 items-center px-3">
            <span className="mr-1.5 text-[14px] font-bold text-[var(--rota-text-soft)]">
              R$
            </span>
            <input
              id="input-reserva-mes"
              type="text"
              inputMode="decimal"
              value={reservaMesTexto}
              onChange={(e) => handleReservaMesChange(e.target.value)}
              placeholder="0,00"
              className="w-full bg-transparent text-right text-[16px] font-extrabold text-[var(--rota-text)] placeholder:text-[var(--rota-text-soft)]/60 focus:outline-none tabular-nums"
            />
          </div>
        </div>
      </section>

      {/* Troca de óleo */}
      <section aria-labelledby="titulo-troca-oleo" className="rota-card p-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <label
            id="titulo-troca-oleo"
            htmlFor="input-intervalo-oleo"
            className="text-[15px] font-extrabold text-[var(--rota-text)]"
          >
            Troca de óleo
          </label>
          <span className="text-[13px] font-bold text-[var(--rota-text-soft)] tabular-nums">
            {formatarKm(kmDesdeTrocaOleo)} / {configOleo.intervaloKm} km
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="rota-input flex h-[48px] flex-1 items-center px-3">
            <span className="mr-1.5 text-[13px] font-bold text-[var(--rota-text-soft)] whitespace-nowrap">
              A cada
            </span>
            <input
              id="input-intervalo-oleo"
              type="text"
              inputMode="numeric"
              value={intervaloOleoTexto}
              onChange={(e) => handleIntervaloOleoChange(e.target.value)}
              placeholder="1000"
              className="w-full bg-transparent text-[15px] font-extrabold text-[var(--rota-text)] focus:outline-none tabular-nums"
            />
            <span className="ml-1 text-[13px] font-bold text-[var(--rota-text-soft)]">
              km
            </span>
          </div>

          <button
            type="button"
            onClick={handleRegistrarTrocaOleo}
            className="inline-flex h-[48px] shrink-0 items-center justify-center rounded-[14px] bg-[var(--rota-surface-2)] px-4 text-[14px] font-extrabold text-[var(--rota-text)] whitespace-nowrap active:scale-[0.98]"
          >
            Troquei agora
          </button>
        </div>

        <div className="mt-2.5">
          <div
            role="progressbar"
            aria-label="Progresso até a próxima troca de óleo"
            aria-valuemin={0}
            aria-valuemax={configOleo.intervaloKm}
            aria-valuenow={Math.min(kmDesdeTrocaOleo, configOleo.intervaloKm)}
            className="h-2 w-full overflow-hidden rounded-full bg-[var(--rota-surface-2)]"
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progressoOleo}%`,
                backgroundColor: oleoVencido
                  ? 'var(--rota-danger)'
                  : 'var(--rota-accent)',
              }}
            />
          </div>
          <p className="mt-1.5 text-[13px] font-semibold tabular-nums">
            {oleoVencido ? (
              <span className="text-[var(--rota-danger)]">
                Troca recomendada agora (
                {formatarKm(kmDesdeTrocaOleo - configOleo.intervaloKm)} km
                acima)
              </span>
            ) : (
              <span className="text-[var(--rota-text-soft)]">
                Faltam {formatarKm(faltaParaTrocaOleo)} km para a próxima troca
              </span>
            )}
          </p>
        </div>
      </section>

      {/* Vencimentos */}
      <section
        aria-labelledby="titulo-vencimentos"
        className="rota-card p-3.5 space-y-3"
      >
        <h3
          id="titulo-vencimentos"
          className="text-[15px] font-extrabold text-[var(--rota-text)]"
        >
          Vencimentos
        </h3>

        <div className="grid grid-cols-2 gap-2">
          {SUGESTOES_VENCIMENTO.map((sugestao) => (
            <button
              key={sugestao}
              type="button"
              onClick={() => handleSelecionarSugestaoVencimento(sugestao)}
              className="flex h-[48px] items-center justify-center rounded-[12px] bg-[var(--rota-surface-2)] px-3 text-[13px] font-extrabold text-[var(--rota-text)] active:scale-[0.98]"
            >
              + {sugestao}
            </button>
          ))}
        </div>

        <form onSubmit={handleSalvarVencimento} className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="input-vencimento-nome"
                className="mb-1 block text-[13px] font-bold text-[var(--rota-text-soft)]"
              >
                Documento
              </label>
              <div className="rota-input flex h-[48px] items-center px-3">
                <input
                  id="input-vencimento-nome"
                  type="text"
                  maxLength={40}
                  value={vencimentoNome}
                  onChange={(e) => {
                    setVencimentoNome(e.target.value);
                    if (erroVencimento) setErroVencimento(null);
                  }}
                  placeholder="Ex: IPVA, CNH"
                  className="w-full bg-transparent text-[15px] font-bold text-[var(--rota-text)] placeholder:text-[var(--rota-text-soft)]/60 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="input-vencimento-data"
                className="mb-1 block text-[13px] font-bold text-[var(--rota-text-soft)]"
              >
                Vence em
              </label>
              <div className="rota-input flex h-[48px] items-center px-3">
                <input
                  ref={inputVencimentoDataRef}
                  id="input-vencimento-data"
                  type="date"
                  value={vencimentoData}
                  onChange={(e) => {
                    setVencimentoData(e.target.value);
                    if (erroVencimento) setErroVencimento(null);
                  }}
                  className="w-full bg-transparent text-[15px] font-bold text-[var(--rota-text)] focus:outline-none tabular-nums"
                />
              </div>
            </div>
          </div>

          {erroVencimento && (
            <p
              role="alert"
              className="text-[13px] font-bold text-[var(--rota-danger)]"
            >
              {erroVencimento}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex h-[48px] flex-1 items-center justify-center rounded-[14px] bg-[var(--rota-accent)] px-4 text-[14px] font-extrabold text-[var(--rota-on-accent)] active:scale-[0.98]"
            >
              {editandoVencimentoId ? 'Salvar edição' : 'Adicionar vencimento'}
            </button>
            {editandoVencimentoId && (
              <button
                type="button"
                onClick={() => {
                  setEditandoVencimentoId(null);
                  setVencimentoNome('');
                  setVencimentoData('');
                  setErroVencimento(null);
                }}
                className="flex h-[48px] items-center justify-center rounded-[14px] bg-[var(--rota-surface-2)] px-4 text-[14px] font-bold text-[var(--rota-text-soft)] active:scale-[0.98]"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>

        {vencimentosOrdenados.length > 0 && (
          <ul className="divide-y divide-[var(--rota-line)] border-t border-[var(--rota-line)] pt-1">
            {vencimentosOrdenados.map((item) => {
              const dias = calcularDiasParaVencimento(item.dataVencimento);
              const vencido = dias !== null && dias < 0;
              return (
                <li
                  key={item.id}
                  className="flex min-h-[52px] items-center justify-between gap-2 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-extrabold text-[var(--rota-text)]">
                      {item.nome}
                    </p>
                    <p
                      className={`text-[13px] font-semibold tabular-nums ${
                        vencido
                          ? 'text-[var(--rota-danger)]'
                          : 'text-[var(--rota-text-soft)]'
                      }`}
                    >
                      {formatarDataVencimento(item.dataVencimento)}
                      {dias !== null &&
                        (vencido
                          ? ' · Vencido'
                          : dias === 0
                            ? ' · Vence hoje'
                            : dias <= 30
                              ? ` · em ${dias} ${dias === 1 ? 'dia' : 'dias'}`
                              : '')}
                    </p>
                  </div>
                  <div className="-mr-2 flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => handleEditarVencimento(item)}
                      aria-label={`Editar ${item.nome}`}
                      className="flex h-[48px] w-[48px] items-center justify-center rounded-[12px] text-[var(--rota-text-soft)] hover:bg-[var(--rota-surface-2)] hover:text-[var(--rota-text)]"
                    >
                      <Pencil className="h-4 w-4 shrink-0" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExcluirVencimento(item.id)}
                      aria-label={`Excluir ${item.nome}`}
                      className="flex h-[48px] w-[48px] items-center justify-center rounded-[12px] text-[var(--rota-text-soft)] hover:bg-[var(--rota-danger-tint)] hover:text-[var(--rota-danger)]"
                    >
                      <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Dados: Backup, Compartilhar e Relatório do mês */}
      <section
        aria-labelledby="titulo-planilha-backup"
        className="rota-card p-3.5 space-y-2.5"
      >
        <div className="flex items-center justify-between gap-2">
          <h3
            id="titulo-planilha-backup"
            className="text-[15px] font-extrabold text-[var(--rota-text)]"
          >
            Dados e compartilhamento
          </h3>
          {mensagemBackup && (
            <span
              role="status"
              className={`text-[13px] font-bold ${
                mensagemBackup.erro
                  ? 'text-[var(--rota-danger)]'
                  : 'text-[var(--rota-success)]'
              }`}
            >
              {mensagemBackup.texto}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleSalvarBackup}
            className="flex h-[48px] items-center justify-center rounded-[14px] bg-[var(--rota-surface-2)] px-2 text-[14px] font-extrabold text-[var(--rota-text)] whitespace-nowrap active:scale-[0.98]"
          >
            Salvar
          </button>
          <button
            type="button"
            onClick={() => inputRestoreRef.current?.click()}
            className="flex h-[48px] items-center justify-center rounded-[14px] bg-[var(--rota-surface-2)] px-2 text-[14px] font-extrabold text-[var(--rota-text)] whitespace-nowrap active:scale-[0.98]"
          >
            Restaurar
          </button>
          <button
            type="button"
            onClick={handleExportarCsv}
            className="flex h-[48px] items-center justify-center rounded-[14px] bg-[var(--rota-surface-2)] px-2 text-[14px] font-extrabold text-[var(--rota-text)] whitespace-nowrap active:scale-[0.98]"
          >
            CSV
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleCompartilharBackup}
            className="flex h-[48px] items-center justify-center gap-2 rounded-[14px] bg-[var(--rota-surface-2)] px-3 text-[14px] font-extrabold text-[var(--rota-text)] active:scale-[0.98]"
          >
            <Share2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            Compartilhar backup
          </button>
          <button
            type="button"
            onClick={handleCompartilharResumoDia}
            className="flex h-[48px] items-center justify-center gap-2 rounded-[14px] bg-[var(--rota-surface-2)] px-3 text-[14px] font-extrabold text-[var(--rota-text)] active:scale-[0.98]"
          >
            <Share2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            Compartilhar resumo do dia
          </button>
        </div>

        <button
          type="button"
          onClick={() => setRelatorioMesAberto(true)}
          className="flex h-[48px] w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--rota-accent-tint)] px-3 text-[14px] font-extrabold text-[var(--rota-accent)] active:scale-[0.98]"
        >
          <Printer className="h-4 w-4 shrink-0" aria-hidden="true" />
          Relatório do mês
        </button>

        <input
          ref={inputRestoreRef}
          type="file"
          accept=".json,application/json"
          onChange={handleArquivoBackupSelecionado}
          className="hidden"
          aria-label="Selecionar arquivo de backup JSON"
        />
      </section>

      <PWAInstallButton />

      <RelatorioMensalModal
        aberto={relatorioMesAberto}
        onFechar={() => setRelatorioMesAberto(false)}
        todosLancamentos={todosLancamentos}
        todosTrajetos={todosTrajetos}
        reservaKm={reservaKm}
        reservaMes={reservaMes}
      />
    </div>
  );
};
