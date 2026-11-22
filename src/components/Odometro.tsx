import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Lancamento,
  PLATAFORMAS,
  Plataforma,
  StatusOdometro,
  TipoLancamento,
} from '../types';
import {
  formatarDuracao,
  formatarKm,
  formatarMoeda,
  parseValorNumerico,
  rotuloCategoria,
} from '../utils/formatters';
import { calcularDistanciaHaversineKm, Coordenada } from '../utils/geo';
import {
  EntregaEmAndamento,
  carregarEntregaEmAndamento,
  carregarKmEmAndamento,
  carregarTempoOdometroSegundos,
  carregarUltimoKmPainel,
  salvarEntregaEmAndamento,
  salvarKmEmAndamento,
  salvarTempoOdometroSegundos,
  salvarUltimoKmPainel,
} from '../utils/storage';

interface OdometroProps {
  oculto?: boolean;
  lancamentos?: Lancamento[];
  onSalvarTrajeto: (
    km: number,
    origem: 'gps' | 'manual',
    duracaoSegundos?: number
  ) => void;
  onFinalizarEntrega?: (dados: {
    valor: number;
    categoria: Plataforma;
    kmEntrega?: number;
    duracaoEntregaSegundos?: number;
    observacao?: string;
  }) => void;
  onStatusChange?: (info: {
    status: StatusOdometro;
    km: number;
    tempoSegundos: number;
    entregaAtiva: boolean;
    kmEntregaAtual: number;
  }) => void;
}

export type CodigoErroGeolocalizacao =
  | 'PERMISSION_DENIED'
  | 'POSITION_UNAVAILABLE'
  | 'TIMEOUT'
  | 'UNSUPPORTED'
  | 'INSECURE_CONTEXT'
  | 'UNKNOWN';

interface ErroGeolocalizacaoState {
  codigo: CodigoErroGeolocalizacao;
  mensagem: string;
  sugestao: string;
  mensagemOriginal?: string;
  ocorreuEm: string;
  bloqueadoPorIframe?: boolean;
  podeTentarNovamente?: boolean;
}

const PRECISAO_MAXIMA_METROS = 40;
const DESLOCAMENTO_MINIMO_METROS = 5;
const SALTO_MAXIMO_KM = 2;

function registrarLogErroGps(registro: ErroGeolocalizacaoState, codeNum?: number) {
  console.error('[Rota · Monitoramento GPS] Falha na geolocalização:', {
    codigo: registro.codigo,
    codeNumber: codeNum ?? null,
    mensagemTraduzida: registro.mensagem,
    sugestao: registro.sugestao,
    mensagemOriginal: registro.mensagemOriginal ?? null,
    horario: registro.ocorreuEm,
    emIframe: typeof window !== 'undefined' && window.self !== window.top,
    contextoSeguro: typeof window !== 'undefined' && window.isSecureContext,
  });
}

function traduzirErroGeolocalizacao(
  erro: GeolocationPositionError
): ErroGeolocalizacaoState {
  const ocorreuEm = new Date().toISOString();
  const emIframe = typeof window !== 'undefined' && window.self !== window.top;
  const msgOriginal = erro.message || '';
  const msgLower = msgOriginal.toLowerCase();
  const bloqueioPolitica =
    msgLower.includes('permissions policy') ||
    msgLower.includes('feature policy') ||
    msgLower.includes('disabled in this document');

  if (erro.code === erro.PERMISSION_DENIED) {
    if (bloqueioPolitica || emIframe) {
      return {
        codigo: 'PERMISSION_DENIED',
        mensagem:
          'Acesso ao GPS bloqueado nesta janela de visualização (permissão negada).',
        sugestao:
          'Abra o aplicativo em uma nova aba e verifique se o serviço de localização do celular está ativo.',
        mensagemOriginal: msgOriginal,
        ocorreuEm,
        bloqueadoPorIframe: true,
        podeTentarNovamente: true,
      };
    }

    return {
      codigo: 'PERMISSION_DENIED',
      mensagem: 'Permissão de acesso à localização foi negada.',
      sugestao:
        'Verifique se o serviço de localização do celular está ativo e libere a permissão de GPS nas configurações do navegador.',
      mensagemOriginal: msgOriginal,
      ocorreuEm,
      podeTentarNovamente: true,
    };
  }

  if (erro.code === erro.POSITION_UNAVAILABLE) {
    return {
      codigo: 'POSITION_UNAVAILABLE',
      mensagem: 'Posição GPS indisponível no momento.',
      sugestao:
        'Verifique se o serviço de localização (GPS) do celular está ativo e tente em um local com melhor recepção.',
      mensagemOriginal: msgOriginal,
      ocorreuEm,
      podeTentarNovamente: true,
    };
  }

  if (erro.code === erro.TIMEOUT) {
    return {
      codigo: 'TIMEOUT',
      mensagem: 'Tempo esgotado ao aguardar resposta do GPS.',
      sugestao:
        'Verifique se o serviço de localização do celular está ativo, aguarde em área aberta ou tente novamente.',
      mensagemOriginal: msgOriginal,
      ocorreuEm,
      podeTentarNovamente: true,
    };
  }

  return {
    codigo: 'UNKNOWN',
    mensagem: 'Não foi possível obter a localização pelo GPS.',
    sugestao:
      'Verifique se o serviço de localização do celular está ativo ou adicione os km manualmente.',
    mensagemOriginal: msgOriginal,
    ocorreuEm,
    podeTentarNovamente: true,
  };
}

export const Odometro: React.FC<OdometroProps> = ({
  oculto = false,
  lancamentos = [],
  onSalvarTrajeto,
  onFinalizarEntrega,
  onStatusChange,
}) => {
  const [kmAtual, setKmAtual] = useState<number>(() => carregarKmEmAndamento());
  const [tempoSegundos, setTempoSegundos] = useState<number>(() =>
    carregarTempoOdometroSegundos()
  );
  const [status, setStatus] = useState<StatusOdometro>(() =>
    carregarKmEmAndamento() > 0 || carregarTempoOdometroSegundos() > 0
      ? 'paused'
      : 'idle'
  );
  const [entregaAtiva, setEntregaAtiva] = useState<EntregaEmAndamento | null>(
    () => carregarEntregaEmAndamento()
  );

  const [sheetAberto, setSheetAberto] = useState<boolean>(false);
  const [modalEntregaAberto, setModalEntregaAberto] = useState<boolean>(false);
  const [entregaPlataforma, setEntregaPlataforma] = useState<Plataforma>(
    Plataforma.IFOOD
  );
  const [entregaValorTexto, setEntregaValorTexto] = useState<string>('');
  const [entregaObs, setEntregaObs] = useState<string>('');
  const [erroEntrega, setErroEntrega] = useState<string | null>(null);
  const [avisoTrajeto, setAvisoTrajeto] = useState<string | null>(null);

  const [precisaoMetros, setPrecisaoMetros] = useState<number | null>(null);
  const [velocidadeKmh, setVelocidadeKmh] = useState<number | null>(null);
  const [aguardandoSinal, setAguardandoSinal] = useState<boolean>(false);
  const [wakeLockAtivo, setWakeLockAtivo] = useState<boolean>(false);
  const [erroGps, setErroGps] = useState<ErroGeolocalizacaoState | null>(null);

  const [modoManual, setModoManual] = useState<'distancia' | 'painel'>('distancia');
  const [kmManualTexto, setKmManualTexto] = useState<string>('');
  const [kmInicialTexto, setKmInicialTexto] = useState<string>(() => {
    const ultimo = carregarUltimoKmPainel();
    return ultimo > 0 ? ultimo.toFixed(1).replace('.', ',') : '';
  });
  const [kmFinalTexto, setKmFinalTexto] = useState<string>('');
  const [erroManual, setErroManual] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const ultimoPontoRef = useRef<Coordenada | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const statusRef = useRef<StatusOdometro>(status);
  const kmAtualRef = useRef<number>(kmAtual);

  const plataformasOrdenadas = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const item of lancamentos) {
      if (item.tipo === TipoLancamento.GANHO) {
        contagem.set(item.categoria, (contagem.get(item.categoria) ?? 0) + 1);
      }
    }
    return [...PLATAFORMAS].sort((a, b) => {
      const diff = (contagem.get(b) ?? 0) - (contagem.get(a) ?? 0);
      if (diff !== 0) return diff;
      return PLATAFORMAS.indexOf(a) - PLATAFORMAS.indexOf(b);
    });
  }, [lancamentos]);

  const kmEntregaAtual = entregaAtiva
    ? Math.max(0, kmAtual - entregaAtiva.kmInicio)
    : 0;
  const tempoEntregaAtual = entregaAtiva
    ? Math.max(0, tempoSegundos - entregaAtiva.tempoInicioSegundos)
    : 0;

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    kmAtualRef.current = kmAtual;
    salvarKmEmAndamento(kmAtual);
  }, [kmAtual]);

  useEffect(() => {
    salvarTempoOdometroSegundos(tempoSegundos);
  }, [tempoSegundos]);

  useEffect(() => {
    salvarEntregaEmAndamento(entregaAtiva);
  }, [entregaAtiva]);

  useEffect(() => {
    onStatusChange?.({
      status,
      km: kmAtual,
      tempoSegundos,
      entregaAtiva: Boolean(entregaAtiva),
      kmEntregaAtual,
    });
  }, [status, kmAtual, tempoSegundos, entregaAtiva, kmEntregaAtual, onStatusChange]);

  useEffect(() => {
    if (status !== 'running') return;
    const timer = window.setInterval(() => {
      setTempoSegundos((anterior) => anterior + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const mostrarFeedback = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => {
      setFeedback((atual) => (atual === msg ? null : atual));
    }, 2500);
  };

  const liberarWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // Ignora erro caso já liberado pelo navegador
      } finally {
        wakeLockRef.current = null;
        setWakeLockAtivo(false);
      }
    }
  }, []);

  const solicitarWakeLock = useCallback(async () => {
    if (
      typeof navigator === 'undefined' ||
      !('wakeLock' in navigator) ||
      document.visibilityState !== 'visible'
    ) {
      return;
    }
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      wakeLockRef.current = sentinel;
      setWakeLockAtivo(true);
      sentinel.addEventListener('release', () => {
        wakeLockRef.current = null;
        setWakeLockAtivo(false);
      });
    } catch {
      setWakeLockAtivo(false);
    }
  }, []);

  const pararWatchGps = useCallback(() => {
    if (watchIdRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    ultimoPontoRef.current = null;
    setAguardandoSinal(false);
  }, []);

  const processarPosicaoGps = useCallback((posicao: GeolocationPosition) => {
    const { latitude, longitude, accuracy, speed } = posicao.coords;

    if (!Number.isFinite(accuracy)) return;
    setPrecisaoMetros(Math.round(accuracy));
    if (typeof speed === 'number' && Number.isFinite(speed) && speed >= 0) {
      setVelocidadeKmh(Math.round(speed * 3.6));
    }

    if (accuracy > PRECISAO_MAXIMA_METROS) {
      return;
    }

    setAguardandoSinal(false);
    setErroGps(null);
    const novoPonto: Coordenada = { lat: latitude, lon: longitude };

    if (!ultimoPontoRef.current) {
      ultimoPontoRef.current = novoPonto;
      return;
    }

    const distanciaKm = calcularDistanciaHaversineKm(
      ultimoPontoRef.current,
      novoPonto
    );
    const distanciaMetros = distanciaKm * 1000;

    if (distanciaMetros < DESLOCAMENTO_MINIMO_METROS) {
      return;
    }

    if (distanciaKm > SALTO_MAXIMO_KM) {
      return;
    }

    setKmAtual((anterior) => anterior + distanciaKm);
    ultimoPontoRef.current = novoPonto;
  }, []);

  const tratarErroWatchGps = useCallback(
    (erro: GeolocationPositionError) => {
      setAguardandoSinal(false);
      const registroErro = traduzirErroGeolocalizacao(erro);
      registrarLogErroGps(registroErro, erro.code);
      setErroGps(registroErro);
      setSheetAberto(true);

      if (registroErro.codigo === 'PERMISSION_DENIED') {
        pararWatchGps();
        void liberarWakeLock();
        setStatus(kmAtualRef.current > 0 ? 'paused' : 'idle');
      }
    },
    [liberarWakeLock, pararWatchGps]
  );

  const iniciarWatchGps = useCallback(() => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      const registroErro: ErroGeolocalizacaoState = {
        codigo: 'INSECURE_CONTEXT',
        mensagem: 'O GPS exige conexão segura (HTTPS) para funcionar.',
        sugestao:
          'Acesse o aplicativo por HTTPS e verifique se o serviço de localização do celular está ativo.',
        ocorreuEm: new Date().toISOString(),
      };
      registrarLogErroGps(registroErro);
      setErroGps(registroErro);
      setSheetAberto(true);
      setStatus(kmAtualRef.current > 0 ? 'paused' : 'idle');
      return;
    }

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      const registroErro: ErroGeolocalizacaoState = {
        codigo: 'UNSUPPORTED',
        mensagem: 'GPS automático não é compatível com este navegador.',
        sugestao:
          'Use outro navegador atualizado ou adicione os quilômetros manualmente.',
        ocorreuEm: new Date().toISOString(),
      };
      registrarLogErroGps(registroErro);
      setErroGps(registroErro);
      setSheetAberto(true);
      setStatus(kmAtualRef.current > 0 ? 'paused' : 'idle');
      return;
    }

    pararWatchGps();
    setErroGps(null);
    setAguardandoSinal(true);
    setStatus('running');

    watchIdRef.current = navigator.geolocation.watchPosition(
      processarPosicaoGps,
      tratarErroWatchGps,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      }
    );
  }, [pararWatchGps, processarPosicaoGps, tratarErroWatchGps]);

  useEffect(() => {
    let permissionStatus: PermissionStatus | null = null;
    const handlePermChange = () => {
      if (permissionStatus?.state === 'granted') {
        setErroGps(null);
      }
    };

    if ('permissions' in navigator && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((res) => {
          permissionStatus = res;
          res.addEventListener('change', handlePermChange);
        })
        .catch(() => {
          // Alguns navegadores não suportam query('geolocation')
        });
    }

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        statusRef.current === 'running'
      ) {
        void solicitarWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      permissionStatus?.removeEventListener('change', handlePermChange);
      pararWatchGps();
      void liberarWakeLock();
    };
  }, [liberarWakeLock, pararWatchGps, solicitarWakeLock]);

  const handleIniciarOuContinuar = () => {
    setAvisoTrajeto(null);
    iniciarWatchGps();
    void solicitarWakeLock();
  };

  const handlePausar = () => {
    pararWatchGps();
    void liberarWakeLock();
    setStatus('paused');
  };

  const handleIniciarEntrega = () => {
    setAvisoTrajeto(null);
    if (status !== 'running') {
      iniciarWatchGps();
      void solicitarWakeLock();
    }
    setEntregaAtiva({
      ativa: true,
      kmInicio: kmAtual,
      tempoInicioSegundos: tempoSegundos,
      iniciadaEm: new Date().toISOString(),
    });
  };

  const handleAbrirModalEntrega = () => {
    setAvisoTrajeto(null);
    setEntregaPlataforma(plataformasOrdenadas[0] ?? Plataforma.IFOOD);
    setEntregaValorTexto('');
    setEntregaObs('');
    setErroEntrega(null);
    setModalEntregaAberto(true);
  };

  const handleCancelarEntrega = () => {
    setEntregaAtiva(null);
    setModalEntregaAberto(false);
    setErroEntrega(null);
    setAvisoTrajeto(null);
  };

  const handleConfirmarEntrega = (e: React.FormEvent) => {
    e.preventDefault();
    setErroEntrega(null);

    const valor = parseValorNumerico(entregaValorTexto);
    if (Number.isNaN(valor) || valor <= 0) {
      setErroEntrega('Informe o valor da entrega maior que R$ 0,00.');
      return;
    }

    const kmParaSalvar = Number(kmEntregaAtual.toFixed(2));
    const duracaoParaSalvar = Math.max(0, Math.floor(tempoEntregaAtual));

    onFinalizarEntrega?.({
      valor: Number(valor.toFixed(2)),
      categoria: entregaPlataforma,
      kmEntrega: kmParaSalvar > 0 ? kmParaSalvar : undefined,
      duracaoEntregaSegundos:
        duracaoParaSalvar > 0 ? duracaoParaSalvar : undefined,
      observacao: entregaObs.trim() || undefined,
    });

    setEntregaAtiva(null);
    setModalEntregaAberto(false);
    setEntregaValorTexto('');
    setEntregaObs('');
    mostrarFeedback(`${formatarMoeda(valor)} salvo!`);
  };

  const handleSalvarTrajetoGps = () => {
    if (kmAtual <= 0) return;
    if (entregaAtiva) {
      setAvisoTrajeto(
        'Finalize ou cancele a entrega em andamento antes de encerrar o turno.'
      );
      return;
    }
    setAvisoTrajeto(null);
    const kmParaSalvar = Number(kmAtual.toFixed(2));
    pararWatchGps();
    void liberarWakeLock();
    onSalvarTrajeto(
      kmParaSalvar > 0 ? kmParaSalvar : kmAtual,
      'gps',
      tempoSegundos > 0 ? tempoSegundos : undefined
    );
    setKmAtual(0);
    setTempoSegundos(0);
    setPrecisaoMetros(null);
    setVelocidadeKmh(null);
    setErroGps(null);
    setStatus('idle');
    setSheetAberto(false);
    mostrarFeedback('Turno encerrado!');
  };

  const handleZerar = () => {
    pararWatchGps();
    void liberarWakeLock();
    setKmAtual(0);
    setTempoSegundos(0);
    setEntregaAtiva(null);
    setModalEntregaAberto(false);
    setAvisoTrajeto(null);
    setPrecisaoMetros(null);
    setVelocidadeKmh(null);
    setErroGps(null);
    setStatus('idle');
  };

  const kmInicialLimpo = kmInicialTexto.trim().replace(',', '.');
  const kmInicialEhZero =
    kmInicialLimpo !== '' && Number(kmInicialLimpo) === 0;
  const kmInicialNum = kmInicialEhZero
    ? 0
    : parseValorNumerico(kmInicialTexto);
  const kmFinalNum = parseValorNumerico(kmFinalTexto);
  const distanciaPainelValida =
    !Number.isNaN(kmInicialNum) &&
    !Number.isNaN(kmFinalNum) &&
    kmFinalNum > kmInicialNum
      ? Number((kmFinalNum - kmInicialNum).toFixed(2))
      : null;

  const handleAdicionarManual = (e: React.FormEvent) => {
    e.preventDefault();
    setErroManual(null);

    if (modoManual === 'painel') {
      if (Number.isNaN(kmInicialNum) || kmInicialNum < 0) {
        setErroManual('Informe o km inicial do painel.');
        return;
      }
      if (Number.isNaN(kmFinalNum) || kmFinalNum <= kmInicialNum) {
        setErroManual('O km final deve ser maior que o km inicial.');
        return;
      }
      const distancia = Number((kmFinalNum - kmInicialNum).toFixed(2));
      onSalvarTrajeto(distancia, 'manual');
      salvarUltimoKmPainel(kmFinalNum);
      setKmInicialTexto(kmFinalNum.toFixed(1).replace('.', ','));
      setKmFinalTexto('');
      setSheetAberto(false);
      return;
    }

    const valor = parseValorNumerico(kmManualTexto);
    if (Number.isNaN(valor) || valor <= 0) {
      setErroManual('Digite uma distância válida em km.');
      return;
    }
    onSalvarTrajeto(Number(valor.toFixed(2)), 'manual');
    setKmManualTexto('');
    setSheetAberto(false);
  };

  const rotuloTopoOdometro =
    status === 'running'
      ? 'Odômetro · rodando'
      : status === 'paused'
        ? 'Odômetro · pausado'
        : 'Odômetro · parado';

  const kmFormatadoCasinhas = Math.max(0, kmAtual).toFixed(1);
  const [parteInteiraRaw, parteDecimal = '0'] = kmFormatadoCasinhas.split('.');
  const digitosInteiros = parteInteiraRaw.padStart(4, '0').split('');

  const subtituloFaixa =
    status === 'idle' && tempoSegundos === 0
      ? '00:00:00 em rota · Toque para detalhes'
      : `${formatarDuracao(tempoSegundos)} em rota${
          status === 'running' && velocidadeKmh !== null && velocidadeKmh > 0
            ? ` · ${velocidadeKmh} km/h`
            : ''
        }`;

  const textoStatusSheet =
    status === 'running'
      ? aguardandoSinal
        ? 'Buscando sinal GPS'
        : 'GPS ativo'
      : status === 'paused'
        ? 'Pausado'
        : 'Pronto para rodar';

  return (
    <>
      {/* Cartão compacto com visual de hodômetro mecânico na aba Hoje */}
      {!oculto && (
        <div
          onClick={() => setSheetAberto(true)}
          className="rota-card cursor-pointer px-3.5 sm:px-4 py-2.5 space-y-2"
        >
          <div className="flex items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSheetAberto(true);
              }}
              aria-label={`${rotuloTopoOdometro}: ${formatarKm(kmAtual)} km. Toque para detalhes.`}
              className="flex min-w-0 flex-1 flex-col items-start overflow-hidden text-left"
            >
              <span className="max-w-full truncate text-[13px] leading-[18px] font-bold text-[var(--rota-text-soft)]">
                {rotuloTopoOdometro}
              </span>

              <div
                className="mt-1 flex max-w-full flex-nowrap items-baseline gap-[3px] sm:gap-[4px]"
                aria-hidden="true"
              >
                {digitosInteiros.map((digito, idx) => (
                  <span key={idx} className="rota-odo-digit">
                    {digito}
                  </span>
                ))}
                <span className="text-[22px] leading-none font-extrabold text-[var(--rota-text)]">
                  ,
                </span>
                <span className="rota-odo-digit-decimal">{parteDecimal}</span>
                <span className="ml-0.5 shrink-0 text-[14px] sm:text-[15px] leading-none font-extrabold text-[var(--rota-text-soft)]">
                  km
                </span>
              </div>

              <span className="mt-1 w-full truncate text-[13px] leading-[18px] font-semibold text-[var(--rota-text-soft)] tabular-nums">
                {subtituloFaixa}
              </span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (status === 'running') {
                  handlePausar();
                } else {
                  handleIniciarOuContinuar();
                }
              }}
              className={`inline-flex h-[48px] min-w-[92px] sm:min-w-[100px] shrink-0 items-center justify-center rounded-[14px] px-3 text-[14px] font-extrabold whitespace-nowrap active:scale-[0.98] ${
                status === 'running'
                  ? 'bg-[var(--rota-surface-2)] text-[var(--rota-text)]'
                  : 'bg-[var(--rota-accent)] text-[var(--rota-on-accent)]'
              }`}
            >
              {status === 'running'
                ? 'Pausar'
                : status === 'paused'
                  ? 'Continuar'
                  : 'Iniciar'}
            </button>
          </div>

          <div className="flex items-center justify-between gap-2.5 border-t border-[var(--rota-line)] pt-2">
            {entregaAtiva ? (
              <>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] leading-[18px] font-extrabold text-[var(--rota-success)] tabular-nums">
                    Em entrega · {formatarKm(kmEntregaAtual)} km
                  </span>
                  <span className="block truncate text-[13px] leading-[18px] font-semibold text-[var(--rota-text-soft)] tabular-nums">
                    {formatarDuracao(tempoEntregaAtual)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAbrirModalEntrega();
                  }}
                  className="inline-flex h-[48px] shrink-0 items-center justify-center rounded-[14px] bg-[var(--rota-accent)] px-3.5 text-[13px] font-extrabold text-[var(--rota-on-accent)] whitespace-nowrap active:scale-[0.98]"
                >
                  Finalizar entrega
                </button>
              </>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] leading-[18px] font-bold text-[var(--rota-text)]">
                    Recorte por entrega
                  </span>
                  <span className="block truncate text-[13px] leading-[18px] font-semibold text-[var(--rota-text-soft)]">
                    {status === 'running'
                      ? 'Em deslocamento'
                      : 'Toque ao pegar o pedido'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleIniciarEntrega();
                  }}
                  className="inline-flex h-[48px] shrink-0 items-center justify-center rounded-[14px] bg-[var(--rota-accent-tint)] px-3.5 text-[13px] font-extrabold text-[var(--rota-accent)] whitespace-nowrap active:scale-[0.98]"
                >
                  Iniciar entrega
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Bottom sheet de detalhes do odômetro */}
      {sheetAberto && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center"
          style={{ backgroundColor: 'var(--rota-backdrop)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-odometro-sheet"
        >
          <div className="max-h-[92dvh] w-full sm:max-w-[460px] overflow-y-auto rounded-t-[20px] sm:rounded-[20px] bg-[var(--rota-bg)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2
                id="titulo-odometro-sheet"
                className="text-[20px] font-extrabold text-[var(--rota-text)]"
              >
                Odômetro
              </h2>
              <button
                type="button"
                onClick={() => setSheetAberto(false)}
                className="inline-flex min-h-[48px] items-center justify-center rounded-[14px] px-3 text-[15px] font-bold text-[var(--rota-text-soft)] hover:text-[var(--rota-text)]"
              >
                Fechar
              </button>
            </div>

            {/* Leitura GPS e controles do turno */}
            <div className="rota-card p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold text-[var(--rota-text-soft)] tabular-nums">
                  {textoStatusSheet}
                  {(status === 'running' || tempoSegundos > 0) &&
                    ` · ${formatarDuracao(tempoSegundos)}`}
                  {status === 'running' && precisaoMetros !== null
                    ? ` · Precisão ${precisaoMetros} m`
                    : ''}
                  {status === 'running' && wakeLockAtivo
                    ? ' · Tela ativa'
                    : ''}
                </span>
                {feedback && (
                  <span className="text-[13px] font-bold text-[var(--rota-success)]">
                    {feedback}
                  </span>
                )}
              </div>

              <div className="flex items-baseline justify-center gap-1.5 py-1">
                <span className="text-[40px] leading-none font-extrabold text-[var(--rota-text)] tabular-nums">
                  {formatarKm(kmAtual)}
                </span>
                <span className="text-[15px] font-bold text-[var(--rota-text-soft)]">
                  km
                </span>
              </div>

              {erroGps && (
                <div
                  role="alert"
                  className="rounded-[14px] bg-[var(--rota-danger-tint)] p-3.5 space-y-2"
                >
                  <p className="text-[14px] font-extrabold text-[var(--rota-danger)]">
                    {erroGps.mensagem}
                  </p>
                  <p className="text-[13px] font-semibold text-[var(--rota-text)]">
                    {erroGps.sugestao}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {erroGps.bloqueadoPorIframe &&
                      typeof window !== 'undefined' && (
                        <a
                          href={window.location.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[48px] items-center justify-center rounded-[14px] bg-[var(--rota-accent)] px-4 text-[14px] font-extrabold text-[var(--rota-on-accent)]"
                        >
                          Abrir em nova aba
                        </a>
                      )}
                    {erroGps.podeTentarNovamente && (
                      <button
                        type="button"
                        onClick={handleIniciarOuContinuar}
                        className="inline-flex min-h-[48px] items-center justify-center rounded-[14px] bg-[var(--rota-surface)] px-4 text-[14px] font-extrabold text-[var(--rota-text)]"
                      >
                        Tentar novamente
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={
                      status === 'running'
                        ? handlePausar
                        : handleIniciarOuContinuar
                    }
                    className={`flex h-[48px] items-center justify-center rounded-[14px] px-3 text-[15px] font-extrabold whitespace-nowrap active:scale-[0.98] ${
                      status === 'running'
                        ? 'bg-[var(--rota-surface-2)] text-[var(--rota-text)]'
                        : 'bg-[var(--rota-accent)] text-[var(--rota-on-accent)]'
                    }`}
                  >
                    {status === 'running'
                      ? 'Pausar'
                      : status === 'paused'
                        ? 'Continuar'
                        : 'Iniciar'}
                  </button>

                  <button
                    type="button"
                    onClick={handleSalvarTrajetoGps}
                    disabled={kmAtual <= 0}
                    className={`flex h-[48px] items-center justify-center rounded-[14px] px-3 text-[15px] font-extrabold whitespace-nowrap active:scale-[0.98] ${
                      kmAtual > 0
                        ? 'bg-[var(--rota-surface-2)] text-[var(--rota-text)]'
                        : 'bg-[var(--rota-surface-2)] text-[var(--rota-text-soft)] opacity-50 cursor-not-allowed'
                    }`}
                  >
                    Encerrar turno
                  </button>
                </div>

                {status === 'paused' && (kmAtual > 0 || tempoSegundos > 0) && (
                  <button
                    type="button"
                    onClick={handleZerar}
                    className="flex h-[48px] w-full items-center justify-center rounded-[14px] bg-[var(--rota-danger-tint)] px-4 text-[14px] font-extrabold text-[var(--rota-danger)] active:scale-[0.98]"
                  >
                    Descartar turno atual
                  </button>
                )}
              </div>

              {avisoTrajeto && (
                <p className="text-[13px] font-bold text-[var(--rota-danger)]">
                  {avisoTrajeto}
                </p>
              )}

              {/* Corte de entrega sem parar o odômetro */}
              {status !== 'idle' && (
                <div className="pt-2 border-t border-[var(--rota-line)]">
                  {entregaAtiva ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <span className="block text-[14px] font-extrabold text-[var(--rota-text)]">
                            Entrega em andamento
                          </span>
                          <span className="block text-[13px] font-semibold text-[var(--rota-text-soft)] tabular-nums">
                            {formatarDuracao(tempoEntregaAtual)}
                          </span>
                        </div>
                        <span className="text-[18px] font-extrabold text-[var(--rota-success)] tabular-nums">
                          {formatarKm(kmEntregaAtual)} km
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleAbrirModalEntrega}
                          className="flex min-h-[48px] flex-1 items-center justify-center rounded-[14px] bg-[var(--rota-accent)] px-4 text-[14px] font-extrabold text-[var(--rota-on-accent)] active:scale-[0.98]"
                        >
                          Finalizar entrega
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelarEntrega}
                          className="flex min-h-[48px] items-center justify-center rounded-[14px] bg-[var(--rota-surface-2)] px-4 text-[14px] font-bold text-[var(--rota-text-soft)] active:scale-[0.98]"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleIniciarEntrega}
                      className="flex min-h-[48px] w-full items-center justify-center rounded-[14px] bg-[var(--rota-accent-tint)] px-4 text-[14px] font-extrabold text-[var(--rota-accent)] active:scale-[0.98]"
                    >
                      Iniciar entrega
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Modo manual (Distância ou Painel) */}
            <form
              onSubmit={handleAdicionarManual}
              className="rota-card p-4 space-y-3"
            >
              <h3 className="text-[15px] font-extrabold text-[var(--rota-text)]">
                Lançar km manual
              </h3>

              <div
                role="tablist"
                aria-label="Modo de entrada manual de quilômetros"
                className="rota-segmented grid-cols-2"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={modoManual === 'distancia'}
                  onClick={() => {
                    setModoManual('distancia');
                    setErroManual(null);
                  }}
                  className={`rota-segmented-btn ${
                    modoManual === 'distancia'
                      ? 'rota-segmented-btn-active'
                      : 'rota-segmented-btn-idle'
                  }`}
                >
                  Distância
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={modoManual === 'painel'}
                  onClick={() => {
                    setModoManual('painel');
                    setErroManual(null);
                  }}
                  className={`rota-segmented-btn ${
                    modoManual === 'painel'
                      ? 'rota-segmented-btn-active'
                      : 'rota-segmented-btn-idle'
                  }`}
                >
                  Painel
                </button>
              </div>

              {modoManual === 'distancia' ? (
                <div className="flex items-center gap-2">
                  <div className="rota-input flex h-[48px] flex-1 items-center px-3.5">
                    <input
                      id="input-km-manual"
                      type="text"
                      inputMode="decimal"
                      value={kmManualTexto}
                      onChange={(e) => {
                        setKmManualTexto(e.target.value);
                        if (erroManual) setErroManual(null);
                      }}
                      placeholder="Ex: 38,5"
                      className="w-full bg-transparent text-[16px] font-extrabold text-[var(--rota-text)] placeholder:text-[var(--rota-text-soft)]/60 focus:outline-none tabular-nums"
                    />
                    <span className="ml-2 text-[13px] font-bold text-[var(--rota-text-soft)]">
                      km
                    </span>
                  </div>
                  <button
                    type="submit"
                    className="flex h-[48px] shrink-0 items-center justify-center rounded-[14px] bg-[var(--rota-accent)] px-4 text-[14px] font-extrabold text-[var(--rota-on-accent)] active:scale-[0.98]"
                  >
                    Adicionar
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="input-km-inicial"
                        className="mb-1 block text-[13px] font-bold text-[var(--rota-text-soft)]"
                      >
                        Km inicial
                      </label>
                      <div className="rota-input flex h-[48px] items-center px-3">
                        <input
                          id="input-km-inicial"
                          type="text"
                          inputMode="decimal"
                          value={kmInicialTexto}
                          onChange={(e) => {
                            setKmInicialTexto(e.target.value);
                            if (erroManual) setErroManual(null);
                          }}
                          placeholder="42150"
                          className="w-full bg-transparent text-[15px] font-extrabold text-[var(--rota-text)] placeholder:text-[var(--rota-text-soft)]/60 focus:outline-none tabular-nums"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="input-km-final"
                        className="mb-1 block text-[13px] font-bold text-[var(--rota-text-soft)]"
                      >
                        Km final
                      </label>
                      <div className="rota-input flex h-[48px] items-center px-3">
                        <input
                          id="input-km-final"
                          type="text"
                          inputMode="decimal"
                          value={kmFinalTexto}
                          onChange={(e) => {
                            setKmFinalTexto(e.target.value);
                            if (erroManual) setErroManual(null);
                          }}
                          placeholder="42238"
                          className="w-full bg-transparent text-[15px] font-extrabold text-[var(--rota-text)] placeholder:text-[var(--rota-text-soft)]/60 focus:outline-none tabular-nums"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-bold text-[var(--rota-text-soft)] tabular-nums">
                      {distanciaPainelValida !== null
                        ? `Distância: ${formatarKm(distanciaPainelValida)} km`
                        : 'Informe o painel da moto'}
                    </span>
                    <button
                      type="submit"
                      className="flex h-[48px] shrink-0 items-center justify-center rounded-[14px] bg-[var(--rota-accent)] px-4 text-[14px] font-extrabold text-[var(--rota-on-accent)] active:scale-[0.98]"
                    >
                      Salvar km
                    </button>
                  </div>
                </div>
              )}

              {erroManual && (
                <p className="text-[13px] font-bold text-[var(--rota-danger)]">
                  {erroManual}
                </p>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Modal para finalizar entrega sem parar o odômetro */}
      {modalEntregaAberto && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
          style={{ backgroundColor: 'var(--rota-backdrop)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-finalizar-entrega"
        >
          <div className="rota-card w-full max-w-[420px] p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3
                id="titulo-finalizar-entrega"
                className="text-[18px] font-extrabold text-[var(--rota-text)]"
              >
                Finalizar entrega
              </h3>
              <button
                type="button"
                onClick={() => setModalEntregaAberto(false)}
                className="inline-flex min-h-[48px] items-center px-2 text-[14px] font-bold text-[var(--rota-text-soft)]"
              >
                Fechar
              </button>
            </div>

            <div className="flex items-center justify-between rounded-[14px] bg-[var(--rota-surface-2)] px-4 py-3 tabular-nums">
              <span className="text-[14px] font-extrabold text-[var(--rota-text)]">
                {formatarKm(kmEntregaAtual)} km
              </span>
              <span className="text-[13px] font-bold text-[var(--rota-text-soft)]">
                {formatarDuracao(tempoEntregaAtual)}
              </span>
            </div>

            <form onSubmit={handleConfirmarEntrega} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {plataformasOrdenadas.map((plat) => {
                  const ativo = entregaPlataforma === plat;
                  return (
                    <button
                      key={plat}
                      type="button"
                      aria-pressed={ativo}
                      onClick={() => setEntregaPlataforma(plat)}
                      className={`h-[48px] rounded-[14px] border-2 px-3 text-[14px] font-extrabold truncate transition-colors ${
                        ativo
                          ? 'bg-[var(--rota-accent-tint)] border-[var(--rota-accent)] text-[var(--rota-accent)]'
                          : 'bg-[var(--rota-surface-2)] border-transparent text-[var(--rota-text)]'
                      }`}
                    >
                      {rotuloCategoria(plat)}
                    </button>
                  );
                })}
              </div>

              <div>
                <label
                  htmlFor="input-valor-entrega-odometro"
                  className="mb-1 block text-[13px] font-bold text-[var(--rota-text-soft)]"
                >
                  Valor da entrega
                </label>
                <div className="rota-input flex h-[52px] items-center px-3.5">
                  <span className="mr-2 text-[16px] font-extrabold text-[var(--rota-text-soft)]">
                    R$
                  </span>
                  <input
                    id="input-valor-entrega-odometro"
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    value={entregaValorTexto}
                    onChange={(e) => {
                      setEntregaValorTexto(e.target.value);
                      if (erroEntrega) setErroEntrega(null);
                    }}
                    placeholder="0,00"
                    className="w-full bg-transparent text-[20px] font-extrabold text-[var(--rota-text)] placeholder:text-[var(--rota-text-soft)]/50 focus:outline-none tabular-nums"
                  />
                </div>
                {erroEntrega && (
                  <p className="mt-1.5 text-[13px] font-bold text-[var(--rota-danger)]">
                    {erroEntrega}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="input-obs-entrega-odometro"
                  className="mb-1 block text-[13px] font-bold text-[var(--rota-text-soft)]"
                >
                  Observação (opcional)
                </label>
                <div className="rota-input flex h-[48px] items-center px-3.5">
                  <input
                    id="input-obs-entrega-odometro"
                    type="text"
                    maxLength={80}
                    value={entregaObs}
                    onChange={(e) => setEntregaObs(e.target.value)}
                    placeholder="Ex: gorjeta, taxa extra"
                    className="w-full bg-transparent text-[14px] font-semibold text-[var(--rota-text)] placeholder:text-[var(--rota-text-soft)] focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="flex h-[56px] w-full items-center justify-center rounded-[14px] bg-[var(--rota-accent)] text-[15px] font-extrabold text-[var(--rota-on-accent)] active:scale-[0.98]"
              >
                Salvar entrega
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
