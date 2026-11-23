import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { ManutencaoBackup } from '../../components/ManutencaoBackup';
import { Plataforma, TipoLancamento } from '../../types';

// Required for React 19 act() in Vitest jsdom
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function setInputFiles(input: HTMLInputElement, jsonText: string, nome: string) {
  const file = {
    name: nome,
    type: 'application/json',
    text: async () => jsonText,
  } as unknown as File;

  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  });
}

describe('Fluxos de restauração e desfazer entrega sem valor', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    });
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
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:mock-url'),
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(),
      configurable: true,
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('ManutencaoBackup: confirma antes de restaurar, foca Cancelar, permite baixar backup antes e cancelar', async () => {
    const onRestaurar = vi.fn();
    const clickAnchorSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    await act(async () => {
      root.render(
        <ManutencaoBackup
          tema="claro"
          onMudarTema={vi.fn()}
          todosLancamentos={[
            {
              id: 'atual-1',
              tipo: TipoLancamento.GANHO,
              categoria: Plataforma.IFOOD,
              valor: 50,
              data: '2026-04-01T10:00:00.000Z',
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
            ganhos: 50,
            gastos: 0,
            lucro: 50,
            km: 10,
            entregas: 1,
            lucroPorKm: 5,
          }}
          onRestaurarBackup={onRestaurar}
        />
      );
    });

    const inputArquivo = container.querySelector(
      'input[aria-label="Selecionar arquivo de backup JSON"]'
    ) as HTMLInputElement;
    expect(inputArquivo).not.toBeNull();

    const backupAntigo = JSON.stringify({
      versao: 1,
      exportadoEm: '2025-03-01T12:00:00.000Z',
      metaDiaria: 150,
      lancamentos: [
        {
          id: 'antigo-1',
          tipo: TipoLancamento.GANHO,
          categoria: Plataforma.IFOOD,
          valor: 40,
          data: '2025-03-01T10:00:00.000Z',
        },
      ],
      trajetos: [
        {
          id: 't-antigo-1',
          data: '2025-03-01T12:00:00.000Z',
          km: 12,
          origem: 'gps',
        },
      ],
    });

    // Seleciona arquivo -> modal abre e NÃO restaura ainda
    setInputFiles(inputArquivo, backupAntigo, 'backup-antigo.json');
    await act(async () => {
      inputArquivo.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('Restaurar backup?');
    expect(dialog.textContent).toContain('Isso substitui os dados atuais.');
    expect(onRestaurar).not.toHaveBeenCalled();

    const botoes = Array.from(dialog.querySelectorAll('button'));
    const btnCancelar = botoes.find((b) => b.textContent?.trim() === 'Cancelar');
    const btnBaixarAntes = botoes.find(
      (b) => b.textContent?.trim() === 'Baixar backup atual antes'
    );
    const btnRestaurar = botoes.find(
      (b) => b.textContent?.trim() === 'Restaurar'
    );

    expect(btnCancelar).toBeDefined();
    expect(btnBaixarAntes).toBeDefined();
    expect(btnRestaurar).toBeDefined();
    expect(document.activeElement).toBe(btnCancelar);

    // Cancelar fecha o modal sem restaurar
    await act(async () => {
      btnCancelar?.click();
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(onRestaurar).not.toHaveBeenCalled();

    // Abre novamente, baixa backup atual sem fechar modal, depois confirma Restaurar
    setInputFiles(inputArquivo, backupAntigo, 'backup-antigo.json');
    await act(async () => {
      inputArquivo.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const dialog2 = container.querySelector('[role="dialog"]') as HTMLElement;
    const botoes2 = Array.from(dialog2.querySelectorAll('button'));
    const btnBaixarAntes2 = botoes2.find(
      (b) => b.textContent?.trim() === 'Baixar backup atual antes'
    );
    const btnRestaurar2 = botoes2.find(
      (b) => b.textContent?.trim() === 'Restaurar'
    );

    await act(async () => {
      btnBaixarAntes2?.click();
    });
    expect(clickAnchorSpy).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(onRestaurar).not.toHaveBeenCalled();

    await act(async () => {
      btnRestaurar2?.click();
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(onRestaurar).toHaveBeenCalledTimes(1);
    expect(onRestaurar).toHaveBeenCalledWith(
      expect.objectContaining({
        metaDiaria: 150,
        lancamentos: expect.arrayContaining([
          expect.objectContaining({ id: 'antigo-1' }),
        ]),
        trajetos: expect.arrayContaining([
          expect.objectContaining({ id: 't-antigo-1' }),
        ]),
      })
    );
  });

  it('App: restaura backup antigo/novo e permite finalizar entrega sem valor ("Pular valor") + Desfazer', async () => {
    // Semeia entrega e reserva existentes para verificar preservação em backup antigo
    localStorage.setItem(
      'rota_entregas_v1',
      JSON.stringify([
        {
          id: 'ent-existente',
          inicioIso: '2026-04-01T10:00:00.000Z',
          fimIso: '2026-04-01T10:15:00.000Z',
          km: 3.1,
          duracaoSegundos: 900,
        },
      ])
    );
    localStorage.setItem('rota_reserva_km_v1', '0.45');

    Object.defineProperty(navigator, 'geolocation', {
      value: {
        watchPosition: vi.fn(() => 1),
        clearWatch: vi.fn(),
        getCurrentPosition: vi.fn(),
      },
      configurable: true,
    });

    await act(async () => {
      root.render(<App />);
    });

    // Ir para aba Ajustes e restaurar backup antigo (sem entregas/reservaKm)
    const tabAjustes = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (el) => el.textContent?.includes('Ajustes')
    ) as HTMLButtonElement;
    await act(async () => {
      tabAjustes.click();
    });

    const inputArquivo = container.querySelector(
      'input[aria-label="Selecionar arquivo de backup JSON"]'
    ) as HTMLInputElement;
    const backupAntigo = JSON.stringify({
      versao: 1,
      exportadoEm: '2025-02-10T10:00:00.000Z',
      metaDiaria: 175,
      lancamentos: [
        {
          id: 'old-lanc',
          tipo: TipoLancamento.GANHO,
          categoria: Plataforma.IFOOD,
          valor: 30,
          data: '2025-02-10T09:00:00.000Z',
        },
      ],
      trajetos: [],
    });

    setInputFiles(inputArquivo, backupAntigo, 'old.json');
    await act(async () => {
      inputArquivo.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    let dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    let btnConfirmar = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Restaurar'
    );
    await act(async () => {
      btnConfirmar?.click();
    });

    expect(
      JSON.parse(localStorage.getItem('rota_lancamentos_v1') || '[]')[0].id
    ).toBe('old-lanc');
    expect(
      JSON.parse(localStorage.getItem('rota_entregas_v1') || '[]')[0].id
    ).toBe('ent-existente');
    expect(localStorage.getItem('rota_reserva_km_v1')).toBe('0.45');

    // Restaurar backup novo (com entregas e reservaKm atualizados)
    const backupNovo = JSON.stringify({
      versao: 1,
      exportadoEm: '2026-04-10T10:00:00.000Z',
      metaDiaria: 240,
      reservaKm: 0.6,
      lancamentos: [],
      trajetos: [],
      entregas: [],
    });
    setInputFiles(inputArquivo, backupNovo, 'new.json');
    await act(async () => {
      inputArquivo.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    btnConfirmar = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Restaurar'
    );
    await act(async () => {
      btnConfirmar?.click();
    });

    expect(localStorage.getItem('rota_reserva_km_v1')).toBe('0.6');
    expect(JSON.parse(localStorage.getItem('rota_entregas_v1') || '[]')).toEqual(
      []
    );

    // Voltar para aba Hoje, iniciar odômetro -> iniciar entrega -> finalizar -> Pular valor -> Desfazer
    const tabHoje = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (el) => el.textContent?.includes('Hoje')
    ) as HTMLButtonElement;
    await act(async () => {
      tabHoje.click();
    });

    const btnIniciarOdo = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Iniciar'
    );
    await act(async () => {
      btnIniciarOdo?.click();
    });

    const btnIniciarEntrega = Array.from(
      container.querySelectorAll('button')
    ).find((b) => b.textContent?.trim() === 'Iniciar entrega');
    await act(async () => {
      btnIniciarEntrega?.click();
    });

    const btnFinalizarEntrega = Array.from(
      container.querySelectorAll('button')
    ).find((b) => b.textContent?.trim() === 'Finalizar entrega');
    await act(async () => {
      btnFinalizarEntrega?.click();
    });

    const btnPularValor = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Pular valor'
    );
    await act(async () => {
      btnPularValor?.click();
    });

    const entregasAposPular = JSON.parse(
      localStorage.getItem('rota_entregas_v1') || '[]'
    );
    expect(entregasAposPular).toHaveLength(1);
    expect(entregasAposPular[0].valor).toBeUndefined();
    expect(entregasAposPular[0].lancamentoId).toBeUndefined();

    const toast = container.querySelector('[role="status"]') as HTMLElement;
    expect(toast).not.toBeNull();
    expect(toast.textContent).toContain('Entrega de');
    expect(toast.textContent).toContain('km');

    const btnDesfazer = Array.from(toast.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Desfazer'
    );
    await act(async () => {
      btnDesfazer?.click();
    });

    const entregasAposDesfazer = JSON.parse(
      localStorage.getItem('rota_entregas_v1') || '[]'
    );
    expect(entregasAposDesfazer).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('rota_lancamentos_v1') || '[]')).toHaveLength(
      0
    );
  });
});
