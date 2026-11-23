import { beforeEach, describe, expect, it } from 'vitest';
import {
  CategoriaGasto,
  Entrega,
  Lancamento,
  Plataforma,
  TipoLancamento,
  Trajeto,
  Vencimento,
} from '../../types';
import { calcularStatusTrocaOleo } from '../manutencao';
import {
  carregarEntregas,
  carregarLancamentos,
  obterEntregasLancamento,
  sanitizarEntregas,
  sanitizarLancamentos,
  validarEConverterBackupJson,
} from '../storage';
import {
  calcularDiasParaVencimento,
  obterAvisoVencimentoMaisProximo,
} from '../vencimentos';

describe('validarEConverterBackupJson', () => {
  it('restaura backup antigo (versao 1) sem campos novos e preserva campos ausentes como undefined', () => {
    const backupAntigo = JSON.stringify({
      versao: 1,
      exportadoEm: '2025-02-01T12:00:00.000Z',
      metaDiaria: 180.5,
      lancamentos: [
        {
          id: 'l-1',
          tipo: TipoLancamento.GANHO,
          categoria: Plataforma.IFOOD,
          valor: 45.5,
          data: '2025-02-01T11:30:00.000Z',
        },
        {
          id: 'l-2',
          tipo: TipoLancamento.GASTO,
          categoria: CategoriaGasto.COMBUSTIVEL,
          valor: 30,
          data: '2025-02-01T10:00:00.000Z',
        },
      ],
      trajetos: [
        {
          id: 't-1',
          data: '2025-02-01T12:00:00.000Z',
          km: 24.5,
          origem: 'gps',
        },
      ],
    });

    const convertido = validarEConverterBackupJson(backupAntigo);
    expect(convertido).not.toBeNull();
    expect(convertido?.versao).toBe(1);
    expect(convertido?.metaDiaria).toBe(180.5);
    expect(convertido?.lancamentos).toHaveLength(2);
    expect(convertido?.trajetos).toHaveLength(1);
    expect(convertido?.minLucroKm).toBeUndefined();
    expect(convertido?.reservaKm).toBeUndefined();
    expect(convertido?.reservaMes).toBeUndefined();
    expect(convertido?.modoMovimento).toBeUndefined();
    expect(convertido?.altoContraste).toBeUndefined();
    expect(convertido?.percentualReserva).toBeUndefined();
    expect(convertido?.configOleo).toBeUndefined();
    expect(convertido?.vencimentos).toBeUndefined();
    expect(convertido?.entregas).toBeUndefined();
  });

  it('restaura backup novo preservando campos opcionais e configurações', () => {
    const backupNovo = JSON.stringify({
      versao: 1,
      exportadoEm: '2026-04-10T18:00:00.000Z',
      metaDiaria: 250,
      minLucroKm: 1.5,
      reservaKm: 0.25,
      reservaMes: 150,
      modoMovimento: false,
      altoContraste: true,
      percentualReserva: 20,
      configOleo: {
        intervaloKm: 1500,
        kmBase: 320.456,
        ultimaTrocaData: '2026-04-01T09:00:00.000Z',
      },
      vencimentos: [
        { id: 'v-1', nome: '  IPVA 2026  ', dataVencimento: '2026-05-15' },
        { id: 'v-inv', nome: '', dataVencimento: '2026-05-15' },
      ],
      entregas: [
        {
          id: 'e-1',
          inicioIso: '2026-04-10T15:00:00.000Z',
          fimIso: '2026-04-10T15:18:00.000Z',
          km: 4.35,
          duracaoSegundos: 1080,
          valor: 14.9,
          plataforma: 'iFood',
          lancamentoId: 'l-10',
        },
      ],
      lancamentos: [
        {
          id: 'l-10',
          tipo: TipoLancamento.GANHO,
          categoria: Plataforma.IFOOD,
          valor: 14.9,
          data: '2026-04-10T15:18:00.000Z',
          kmEntrega: 4.35,
          duracaoEntregaSegundos: 1080,
          entregas: 2,
          observacao: '  Entrega rápida  ',
        },
      ],
      trajetos: [
        {
          id: 't-10',
          data: '2026-04-10T18:00:00.000Z',
          km: 55.2,
          origem: 'gps',
          duracaoSegundos: 7200,
        },
      ],
    });

    const convertido = validarEConverterBackupJson(backupNovo);
    expect(convertido).not.toBeNull();
    expect(convertido?.minLucroKm).toBe(1.5);
    expect(convertido?.reservaKm).toBe(0.25);
    expect(convertido?.reservaMes).toBe(150);
    expect(convertido?.modoMovimento).toBe(false);
    expect(convertido?.altoContraste).toBe(true);
    expect(convertido?.percentualReserva).toBe(20);
    expect(convertido?.configOleo).toEqual({
      intervaloKm: 1500,
      kmBase: 320.46,
      ultimaTrocaData: '2026-04-01T09:00:00.000Z',
    });
    expect(convertido?.vencimentos).toEqual([
      { id: 'v-1', nome: 'IPVA 2026', dataVencimento: '2026-05-15' },
    ]);
    expect(convertido?.entregas).toHaveLength(1);
    expect(convertido?.entregas?.[0]).toEqual({
      id: 'e-1',
      inicioIso: '2026-04-10T15:00:00.000Z',
      fimIso: '2026-04-10T15:18:00.000Z',
      km: 4.35,
      duracaoSegundos: 1080,
      valor: 14.9,
      plataforma: 'iFood',
      lancamentoId: 'l-10',
    });
    expect(convertido?.lancamentos[0].entregas).toBe(2);
    expect(convertido?.lancamentos[0].observacao).toBe('Entrega rápida');
    expect(convertido?.trajetos[0].duracaoSegundos).toBe(7200);
  });

  it('rejeita JSON inválido ou sem arrays obrigatórios e descarta valores inválidos', () => {
    expect(validarEConverterBackupJson('{json-quebrado')).toBeNull();
    expect(
      validarEConverterBackupJson(JSON.stringify({ lancamentos: [] }))
    ).toBeNull();
    expect(
      validarEConverterBackupJson(JSON.stringify({ trajetos: [] }))
    ).toBeNull();

    const comValoresInvalidos = JSON.stringify({
      metaDiaria: -50,
      minLucroKm: -1,
      reservaKm: 'abc',
      reservaMes: -10,
      percentualReserva: 150,
      configOleo: { intervaloKm: 50, kmBase: -5 },
      lancamentos: [
        {
          id: 'inv-1',
          tipo: 'outro',
          categoria: Plataforma.IFOOD,
          valor: 10,
          data: '2026-04-01T10:00:00.000Z',
        },
        {
          id: 'inv-2',
          tipo: TipoLancamento.GANHO,
          categoria: Plataforma.IFOOD,
          valor: 0,
          data: '2026-04-01T10:00:00.000Z',
        },
      ],
      trajetos: [
        {
          id: 't-inv',
          data: '2026-04-01T10:00:00.000Z',
          km: -3,
          origem: 'gps',
        },
      ],
    });

    const convertido = validarEConverterBackupJson(comValoresInvalidos);
    expect(convertido).not.toBeNull();
    expect(convertido?.metaDiaria).toBe(0);
    expect(convertido?.minLucroKm).toBeUndefined();
    expect(convertido?.reservaKm).toBeUndefined();
    expect(convertido?.reservaMes).toBeUndefined();
    expect(convertido?.percentualReserva).toBeUndefined();
    expect(convertido?.configOleo).toBeUndefined();
    expect(convertido?.lancamentos).toEqual([]);
    expect(convertido?.trajetos).toEqual([]);
  });
});

describe('obterEntregasLancamento', () => {
  it('retorna 0 para gastos, 1 para ganhos antigos sem campo e o inteiro válido para ganhos com entregas', () => {
    const gasto: Lancamento = {
      id: 'g-1',
      tipo: TipoLancamento.GASTO,
      categoria: CategoriaGasto.COMBUSTIVEL,
      valor: 40,
      data: '2026-04-10T10:00:00.000Z',
      entregas: 5,
    };
    const ganhoLegado: Lancamento = {
      id: 'l-1',
      tipo: TipoLancamento.GANHO,
      categoria: Plataforma.IFOOD,
      valor: 25,
      data: '2026-04-10T11:00:00.000Z',
    };
    const ganhoComMultiplas: Lancamento = {
      id: 'l-2',
      tipo: TipoLancamento.GANHO,
      categoria: Plataforma.AIQFOME,
      valor: 60,
      data: '2026-04-10T12:00:00.000Z',
      entregas: 4.8,
    };
    const ganhoInvalido: Lancamento = {
      id: 'l-3',
      tipo: TipoLancamento.GANHO,
      categoria: Plataforma.PARTICULAR,
      valor: 15,
      data: '2026-04-10T13:00:00.000Z',
      entregas: 0,
    };

    expect(obterEntregasLancamento(gasto)).toBe(0);
    expect(obterEntregasLancamento(ganhoLegado)).toBe(1);
    expect(obterEntregasLancamento(ganhoComMultiplas)).toBe(4);
    expect(obterEntregasLancamento(ganhoInvalido)).toBe(1);
  });
});

describe('calcularStatusTrocaOleo', () => {
  const trajetosBase: Trajeto[] = [
    { id: 't-1', data: '2026-04-01T10:00:00.000Z', km: 600, origem: 'gps' },
    { id: 't-2', data: '2026-04-02T10:00:00.000Z', km: 250, origem: 'manual' },
  ];

  it('indica óleo próximo quando atinge 80% do intervalo', () => {
    const status = calcularStatusTrocaOleo(trajetosBase, {
      intervaloKm: 1000,
      kmBase: 0,
    });

    expect(status.totalKmHistorico).toBe(850);
    expect(status.kmDesdeTrocaOleo).toBe(850);
    expect(status.faltaParaTrocaOleo).toBe(150);
    expect(status.progressoOleo).toBe(85);
    expect(status.oleoProximo).toBe(true);
    expect(status.oleoVencido).toBe(false);
  });

  it('indica óleo vencido quando atinge ou ultrapassa o intervalo e respeita kmBase', () => {
    const statusVencido = calcularStatusTrocaOleo(
      [
        ...trajetosBase,
        { id: 't-3', data: '2026-04-03T10:00:00.000Z', km: 200, origem: 'gps' },
      ],
      { intervaloKm: 1000, kmBase: 0 }
    );
    expect(statusVencido.oleoVencido).toBe(true);
    expect(statusVencido.oleoProximo).toBe(false);
    expect(statusVencido.faltaParaTrocaOleo).toBe(0);
    expect(statusVencido.progressoOleo).toBe(100);

    const statusAposTroca = calcularStatusTrocaOleo(trajetosBase, {
      intervaloKm: 1000,
      kmBase: 700,
    });
    expect(statusAposTroca.kmDesdeTrocaOleo).toBe(150);
    expect(statusAposTroca.faltaParaTrocaOleo).toBe(850);
    expect(statusAposTroca.oleoProximo).toBe(false);
    expect(statusAposTroca.oleoVencido).toBe(false);
  });
});

describe('calcularDiasParaVencimento e obterAvisoVencimentoMaisProximo', () => {
  const agoraFixo = new Date(2026, 3, 10, 14, 30, 0); // 10/04/2026

  it('calcula dias positivos, zero (hoje), negativos (vencido) e entradas inválidas', () => {
    expect(calcularDiasParaVencimento('2026-04-10', agoraFixo)).toBe(0);
    expect(calcularDiasParaVencimento('2026-04-15', agoraFixo)).toBe(5);
    expect(calcularDiasParaVencimento('2026-04-08', agoraFixo)).toBe(-2);
    expect(calcularDiasParaVencimento('invalido', agoraFixo)).toBeNull();
  });

  it('seleciona o vencimento mais próximo ou vencido dentro da janela de 30 dias', () => {
    const lista: Vencimento[] = [
      { id: '1', nome: 'Seguro', dataVencimento: '2026-06-01' }, // > 30 dias
      { id: '2', nome: 'CNH', dataVencimento: '2026-04-11' }, // em 1 dia
      { id: '3', nome: 'IPVA', dataVencimento: '2026-04-10' }, // hoje
    ];

    const avisoHoje = obterAvisoVencimentoMaisProximo(lista, agoraFixo);
    expect(avisoHoje?.dias).toBe(0);
    expect(avisoHoje?.vencido).toBe(false);
    expect(avisoHoje?.texto).toBe('IPVA vence hoje');

    const avisoUmDia = obterAvisoVencimentoMaisProximo(
      [lista[0], lista[1]],
      agoraFixo
    );
    expect(avisoUmDia?.texto).toBe('CNH em 1 dia');

    const avisoVencido = obterAvisoVencimentoMaisProximo(
      [
        lista[1],
        { id: '4', nome: 'Licenciamento', dataVencimento: '2026-04-05' },
      ],
      agoraFixo
    );
    expect(avisoVencido?.vencido).toBe(true);
    expect(avisoVencido?.texto).toBe('Licenciamento vencido');

    expect(
      obterAvisoVencimentoMaisProximo([lista[0]], agoraFixo)
    ).toBeNull();
  });
});

describe('sanitizarLancamentos e sanitizarEntregas', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('preserva campos opcionais válidos de Lancamento e descarta inválidos', () => {
    const observacaoLonga = `  ${'a'.repeat(100)}  `;
    const resultado = sanitizarLancamentos([
      {
        id: 'l-ok',
        tipo: TipoLancamento.GANHO,
        categoria: Plataforma.IFOOD,
        valor: 32.456,
        data: '2026-04-10T12:00:00.000Z',
        observacao: observacaoLonga,
        kmEntrega: 4.129,
        duracaoEntregaSegundos: 612.9,
        entregas: 3.7,
      },
      {
        id: 'l-gasto',
        tipo: TipoLancamento.GASTO,
        categoria: CategoriaGasto.MANUTENCAO,
        valor: 50,
        data: '2026-04-10T13:00:00.000Z',
        kmEntrega: 5,
        duracaoEntregaSegundos: 300,
        entregas: 2,
        observacao: '  Troca de pastilha  ',
      },
      {
        id: 'l-invalido',
        tipo: TipoLancamento.GANHO,
        categoria: Plataforma.IFOOD,
        valor: -10,
        data: '2026-04-10T14:00:00.000Z',
      },
    ]);

    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toEqual({
      id: 'l-ok',
      tipo: TipoLancamento.GANHO,
      categoria: Plataforma.IFOOD,
      valor: 32.46,
      data: '2026-04-10T12:00:00.000Z',
      observacao: 'a'.repeat(80),
      kmEntrega: 4.13,
      duracaoEntregaSegundos: 612,
      entregas: 3,
    });
    expect(resultado[1]).toEqual({
      id: 'l-gasto',
      tipo: TipoLancamento.GASTO,
      categoria: CategoriaGasto.MANUTENCAO,
      valor: 50,
      data: '2026-04-10T13:00:00.000Z',
      observacao: 'Troca de pastilha',
      kmEntrega: undefined,
      duracaoEntregaSegundos: undefined,
      entregas: undefined,
    });

    localStorage.setItem('rota_lancamentos_v1', JSON.stringify(resultado));
    expect(carregarLancamentos()).toEqual(resultado);
  });

  it('preserva campos opcionais válidos de Entrega e descarta entregas inválidas', () => {
    const entrada: unknown[] = [
      {
        id: 'e-ok',
        inicioIso: '2026-04-10T12:00:00.000Z',
        fimIso: '2026-04-10T12:10:00.000Z',
        km: 2.756,
        duracaoSegundos: 600.4,
        valor: 12.5,
        plataforma: '  iFood  ',
        lancamentoId: '  l-1  ',
      } satisfies Entrega,
      {
        id: 'e-sem-valor',
        inicioIso: '2026-04-10T13:00:00.000Z',
        fimIso: '2026-04-10T13:05:00.000Z',
        km: 0,
        duracaoSegundos: 0,
        valor: 0,
        plataforma: '   ',
      },
      {
        id: 'e-data-invalida',
        inicioIso: 'nao-e-data',
        fimIso: '2026-04-10T13:05:00.000Z',
        km: 1,
        duracaoSegundos: 60,
      },
      {
        id: 'e-km-negativo',
        inicioIso: '2026-04-10T13:00:00.000Z',
        fimIso: '2026-04-10T13:05:00.000Z',
        km: -1,
        duracaoSegundos: 60,
      },
    ];

    const resultado = sanitizarEntregas(entrada);
    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toEqual({
      id: 'e-ok',
      inicioIso: '2026-04-10T12:00:00.000Z',
      fimIso: '2026-04-10T12:10:00.000Z',
      km: 2.76,
      duracaoSegundos: 600,
      valor: 12.5,
      plataforma: 'iFood',
      lancamentoId: 'l-1',
    });
    expect(resultado[1]).toEqual({
      id: 'e-sem-valor',
      inicioIso: '2026-04-10T13:00:00.000Z',
      fimIso: '2026-04-10T13:05:00.000Z',
      km: 0,
      duracaoSegundos: 0,
      valor: undefined,
      plataforma: undefined,
      lancamentoId: undefined,
    });

    localStorage.setItem('rota_entregas_v1', JSON.stringify(resultado));
    expect(carregarEntregas()).toEqual(resultado);
  });
});
