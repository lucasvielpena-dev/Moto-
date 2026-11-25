import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  BackgroundGeolocation,
  type Location as CapgoLocation,
} from '@capgo/background-geolocation';
import {
  Entrega,
  Lancamento,
  PLATAFORMAS,
  Plataforma,
  StatusOdometro,
  TipoLancamento,
} from '../types';
import {
  formatarDuracao,
  formatarDuracaoCurta,
  formatarKm,
  parseValorNumerico,
  rotuloCategoria,
} from '../utils/formatters';
import { calcularDistanciaHaversineKm, Coordenada } from '../utils/geo';
import {
  EntregaAtual,
  carregarEntregaAtual,
  carregarKmEmAndamento,
  carregarModoMovimento,
  carregarTempoOdometroSegundos,
  carregarUltimoKmPainel,
  salvarEntregaAtual,
  salvarKmEmAndamento,
  salvarTempoOdometroSegundos,
  salvarUltimoKmPainel,
} from '../utils/storage';
import { useNativeBackHandler } from '../utils/nativeBack';

export interface DadosEntregaFinalizada {
  inicioIso: string;
  fimIso: string;
  km: number;
  duracaoSegundos: number;
  valor?: number;
  plataforma?: Plataforma;
}

interface OdometroProps {
  oculto?: boolean;
  lancamentos?: Lancamento[];
  entregas?: Entrega[];
  triggerFinalizarSeq?: number;
  onSalvarTrajeto: (
    km: number,
    origem: 'gps' | 'manual',
    duracaoSegundos?: number
  ) => void;
  onFinalizarEntrega?: (dados: DadosEntregaFinalizada) => void;
  onStatusChange?: (info: {
    status: StatusOdometro;
    km: number;
    tempoSegundos: number;
    entregaAtiva: boolean;
    kmEntregaAtual: number;
    velocidadeKmh: number | null;
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
  podeAbrirConfiguracoes?: boolean;
}

const PRECISAO_MAXIMA_METROS = 40;
const DESLOCAMENTO_MINIMO_METROS = 5;
const SALTO_MAXIMO_KM = 2;
const LIMITE_SILENCIO_GPS_NATIVO_MS = 60_000;

function converterLocationNativaParaGeolocationPosition(
  loc: CapgoLocation
): GeolocationPosition {
  const coords: GeolocationCoordinates = {
    latitude: loc.latitude,
    longitude: loc.longitude,
    accuracy:
      typeof loc.accuracy === 'number' && Number.isFinite(loc.accuracy)
        ? loc.accuracy
        : Number.NaN,
    altitude: typeof loc.altitude === 'number' ? loc.altitude : null,
    altitudeAccuracy:
      typeof loc.altitudeAccuracy === 'number' ? loc.altitudeAccuracy : null,
    heading: typeof loc.bearing === 'number' ? loc.bearing : null,
    speed: typeof loc.speed === 'number' ? loc.speed : null,
    toJSON() {
      return {
        latitude: this.latitude,
        longitude: this.longitude,
        accuracy: this.accuracy,
        altitude: this.altitude,
        altitudeAccuracy: this.altitudeAccuracy,
        heading: this.heading,
        speed: this.speed,
      };
    },
  };
  const timestamp =
    typeof loc.time === 'number' && Number.isFinite(loc.time)
      ? loc.time
      : Date.now();
  return {
    coords,
    timestamp,
    toJSON() {
      return {
        coords: this.coords.toJSON(),
        timestamp: this.timestamp,
      };
    },
  };
}

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
  entregas = [],
  triggerFinalizarSeq = 0,
  onSalvarTrajeto,
  onFinalizarEntrega,
  onStatusChange,
}) => {
  const [kmAtual, setKmAtual] = useState<number>(() => carregarKmEmAndamento());
  const [tempoSegundos, setTempoSegundos] = useState<number>(() =>
    carregarTempoOdometroSegundos()
  );
  const [entregaAtiva, setEntregaAtiva] = useState<EntregaAtual | null>(() =>
    carregarEntregaAtual()
  );
  const [status, setStatus] = useState<StatusOdometro>(() =>
    carregarKmEmAndamento() > 0 ||
    carregarTempoOdometroSegundos() > 0 ||
    carregarEntregaAtual() !== null
      ? 'paused'
      : 'idle'
  );

  const [sheetAberto, setSheetAberto] = useState<boolean>(false);
  const [modalEntregaAberto, setModalEntregaAberto] = useState<boolean>(false);
  const [finalizandoSnapshot, setFinalizandoSnapshot] = useState<{
    inicioIso: string;
    fimIso: string;
    km: number;
    duracaoSegundos: number;
  } | null>(null);
  const [aguardandoParada, setAguardandoParada] = useState<{
    inicioIso: string;
    fimIso: string;
    km: number;
    duracaoSegundos: number;
  } | null>(null);
  const [confirmarCancelarEntrega, setConfirmarCancelarEntrega] =
    useState<boolean>(false);
  const [confirmarDescartarTurno, setConfirmarDescartarTurno] =
    useState<boolean>(false);
  const [entregaPlataforma, setEntregaPlataforma] = useState<Plataforma>(
    Plataforma.IFOOD
  );
  const [entregaValorTexto, setEntregaValorTexto] = useState<string>('');
  const [erroEntrega, setErroEntrega] = useState<string | null>(null);
  const [avisoTrajeto, setAvisoTrajeto] = useState<string | null>(null);

  const [precisaoMetros, setPrecisaoMetros] = useState<number | null>(null);
  const [velocidadeKmh, setVelocidadeKmh] = useState<number | null>(null);
  const [aguardandoSinal, setAguardandoSinal] = useState<boolean>(false);
  const [wakeLockAtivo, setWakeLockAtivo] = useState<boolean>(false);
  const [erroGps, setErroGps] = useState<ErroGeolocalizacaoState | null>(null);
  const [modalPermissaoBgAberto, setModalPermissaoBgAberto] =
    useState<boolean>(false);

  const [modoManual, setModoManual] = useState<'distancia' | 'painel'>('distancia');
  const [kmManualTexto, setKmManualTexto] = useState<string>('');
  const [kmInicialTexto, setKmInicialTexto] = useState<string>(() => {
    const ultimo = carregarUltimoKmPainel();
    return ultimo > 0 ? ultimo.toFixed(1).replace('.', ',') : '';
  });
  const [kmFinalTexto, setKmFinalTexto] = useState<string>('');
  const [erroManual, setErroManual] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const ehNativo = Capacitor.isNativePlatform();
  const watchIdRef = useRef<number | null>(null);
  const nativoWatchAtivoRef = useRef<boolean>(false);
  const ultimoPontoRef = useRef<Coordenada | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const statusRef = useRef<StatusOdometro>(status);
  const kmAtualRef = useRef<number>(kmAtual);
  const tempoSegundosRef = useRef<number>(tempoSegundos);
  const baseSegundosRef = useRef<number>(tempoSegundos);
  const inicioSegmentoMsRef = useRef<number | null>(null);
  const ultimaLeituraGpsMsRef = useRef<number | null>(null);
  const bgPermissaoDispensadaRef = useRef<boolean>(false);
  const ultimoTriggerSeqRef = useRef<number>(triggerFinalizarSeq);

  useNativeBackHandler(modalPermissaoBgAberto, () =>
    setModalPermissaoBgAberto(false)
  );
  useNativeBackHandler(sheetAberto, () => setSheetAberto(false));
  useNativeBackHandler(modalEntregaAberto, () => setModalEntregaAberto(false));

  useEffect(() => {
    if (!modalPermissaoBgAberto && !modalEntregaAberto && !sheetAberto) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (modalPermissaoBgAberto) {
        setModalPermissaoBgAberto(false);
      } else if (modalEntregaAberto) {
        setModalEntregaAberto(false);
      } else if (sheetAberto) {
        setSheetAberto(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalPermissaoBgAberto, modalEntregaAberto, sheetAberto]);

  useEffect(() => {
    if (!sheetAberto) {
      setConfirmarDescartarTurno(false);
    }
  }, [sheetAberto]);

  const ultimaPlataformaUsada = useMemo<Plataforma>(() => {
    let melhorPlat: Plataforma = Plataforma.IFOOD;
    let melhorTempo = -1;

    for (const item of lancamentos) {
      if (item.tipo === TipoLancamento.GANHO) {
        const t = new Date(item.data).getTime();
        if (
          !Number.isNaN(t) &&
          t > melhorTempo &&
          PLATAFORMAS.includes(item.categoria as Plataforma)
        ) {
          melhorTempo = t;
          melhorPlat = item.categoria as Plataforma;
        }
      }
    }

    for (const ent of entregas) {
      if (
        ent.plataforma &&
        PLATAFORMAS.includes(ent.plataforma as Plataforma)
      ) {
        const t = new Date(ent.fimIso).getTime();
        if (!Number.isNaN(t) && t > melhorTempo) {
          melhorTempo = t;
          melhorPlat = ent.plataforma as Plataforma;
        }
      }
    }

    return melhorPlat;
  }, [lancamentos, entregas]);

  const kmEntregaAtual = entregaAtiva
    ? Math.max(0, Number((kmAtual - entregaAtiva.kmInicial).toFixed(2)))
    : 0;
  const tempoEntregaAtual = entregaAtiva
    ? Math.max(0, Math.floor(tempoSegundos - entregaAtiva.segundosInicial))
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
    salvarEntregaAtual(entregaAtiva);
  }, [entregaAtiva]);

  useEffect(() => {
    onStatusChange?.({
      status,
      km: kmAtual,
      tempoSegundos,
      entregaAtiva: Boolean(entregaAtiva),
      kmEntregaAtual,
      velocidadeKmh,
    });
  }, [
    status,
    kmAtual,
    tempoSegundos,
    entregaAtiva,
    kmEntregaAtual,
    velocidadeKmh,
    onStatusChange,
  ]);

  const sincronizarTempoPorTimestamp = useCallback((): number => {
    if (
      statusRef.current === 'running' &&
      inicioSegmentoMsRef.current !== null
    ) {
      const decorridos = Math.max(
        0,
        Math.floor((Date.now() - inicioSegmentoMsRef.current) / 1000)
      );
      const total = baseSegundosRef.current + decorridos;
      if (total !== tempoSegundosRef.current) {
        tempoSegundosRef.current = total;
        setTempoSegundos(total);
        salvarTempoOdometroSegundos(total);
      }
      return total;
    }
    return tempoSegundosRef.current;
  }, []);

  const verificarAtrasoGpsNativo = useCallback(() => {
    if (
      !ehNativo ||
      statusRef.current !== 'running' ||
      ultimaLeituraGpsMsRef.current === null
    ) {
      return;
    }
    if (Date.now() - ultimaLeituraGpsMsRef.current > LIMITE_SILENCIO_GPS_NATIVO_MS) {
      setErroGps((anterior) => {
        if (
          anterior?.codigo === 'TIMEOUT' &&
          anterior?.mensagem === 'Sem sinal de GPS' &&
          anterior?.podeAbrirConfiguracoes
        ) {
          return anterior;
        }
        return {
          codigo: 'TIMEOUT',
          mensagem: 'Sem sinal de GPS',
          sugestao:
            'Se a tela está apagada, libere a localização o tempo todo e a bateria sem restrição para o Rota nas configurações do Android',
          ocorreuEm: new Date().toISOString(),
          podeTentarNovamente: true,
          podeAbrirConfiguracoes: true,
        };
      });
    }
  }, [ehNativo]);

  useEffect(() => {
    if (status !== 'running') return;
    sincronizarTempoPorTimestamp();
    const timer = window.setInterval(() => {
      sincronizarTempoPorTimestamp();
      verificarAtrasoGpsNativo();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status, sincronizarTempoPorTimestamp, verificarAtrasoGpsNativo]);

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
    if (nativoWatchAtivoRef.current) {
      nativoWatchAtivoRef.current = false;
      void BackgroundGeolocation.stop().catch(() => {
        // Ignora falha ao parar se serviço já estiver parado
      });
    }
    ultimaLeituraGpsMsRef.current = null;
    ultimoPontoRef.current = null;
    setAguardandoSinal(false);
  }, []);

  const processarPosicaoGps = useCallback(
    (posicao: GeolocationPosition) => {
      sincronizarTempoPorTimestamp();
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

      const proximoKm = kmAtualRef.current + distanciaKm;
      kmAtualRef.current = proximoKm;
      salvarKmEmAndamento(proximoKm);
      setKmAtual(proximoKm);
      ultimoPontoRef.current = novoPonto;
    },
    [sincronizarTempoPorTimestamp]
  );

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
        const total = sincronizarTempoPorTimestamp();
        baseSegundosRef.current = total;
        inicioSegmentoMsRef.current = null;
        statusRef.current = kmAtualRef.current > 0 ? 'paused' : 'idle';
        setStatus(statusRef.current);
      }
    },
    [liberarWakeLock, pararWatchGps, sincronizarTempoPorTimestamp]
  );

  const iniciarWatchGpsNativo = useCallback(async () => {
    pararWatchGps();
    setErroGps(null);
    setAguardandoSinal(true);
    baseSegundosRef.current = tempoSegundosRef.current;
    inicioSegmentoMsRef.current = Date.now();
    ultimaLeituraGpsMsRef.current = Date.now();
    statusRef.current = 'running';
    setStatus('running');
    nativoWatchAtivoRef.current = true;

    try {
      await BackgroundGeolocation.start(
        {
          backgroundTitle: 'Rota · odômetro ativo',
          backgroundMessage: 'Contando km mesmo com a tela apagada.',
          requestPermissions: false,
          stale: false,
          distanceFilter: 0,
          networkFallback: false,
        },
        (location, error) => {
          if (error) {
            const autorizadoErro =
              error.code === 'NOT_AUTHORIZED' ||
              error.code === 'PERMISSION_DENIED';
            setAguardandoSinal(false);
            const registro: ErroGeolocalizacaoState = autorizadoErro
              ? {
                  codigo: 'PERMISSION_DENIED',
                  mensagem: 'Permissão de acesso à localização foi negada.',
                  sugestao:
                    'Libere a localização para o Rota nas configurações do Android para contar km em segundo plano.',
                  mensagemOriginal: error.message,
                  ocorreuEm: new Date().toISOString(),
                  podeTentarNovamente: true,
                  podeAbrirConfiguracoes: true,
                }
              : {
                  codigo: 'POSITION_UNAVAILABLE',
                  mensagem: 'Posição GPS indisponível no momento.',
                  sugestao:
                    'Verifique se o GPS do celular está ativo e tente novamente.',
                  mensagemOriginal: error.message,
                  ocorreuEm: new Date().toISOString(),
                  podeTentarNovamente: true,
                  podeAbrirConfiguracoes: true,
                };
            registrarLogErroGps(registro);
            setErroGps(registro);
            if (autorizadoErro) {
              pararWatchGps();
              const total = sincronizarTempoPorTimestamp();
              baseSegundosRef.current = total;
              inicioSegmentoMsRef.current = null;
              statusRef.current = kmAtualRef.current > 0 ? 'paused' : 'idle';
              setStatus(statusRef.current);
            }
            return;
          }

          if (
            location &&
            Number.isFinite(location.latitude) &&
            Number.isFinite(location.longitude)
          ) {
            ultimaLeituraGpsMsRef.current = Date.now();
            processarPosicaoGps(
              converterLocationNativaParaGeolocationPosition(location)
            );
          }
        }
      );
    } catch (err) {
      nativoWatchAtivoRef.current = false;
      ultimaLeituraGpsMsRef.current = null;
      const total = sincronizarTempoPorTimestamp();
      baseSegundosRef.current = total;
      inicioSegmentoMsRef.current = null;
      statusRef.current = kmAtualRef.current > 0 ? 'paused' : 'idle';
      setStatus(statusRef.current);
      setAguardandoSinal(false);
      setErroGps({
        codigo: 'POSITION_UNAVAILABLE',
        mensagem: 'Não foi possível iniciar o GPS em segundo plano.',
        sugestao:
          'Verifique as permissões de localização e bateria do Rota nas configurações do Android.',
        mensagemOriginal: err instanceof Error ? err.message : undefined,
        ocorreuEm: new Date().toISOString(),
        podeTentarNovamente: true,
        podeAbrirConfiguracoes: true,
      });
      setSheetAberto(true);
    }
  }, [pararWatchGps, processarPosicaoGps, sincronizarTempoPorTimestamp]);

  const iniciarWatchGps = useCallback(() => {
    if (ehNativo) {
      void iniciarWatchGpsNativo();
      return;
    }

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
      statusRef.current = kmAtualRef.current > 0 ? 'paused' : 'idle';
      setStatus(statusRef.current);
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
      statusRef.current = kmAtualRef.current > 0 ? 'paused' : 'idle';
      setStatus(statusRef.current);
      return;
    }

    pararWatchGps();
    setErroGps(null);
    setAguardandoSinal(true);
    baseSegundosRef.current = tempoSegundosRef.current;
    inicioSegmentoMsRef.current = Date.now();
    statusRef.current = 'running';
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
  }, [ehNativo, iniciarWatchGpsNativo, pararWatchGps, processarPosicaoGps, tratarErroWatchGps]);

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
      if (document.visibilityState === 'visible') {
        sincronizarTempoPorTimestamp();
        verificarAtrasoGpsNativo();
        if (!ehNativo && statusRef.current === 'running') {
          void solicitarWakeLock();
        }
      }
    };

    let appStateHandle: { remove: () => Promise<void> } | null = null;
    if (ehNativo) {
      void CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          sincronizarTempoPorTimestamp();
          verificarAtrasoGpsNativo();
        }
      }).then((handle) => {
        appStateHandle = handle;
      });
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void appStateHandle?.remove();
      permissionStatus?.removeEventListener('change', handlePermChange);
      pararWatchGps();
      void liberarWakeLock();
    };
  }, [
    ehNativo,
    liberarWakeLock,
    pararWatchGps,
    sincronizarTempoPorTimestamp,
    solicitarWakeLock,
    verificarAtrasoGpsNativo,
  ]);

  const handleIniciarOuContinuar = async () => {
    setAvisoTrajeto(null);
    if (!ehNativo) {
      iniciarWatchGps();
      void solicitarWakeLock();
      return;
    }

    try {
      let perm = await BackgroundGeolocation.checkPermissions();
      if (perm.location !== 'granted') {
        perm = await BackgroundGeolocation.requestPermissions({
          permissions: ['location', 'notification'],
        });
      } else if (perm.notification === 'prompt') {
        perm = await BackgroundGeolocation.requestPermissions({
          permissions: ['notification'],
        });
      }

      if (perm.location !== 'granted') {
        setErroGps({
          codigo: 'PERMISSION_DENIED',
          mensagem: 'Permissão de acesso à localização foi negada.',
          sugestao:
            'Libere o acesso à localização nas configurações do Android para usar o odômetro.',
          ocorreuEm: new Date().toISOString(),
          podeTentarNovamente: true,
          podeAbrirConfiguracoes: true,
        });
        setSheetAberto(true);
        return;
      }

      if (
        perm.backgroundLocation !== 'granted' &&
        !bgPermissaoDispensadaRef.current
      ) {
        setModalPermissaoBgAberto(true);
        return;
      }
    } catch {
      // Fallback para tentar iniciar diretamente caso checkPermissions falhe
    }

    await iniciarWatchGpsNativo();
  };

  const handleConfirmarPermissaoBackground = async () => {
    setModalPermissaoBgAberto(false);
    try {
      const atual = await BackgroundGeolocation.checkPermissions();
      if (atual.backgroundLocation === 'denied') {
        await BackgroundGeolocation.openSettings();
      } else {
        await BackgroundGeolocation.requestPermissions({
          permissions: ['backgroundLocation'],
        });
      }
    } catch {
      // Usuário pode continuar mesmo se o diálogo falhar
    }
    bgPermissaoDispensadaRef.current = true;
    await iniciarWatchGpsNativo();
  };

  const handleDispensarPermissaoBackground = () => {
    setModalPermissaoBgAberto(false);
    bgPermissaoDispensadaRef.current = true;
    void iniciarWatchGpsNativo();
  };

  const handlePausar = () => {
    const total = sincronizarTempoPorTimestamp();
    baseSegundosRef.current = total;
    inicioSegmentoMsRef.current = null;
    salvarTempoOdometroSegundos(total);
    pararWatchGps();
    void liberarWakeLock();
    statusRef.current = 'paused';
    setStatus('paused');
  };

  const handleIniciarEntrega = () => {
    if (status !== 'running') return;
    const tempoAgora = sincronizarTempoPorTimestamp();
    setAvisoTrajeto(null);
    setConfirmarCancelarEntrega(false);
    setEntregaAtiva({
      inicioIso: new Date().toISOString(),
      kmInicial: kmAtualRef.current,
      segundosInicial: tempoAgora,
    });
  };

  const abrirSheetEntregaFinalizada = useCallback(
    (snapshot: {
      inicioIso: string;
      fimIso: string;
      km: number;
      duracaoSegundos: number;
    }) => {
      setAvisoTrajeto(null);
      setConfirmarCancelarEntrega(false);
      setFinalizandoSnapshot(snapshot);
      setEntregaPlataforma(ultimaPlataformaUsada);
      setEntregaValorTexto('');
      setErroEntrega(null);
      setModalEntregaAberto(true);
    },
    [ultimaPlataformaUsada]
  );

  const handleAbrirModalEntrega = useCallback(() => {
    if (!entregaAtiva) return;
    const tempoAgora = sincronizarTempoPorTimestamp();
    const snapshot = {
      inicioIso: entregaAtiva.inicioIso,
      fimIso: new Date().toISOString(),
      km: Math.max(
        0,
        Number((kmAtualRef.current - entregaAtiva.kmInicial).toFixed(2))
      ),
      duracaoSegundos: Math.max(
        0,
        Math.floor(tempoAgora - entregaAtiva.segundosInicial)
      ),
    };

    const emMovimento =
      carregarModoMovimento() &&
      status === 'running' &&
      velocidadeKmh !== null &&
      velocidadeKmh >= 15;

    if (emMovimento) {
      setAguardandoParada(snapshot);
      setConfirmarCancelarEntrega(false);
      return;
    }

    abrirSheetEntregaFinalizada(snapshot);
  }, [
    entregaAtiva,
    kmAtual,
    tempoSegundos,
    status,
    velocidadeKmh,
    abrirSheetEntregaFinalizada,
  ]);

  useEffect(() => {
    if (!aguardandoParada) return;
    const parou =
      status !== 'running' || velocidadeKmh === null || velocidadeKmh < 12;
    if (parou) {
      const snap = aguardandoParada;
      setAguardandoParada(null);
      abrirSheetEntregaFinalizada(snap);
    }
  }, [aguardandoParada, status, velocidadeKmh, abrirSheetEntregaFinalizada]);

  useEffect(() => {
    if (triggerFinalizarSeq !== ultimoTriggerSeqRef.current) {
      ultimoTriggerSeqRef.current = triggerFinalizarSeq;
      if (triggerFinalizarSeq > 0) {
        handleAbrirModalEntrega();
      }
    }
  }, [triggerFinalizarSeq, handleAbrirModalEntrega]);

  const handleCancelarEntrega = () => {
    setEntregaAtiva(null);
    setAguardandoParada(null);
    setFinalizandoSnapshot(null);
    setModalEntregaAberto(false);
    setConfirmarCancelarEntrega(false);
    setErroEntrega(null);
    setAvisoTrajeto(null);
  };

  const handleConfirmarEntrega = (e: React.FormEvent) => {
    e.preventDefault();
    if (!finalizandoSnapshot) return;
    setErroEntrega(null);

    const valor = parseValorNumerico(entregaValorTexto);
    if (Number.isNaN(valor) || valor <= 0) {
      setErroEntrega('Informe quanto pagou (maior que R$ 0,00).');
      return;
    }

    onFinalizarEntrega?.({
      inicioIso: finalizandoSnapshot.inicioIso,
      fimIso: finalizandoSnapshot.fimIso,
      km: finalizandoSnapshot.km,
      duracaoSegundos: finalizandoSnapshot.duracaoSegundos,
      valor: Number(valor.toFixed(2)),
      plataforma: entregaPlataforma,
    });

    setEntregaAtiva(null);
    setAguardandoParada(null);
    setFinalizandoSnapshot(null);
    setModalEntregaAberto(false);
    setEntregaValorTexto('');
  };

  const handlePularValorEntrega = () => {
    if (!finalizandoSnapshot) return;
    onFinalizarEntrega?.({
      inicioIso: finalizandoSnapshot.inicioIso,
      fimIso: finalizandoSnapshot.fimIso,
      km: finalizandoSnapshot.km,
      duracaoSegundos: finalizandoSnapshot.duracaoSegundos,
    });

    setEntregaAtiva(null);
    setAguardandoParada(null);
    setFinalizandoSnapshot(null);
    setModalEntregaAberto(false);
    setEntregaValorTexto('');
  };

  const handleSalvarTrajetoGps = () => {
    if (kmAtual <= 0) return;
    if (entregaAtiva) {
      setAvisoTrajeto(
        'Finalize ou cancele a entrega antes de encerrar o turno.'
      );
      return;
    }
    setAvisoTrajeto(null);
    const tempoFinal = sincronizarTempoPorTimestamp();
    const kmParaSalvar = Number(kmAtual.toFixed(2));
    pararWatchGps();
    void liberarWakeLock();
    onSalvarTrajeto(
      kmParaSalvar > 0 ? kmParaSalvar : kmAtual,
      'gps',
      tempoFinal > 0 ? tempoFinal : undefined
    );
    kmAtualRef.current = 0;
    tempoSegundosRef.current = 0;
    baseSegundosRef.current = 0;
    inicioSegmentoMsRef.current = null;
    salvarKmEmAndamento(0);
    salvarTempoOdometroSegundos(0);
    setKmAtual(0);
    setTempoSegundos(0);
    setPrecisaoMetros(null);
    setVelocidadeKmh(null);
    setErroGps(null);
    statusRef.current = 'idle';
    setStatus('idle');
    setSheetAberto(false);
    mostrarFeedback('Turno encerrado!');
  };

  const handleZerar = () => {
    pararWatchGps();
    void liberarWakeLock();
    kmAtualRef.current = 0;
    tempoSegundosRef.current = 0;
    baseSegundosRef.current = 0;
    inicioSegmentoMsRef.current = null;
    salvarKmEmAndamento(0);
    salvarTempoOdometroSegundos(0);
    setKmAtual(0);
    setTempoSegundos(0);
    setEntregaAtiva(null);
    setAguardandoParada(null);
    setFinalizandoSnapshot(null);
    setModalEntregaAberto(false);
    setConfirmarCancelarEntrega(false);
    setConfirmarDescartarTurno(false);
    setAvisoTrajeto(null);
    setPrecisaoMetros(null);
    setVelocidadeKmh(null);
    setErroGps(null);
    statusRef.current = 'idle';
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

  const rotuloTopoOdometro = 'Odômetro · total do turno';

  const kmFormatadoCasinhas = Math.max(0, kmAtual).toFixed(1);
  const [parteInteiraRaw, parteDecimal = '0'] = kmFormatadoCasinhas.split('.');
  const digitosInteiros = parteInteiraRaw.padStart(4, '0').split('');

  const subtituloFaixa =
    status === 'running'
      ? `${aguardandoSinal ? 'Buscando GPS' : 'Rodando'} · ${formatarDuracao(tempoSegundos)}${
          velocidadeKmh !== null && velocidadeKmh > 0
            ? ` · ${velocidadeKmh} km/h`
            : ''
        }`
      : status === 'paused'
        ? `Pausado · ${formatarDuracao(tempoSegundos)}`
        : 'Parado · Toque para detalhes';

  const textoStatusSheet =
    status === 'running'
      ? aguardandoSinal
        ? 'Buscando sinal GPS'
        : 'GPS ativo'
      : status === 'paused'
        ? 'Pausado'
        : 'Pronto para rodar';

  const podeIniciarEntrega = status === 'running';

  return (
    <>
      {/* Cartão compacto com visual de hodômetro mecânico na aba Hoje */}
      {!oculto && (
        <div
          onClick={() => setSheetAberto(true)}
          className="rota-card cursor-pointer px-3.5 sm:px-4 py-3 space-y-2.5"
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
                  void handleIniciarOuContinuar();
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

          {erroGps && (
            <div
              role="alert"
              onClick={(e) => e.stopPropagation()}
              className="rounded-[14px] bg-[var(--rota-danger-tint)] p-3 space-y-2"
            >
              <p className="text-[14px] font-extrabold text-[var(--rota-danger)]">
                {erroGps.mensagem}
              </p>
              <p className="text-[13px] font-semibold text-[var(--rota-text)]">
                {erroGps.sugestao}
              </p>
              <div className="flex flex-wrap gap-2 pt-0.5">
                {ehNativo && erroGps.podeAbrirConfiguracoes && (
                  <button
                    type="button"
                    onClick={() => {
                      void BackgroundGeolocation.openSettings();
                    }}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-[14px] bg-[var(--rota-accent)] px-4 text-[14px] font-extrabold text-[var(--rota-on-accent)]"
                  >
                    Abrir configurações
                  </button>
                )}
                {erroGps.podeTentarNovamente && (
                  <button
                    type="button"
                    onClick={() => {
                      void handleIniciarOuContinuar();
                    }}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-[14px] bg-[var(--rota-surface)] px-4 text-[14px] font-extrabold text-[var(--rota-text)]"
                  >
                    Tentar novamente
                  </button>
                )}
              </div>
            </div>
          )}

          <div
            className="border-t border-[var(--rota-line)] pt-2.5 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            {entregaAtiva ? (
              <>
                <div className="flex items-center justify-between gap-3 rounded-[14px] bg-[var(--rota-accent-tint)] px-3.5 py-2.5">
                  <div className="min-w-0">
                    <span className="block text-[13px] leading-[18px] font-bold text-[var(--rota-accent)]">
                      Entrega atual
                    </span>
                    <span className="block text-[22px] leading-[26px] font-extrabold text-[var(--rota-text)] tabular-nums">
                      {formatarKm(kmEntregaAtual)} km
                    </span>
                  </div>
                  <span className="shrink-0 text-[13px] font-extrabold text-[var(--rota-accent)] tabular-nums">
                    {formatarDuracaoCurta(tempoEntregaAtual)} em entrega
                  </span>
                </div>

                {aguardandoParada ? (
                  <p className="rounded-[12px] bg-[var(--rota-success-tint)] px-3 py-2 text-center text-[13px] font-bold text-[var(--rota-success)]">
                    Entrega registrada ({formatarKm(aguardandoParada.km)} km) ·
                    Aguardando parar para lançar valor
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleAbrirModalEntrega}
                    className="flex h-[52px] w-full items-center justify-center rounded-[14px] bg-[var(--rota-success)] px-4 text-[15px] font-extrabold text-[var(--rota-on-success)] active:scale-[0.98]"
                  >
                    Finalizar entrega
                  </button>
                )}

                {!confirmarCancelarEntrega ? (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => setConfirmarCancelarEntrega(true)}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-[12px] px-4 text-[13px] font-bold text-[var(--rota-text-soft)] hover:text-[var(--rota-danger)] active:scale-[0.98]"
                    >
                      Cancelar entrega
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 rounded-[14px] bg-[var(--rota-danger-tint)] px-3 py-1.5">
                    <span className="text-[13px] font-bold text-[var(--rota-danger)]">
                      Descartar entrega?
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setConfirmarCancelarEntrega(false)}
                        className="inline-flex h-[48px] items-center justify-center rounded-[12px] bg-[var(--rota-surface)] px-3 text-[13px] font-bold text-[var(--rota-text)] active:scale-[0.98]"
                      >
                        Voltar
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelarEntrega}
                        className="inline-flex h-[48px] items-center justify-center rounded-[12px] bg-[var(--rota-danger)] px-3 text-[13px] font-extrabold text-white active:scale-[0.98]"
                      >
                        Sim, cancelar
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={!podeIniciarEntrega}
                  onClick={handleIniciarEntrega}
                  className={`flex h-[52px] w-full items-center justify-center rounded-[14px] px-4 text-[15px] font-extrabold transition-colors active:scale-[0.98] ${
                    podeIniciarEntrega
                      ? 'bg-[var(--rota-accent)] text-[var(--rota-on-accent)]'
                      : 'cursor-not-allowed bg-[var(--rota-surface-2)] text-[var(--rota-text-soft)] opacity-55'
                  }`}
                >
                  Iniciar entrega
                </button>
                {!podeIniciarEntrega && (
                  <p className="text-center text-[13px] font-semibold text-[var(--rota-text-soft)]">
                    Ligue o odômetro para iniciar
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Bottom sheet de detalhes do odômetro */}
      {sheetAberto && (
        <div
          onClick={() => setSheetAberto(false)}
          className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center"
          style={{ backgroundColor: 'var(--rota-backdrop)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-odometro-sheet"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] w-full sm:max-w-[460px] overflow-y-auto rounded-t-[20px] sm:rounded-[20px] bg-[var(--rota-bg)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3"
          >
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
                    {ehNativo && erroGps.podeAbrirConfiguracoes && (
                      <button
                        type="button"
                        onClick={() => {
                          void BackgroundGeolocation.openSettings();
                        }}
                        className="inline-flex min-h-[48px] items-center justify-center rounded-[14px] bg-[var(--rota-accent)] px-4 text-[14px] font-extrabold text-[var(--rota-on-accent)]"
                      >
                        Abrir configurações
                      </button>
                    )}
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
                        onClick={() => {
                          void handleIniciarOuContinuar();
                        }}
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
                        : () => {
                            void handleIniciarOuContinuar();
                          }
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
                  !confirmarDescartarTurno ? (
                    <button
                      type="button"
                      onClick={() => setConfirmarDescartarTurno(true)}
                      className="flex h-[48px] w-full items-center justify-center rounded-[14px] bg-[var(--rota-danger-tint)] px-4 text-[14px] font-extrabold text-[var(--rota-danger)] active:scale-[0.98]"
                    >
                      Descartar turno atual
                    </button>
                  ) : (
                    <div className="flex items-center justify-between gap-2 rounded-[14px] bg-[var(--rota-danger-tint)] px-3 py-1.5">
                      <span className="text-[13px] font-bold text-[var(--rota-danger)]">
                        Descartar turno?
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setConfirmarDescartarTurno(false)}
                          className="inline-flex h-[48px] items-center justify-center rounded-[12px] bg-[var(--rota-surface)] px-3 text-[13px] font-bold text-[var(--rota-text)] active:scale-[0.98]"
                        >
                          Voltar
                        </button>
                        <button
                          type="button"
                          onClick={handleZerar}
                          className="inline-flex h-[48px] items-center justify-center rounded-[12px] bg-[var(--rota-danger)] px-3 text-[13px] font-extrabold text-white active:scale-[0.98]"
                        >
                          Sim, descartar
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>

              {avisoTrajeto && (
                <p className="text-[13px] font-bold text-[var(--rota-danger)]">
                  {avisoTrajeto}
                </p>
              )}

              {/* Corte de entrega sem parar o odômetro */}
              <div className="pt-2 border-t border-[var(--rota-line)] space-y-2">
                {entregaAtiva ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-3 rounded-[14px] bg-[var(--rota-accent-tint)] px-3.5 py-2.5">
                      <div>
                        <span className="block text-[13px] font-bold text-[var(--rota-accent)]">
                          Entrega atual
                        </span>
                        <span className="block text-[22px] font-extrabold text-[var(--rota-text)] tabular-nums">
                          {formatarKm(kmEntregaAtual)} km
                        </span>
                      </div>
                      <span className="text-[13px] font-extrabold text-[var(--rota-accent)] tabular-nums">
                        {formatarDuracaoCurta(tempoEntregaAtual)} em entrega
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAbrirModalEntrega}
                      className="flex h-[52px] w-full items-center justify-center rounded-[14px] bg-[var(--rota-success)] px-4 text-[15px] font-extrabold text-[var(--rota-on-success)] active:scale-[0.98]"
                    >
                      Finalizar entrega
                    </button>
                    {!confirmarCancelarEntrega ? (
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() => setConfirmarCancelarEntrega(true)}
                          className="inline-flex min-h-[48px] items-center justify-center rounded-[12px] px-4 text-[13px] font-bold text-[var(--rota-text-soft)] hover:text-[var(--rota-danger)]"
                        >
                          Cancelar entrega
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2 rounded-[14px] bg-[var(--rota-danger-tint)] px-3 py-1.5">
                        <span className="text-[13px] font-bold text-[var(--rota-danger)]">
                          Descartar entrega?
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setConfirmarCancelarEntrega(false)}
                            className="inline-flex h-[48px] items-center justify-center rounded-[12px] bg-[var(--rota-surface)] px-3 text-[13px] font-bold text-[var(--rota-text)]"
                          >
                            Voltar
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelarEntrega}
                            className="inline-flex h-[48px] items-center justify-center rounded-[12px] bg-[var(--rota-danger)] px-3 text-[13px] font-extrabold text-white"
                          >
                            Sim, cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!podeIniciarEntrega}
                      onClick={handleIniciarEntrega}
                      className={`flex h-[52px] w-full items-center justify-center rounded-[14px] px-4 text-[15px] font-extrabold active:scale-[0.98] ${
                        podeIniciarEntrega
                          ? 'bg-[var(--rota-accent)] text-[var(--rota-on-accent)]'
                          : 'cursor-not-allowed bg-[var(--rota-surface-2)] text-[var(--rota-text-soft)] opacity-55'
                      }`}
                    >
                      Iniciar entrega
                    </button>
                    {!podeIniciarEntrega && (
                      <p className="text-center text-[13px] font-semibold text-[var(--rota-text-soft)]">
                        Ligue o odômetro para iniciar
                      </p>
                    )}
                  </>
                )}
              </div>
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

      {/* Bottom sheet "Entrega finalizada" */}
      {modalEntregaAberto && finalizandoSnapshot && (
        <div
          onClick={() => setModalEntregaAberto(false)}
          className="fixed inset-0 z-[60] flex flex-col justify-end sm:items-center sm:justify-center"
          style={{ backgroundColor: 'var(--rota-backdrop)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-finalizar-entrega"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] w-full sm:max-w-[460px] overflow-y-auto rounded-t-[20px] sm:rounded-[20px] bg-[var(--rota-bg)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3
                  id="titulo-finalizar-entrega"
                  className="text-[20px] font-extrabold text-[var(--rota-text)]"
                >
                  Entrega finalizada
                </h3>
                <p className="text-[13px] font-bold text-[var(--rota-text-soft)] tabular-nums">
                  {formatarKm(finalizandoSnapshot.km)} km ·{' '}
                  {formatarDuracaoCurta(finalizandoSnapshot.duracaoSegundos)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalEntregaAberto(false)}
                className="inline-flex min-h-[48px] items-center justify-center rounded-[14px] px-3 text-[15px] font-bold text-[var(--rota-text-soft)] hover:text-[var(--rota-text)]"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleConfirmarEntrega} className="space-y-3">
              <div className="rota-card p-4 text-center">
                <label
                  htmlFor="input-valor-entrega-odometro"
                  className="block text-[13px] font-bold text-[var(--rota-text-soft)]"
                >
                  Quanto pagou?
                </label>
                <div className="mt-1.5 flex items-baseline justify-center gap-1.5">
                  <span className="text-[20px] font-extrabold text-[var(--rota-text-soft)]">
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
                    className="w-[180px] bg-transparent text-center text-[40px] leading-none font-extrabold text-[var(--rota-text)] placeholder:text-[var(--rota-text-soft)]/40 focus:outline-none tabular-nums"
                  />
                </div>
                {erroEntrega && (
                  <p
                    role="alert"
                    className="mt-2 text-[13px] font-bold text-[var(--rota-danger)]"
                  >
                    {erroEntrega}
                  </p>
                )}
              </div>

              <div>
                <span className="mb-1.5 block text-[13px] font-bold text-[var(--rota-text-soft)]">
                  Plataforma
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {PLATAFORMAS.map((plat) => {
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
                            : 'bg-[var(--rota-surface)] border-[var(--rota-line)] text-[var(--rota-text)]'
                        }`}
                      >
                        {rotuloCategoria(plat)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handlePularValorEntrega}
                  className="flex h-[52px] items-center justify-center rounded-[14px] bg-[var(--rota-surface-2)] px-4 text-[15px] font-extrabold text-[var(--rota-text)] active:scale-[0.98]"
                >
                  Pular valor
                </button>
                <button
                  type="submit"
                  className="flex h-[52px] items-center justify-center rounded-[14px] bg-[var(--rota-accent)] px-4 text-[15px] font-extrabold text-[var(--rota-on-accent)] active:scale-[0.98]"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal explicativo da segunda etapa de permissão (localização em segundo plano) */}
      {modalPermissaoBgAberto && (
        <div
          onClick={() => setModalPermissaoBgAberto(false)}
          className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center"
          style={{ backgroundColor: 'var(--rota-backdrop)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-permissao-bg"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-[420px] rounded-t-[20px] sm:rounded-[20px] bg-[var(--rota-bg)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3"
          >
            <h2
              id="titulo-permissao-bg"
              className="text-[20px] font-extrabold text-[var(--rota-text)]"
            >
              Localização o tempo todo
            </h2>
            <p className="text-[14px] font-semibold text-[var(--rota-text-soft)] leading-relaxed">
              Para o odômetro continuar contando km com a tela apagada e com
              outros apps abertos, permita a localização &ldquo;o tempo todo&rdquo;
              para o Rota.
            </p>
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  void handleConfirmarPermissaoBackground();
                }}
                className="flex h-[48px] w-full items-center justify-center rounded-[14px] bg-[var(--rota-accent)] px-4 text-[14px] font-extrabold text-[var(--rota-on-accent)] active:scale-[0.98]"
              >
                Permitir o tempo todo
              </button>
              <button
                type="button"
                onClick={handleDispensarPermissaoBackground}
                className="flex h-[48px] w-full items-center justify-center rounded-[14px] bg-[var(--rota-surface-2)] px-4 text-[14px] font-extrabold text-[var(--rota-text)] active:scale-[0.98]"
              >
                Agora não
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
