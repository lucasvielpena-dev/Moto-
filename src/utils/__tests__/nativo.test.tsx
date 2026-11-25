import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  openSettings: vi.fn(),
  addAppListener: vi.fn(),
  minimizeApp: vi.fn(),
  writeFile: vi.fn(),
  getUri: vi.fn(),
  share: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: mocks.isNativePlatform,
  },
}));

vi.mock('@capgo/background-geolocation', () => ({
  BackgroundGeolocation: {
    checkPermissions: mocks.checkPermissions,
    requestPermissions: mocks.requestPermissions,
    start: mocks.start,
    stop: mocks.stop,
    openSettings: mocks.openSettings,
  },
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: mocks.addAppListener,
    minimizeApp: mocks.minimizeApp,
  },
}));

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Documents: 'DOCUMENTS', Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    writeFile: mocks.writeFile,
    getUri: mocks.getUri,
  },
}));

vi.mock('@capacitor/share', () => ({
  Share: {
    share: mocks.share,
  },
}));

import App from '../../App';
import { ManutencaoBackup } from '../../components/ManutencaoBackup';
import { Odometro } from '../../components/Odometro';
import { Plataforma, TipoLancamento } from '../../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe('Integração nativa Android (Capacitor + BackgroundGeolocation)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T12:00:00.000Z'));
    localStorage.clear();

    mocks.isNativePlatform.mockReturnValue(true);
    mocks.checkPermissions.mockReset();
    mocks.requestPermissions.mockReset();
    mocks.start.mockReset();
    mocks.stop.mockReset().mockResolvedValue(undefined);
    mocks.openSettings.mockReset().mockResolvedValue(undefined);
    mocks.addAppListener
      .mockReset()
      .mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) });
    mocks.minimizeApp.mockReset().mockResolvedValue(undefined);
    mocks.writeFile.mockReset().mockResolvedValue({ uri: 'file:///doc' });
    mocks.getUri
      .mockReset()
      .mockResolvedValue({ uri: 'file:///cache/rota-backup.json' });
    mocks.share.mockReset().mockResolvedValue({});

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    Object.defineProperty(window, 'scrollTo', {
      value: vi.fn(),
      configurable: true,
    });
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
      configurable: true,
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('pede permissão em 2 etapas, inicia com notificação "Rota · odômetro ativo", calcula tempo por Date.now() ignorando pausas e detecta 60s sem GPS', async () => {
    mocks.checkPermissions.mockResolvedValue({
      location: 'prompt',
      backgroundLocation: 'prompt',
      notification: 'prompt',
    });
    mocks.requestPermissions.mockImplementation(async (opts?: { permissions?: string[] }) => {
      if (opts?.permissions?.includes('location')) {
        return {
          location: 'granted',
          backgroundLocation: 'prompt',
          notification: 'granted',
        };
      }
      return {
        location: 'granted',
        backgroundLocation: 'granted',
        notification: 'granted',
      };
    });

    let capturedCallback: ((loc?: unknown, err?: unknown) => void) | null = null;
    mocks.start.mockImplementation(async (_opts, cb) => {
      capturedCallback = cb;
    });

    const onFinalizarEntrega = vi.fn();
    await act(async () => {
      root.render(
        <Odometro
          onSalvarTrajeto={vi.fn()}
          onFinalizarEntrega={onFinalizarEntrega}
        />
      );
    });

    const btnIniciar = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Iniciar'
    );
    await act(async () => {
      btnIniciar?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Etapa 1 solicitou localização + notificação; Etapa 2 abriu modal explicativo
    expect(mocks.requestPermissions).toHaveBeenCalledWith({
      permissions: ['location', 'notification'],
    });
    const dialogBg = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialogBg).not.toBeNull();
    expect(dialogBg.textContent).toContain('Localização o tempo todo');
    expect(dialogBg.textContent).toContain('tela apagada');

    const btnPermitirBg = Array.from(dialogBg.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Permitir o tempo todo'
    );
    await act(async () => {
      btnPermitirBg?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.requestPermissions).toHaveBeenCalledWith({
      permissions: ['backgroundLocation'],
    });
    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundTitle: 'Rota · odômetro ativo',
        requestPermissions: false,
        distanceFilter: 0,
      }),
      expect.any(Function)
    );

    // Envia duas posições válidas (~111m de distância) e avança 15s por Date.now()
    await act(async () => {
      capturedCallback?.({
        latitude: -23.5505,
        longitude: -46.6333,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        simulated: false,
        bearing: 0,
        speed: 5,
        time: Date.now(),
      });
      vi.setSystemTime(Date.now() + 15_000);
      capturedCallback?.({
        latitude: -23.5515,
        longitude: -46.6333,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        simulated: false,
        bearing: 0,
        speed: 2,
        time: Date.now(),
      });
    });

    expect(Number(localStorage.getItem('rota_odometro_km_v1'))).toBeGreaterThan(
      0.09
    );
    expect(Number(localStorage.getItem('rota_odometro_segundos_v1'))).toBe(15);

    // Inicia entrega, roda 20s, pausa por 300s (pausa NÃO deve contar!), retoma e roda +10s
    const btnIniciarEntrega = Array.from(
      container.querySelectorAll('button')
    ).find((b) => b.textContent?.trim() === 'Iniciar entrega');
    await act(async () => {
      btnIniciarEntrega?.click();
    });

    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });

    const btnPausar = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Pausar'
    );
    await act(async () => {
      btnPausar?.click();
    });
    expect(mocks.stop).toHaveBeenCalledTimes(1);

    // Passam 5 minutos pausado: tempo não deve aumentar
    await act(async () => {
      vi.advanceTimersByTime(300_000);
    });
    expect(Number(localStorage.getItem('rota_odometro_segundos_v1'))).toBe(35);

    // Retoma e passa +10s
    mocks.checkPermissions.mockResolvedValue({
      location: 'granted',
      backgroundLocation: 'granted',
      notification: 'granted',
    });
    const btnContinuar = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Continuar'
    );
    await act(async () => {
      btnContinuar?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(Number(localStorage.getItem('rota_odometro_segundos_v1'))).toBe(45);

    // Finalizar entrega deve registrar exatamente 30s ativos (20s + 10s), ignorando os 300s de pausa
    const btnFinalizarEntrega = Array.from(
      container.querySelectorAll('button')
    ).find((b) => b.textContent?.trim() === 'Finalizar entrega');
    await act(async () => {
      btnFinalizarEntrega?.click();
    });
    const btnPular = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Pular valor'
    );
    await act(async () => {
      btnPular?.click();
    });
    expect(onFinalizarEntrega).toHaveBeenCalledWith(
      expect.objectContaining({
        duracaoSegundos: 30,
      })
    );

    // Simula > 60s sem leitura de GPS enquanto rodando -> mostra "Sem sinal de GPS" + "Abrir configurações"
    await act(async () => {
      vi.advanceTimersByTime(62_000);
    });

    const alertGps = container.querySelector('[role="alert"]') as HTMLElement;
    expect(alertGps).not.toBeNull();
    expect(alertGps.textContent).toContain('Sem sinal de GPS');
    expect(alertGps.textContent).toContain(
      'Se a tela está apagada, libere a localização o tempo todo e a bateria sem restrição para o Rota nas configurações do Android'
    );

    const btnAbrirConfig = Array.from(alertGps.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Abrir configurações'
    );
    expect(btnAbrirConfig).toBeDefined();
    await act(async () => {
      btnAbrirConfig?.click();
    });
    expect(mocks.openSettings).toHaveBeenCalledTimes(1);
  });

  it('botão voltar do Android fecha modal aberto primeiro e chama App.minimizeApp() quando nenhum modal está aberto', async () => {
    let backButtonCb: ((ev: { canGoBack: boolean }) => void) | null = null;
    mocks.addAppListener.mockImplementation(async (eventName, cb) => {
      if (eventName === 'backButton') {
        backButtonCb = cb;
      }
      return { remove: vi.fn().mockResolvedValue(undefined) };
    });

    await act(async () => {
      root.render(<App />);
      await Promise.resolve();
    });

    expect(backButtonCb).not.toBeNull();

    // Abre sheet "+ Ganho"
    const btnGanho = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Ganho')
    );
    await act(async () => {
      btnGanho?.click();
    });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    // Back button fecha o sheet sem minimizar o app
    await act(async () => {
      backButtonCb?.({ canGoBack: false });
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mocks.minimizeApp).not.toHaveBeenCalled();

    // Segundo back button (sem modal/sheet aberto) minimiza o app
    await act(async () => {
      backButtonCb?.({ canGoBack: false });
    });
    expect(mocks.minimizeApp).toHaveBeenCalledTimes(1);
  });

  it('usa @capacitor/filesystem e @capacitor/share para salvar e compartilhar no modo nativo', async () => {
    await act(async () => {
      root.render(
        <ManutencaoBackup
          tema="claro"
          onMudarTema={vi.fn()}
          todosLancamentos={[
            {
              id: 'l-1',
              tipo: TipoLancamento.GANHO,
              categoria: Plataforma.IFOOD,
              valor: 75,
              data: '2026-05-01T10:00:00.000Z',
            },
          ]}
          todosTrajetos={[]}
          todasEntregas={[]}
          metaDiaria={200}
          onMudarMetaDiaria={vi.fn()}
          minLucroKm={0}
          onMudarMinLucroKm={vi.fn()}
          reservaKm={0}
          onMudarReservaKm={vi.fn()}
          reservaMes={0}
          onMudarReservaMes={vi.fn()}
          vencimentos={[]}
          onMudarVencimentos={vi.fn()}
          percentualReserva={30}
          resumoHoje={{
            ganhos: 75,
            gastos: 0,
            lucro: 75,
            km: 15,
            entregas: 3,
            lucroPorKm: 5,
          }}
          onRestaurarBackup={vi.fn()}
        />
      );
    });

    const btnSalvar = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Salvar'
    );
    await act(async () => {
      btnSalvar?.click();
      await Promise.resolve();
    });
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: 'DOCUMENTS',
        encoding: 'utf8',
      })
    );

    const btnCompartilharBackup = Array.from(
      container.querySelectorAll('button')
    ).find((b) => b.textContent?.includes('Compartilhar backup'));
    await act(async () => {
      btnCompartilharBackup?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: 'CACHE',
      })
    );
    expect(mocks.getUri).toHaveBeenCalled();
    expect(mocks.share).toHaveBeenCalledWith(
      expect.objectContaining({
        files: ['file:///cache/rota-backup.json'],
      })
    );

    const btnCompartilharResumo = Array.from(
      container.querySelectorAll('button')
    ).find((b) => b.textContent?.includes('Compartilhar resumo do dia'));
    await act(async () => {
      btnCompartilharResumo?.click();
      await Promise.resolve();
    });
    expect(mocks.share).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('Ganhos:'),
      })
    );
  });
});
