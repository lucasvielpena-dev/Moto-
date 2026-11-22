import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Lancamento, Trajeto } from '../types';
import { formatarKm, parseValorNumerico } from '../utils/formatters';
import {
  BackupRota,
  ConfigTrocaOleo,
  PreferenciaTema,
  carregarConfigOleo,
  gerarConteudoCsv,
  salvarConfigOleo,
  validarEConverterBackupJson,
} from '../utils/storage';
import { PWAInstallButton } from './PWAInstallButton';

interface ManutencaoBackupProps {
  tema: PreferenciaTema;
  onMudarTema: (tema: PreferenciaTema) => void;
  todosLancamentos: Lancamento[];
  todosTrajetos: Trajeto[];
  metaDiaria: number;
  onMudarMetaDiaria: (meta: number) => void;
  minLucroKm: number;
  onMudarMinLucroKm: (valor: number) => void;
  percentualReserva: number;
  configOleoExterna?: ConfigTrocaOleo;
  onMudarConfigOleo?: (config: ConfigTrocaOleo) => void;
  onRestaurarBackup: (
    lancamentos: Lancamento[],
    trajetos: Trajeto[],
    metaDiaria: number,
    configOleo?: ConfigTrocaOleo,
    percentualReserva?: number,
    minLucroKm?: number
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
  percentualReserva,
  configOleoExterna,
  onMudarConfigOleo,
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
  const [intervaloOleoTexto, setIntervaloOleoTexto] = useState<string>(() =>
    String(configOleo.intervaloKm)
  );
  const [mensagemBackup, setMensagemBackup] = useState<{
    texto: string;
    erro?: boolean;
  } | null>(null);
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
    const payload: BackupRota = {
      versao: 1,
      exportadoEm: new Date().toISOString(),
      metaDiaria,
      minLucroKm,
      percentualReserva,
      configOleo,
      lancamentos: todosLancamentos,
      trajetos: todosTrajetos,
    };
    baixarArquivo(
      JSON.stringify(payload, null, 2),
      `rota-backup-${dataStr}.json`,
      'application/json'
    );
    exibirMensagemBackup('Backup salvo no aparelho!');
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
        backup.minLucroKm
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

      {/* Backup JSON e CSV */}
      <section aria-labelledby="titulo-planilha-backup" className="rota-card p-3.5">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <h3
            id="titulo-planilha-backup"
            className="text-[15px] font-extrabold text-[var(--rota-text)]"
          >
            Backup e planilha
          </h3>
          {mensagemBackup && (
            <span
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
    </div>
  );
};
