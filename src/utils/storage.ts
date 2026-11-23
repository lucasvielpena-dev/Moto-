import {
  CategoriaGasto,
  Entrega,
  Lancamento,
  Plataforma,
  TipoLancamento,
  Trajeto,
  Vencimento,
} from '../types';

const KEY_LANCAMENTOS = 'rota_lancamentos_v1';
const KEY_TRAJETOS = 'rota_trajetos_v1';
const KEY_ODOMETRO_KM = 'rota_odometro_km_v1';
const KEY_ODOMETRO_SEGUNDOS = 'rota_odometro_segundos_v1';
const KEY_META_DIARIA = 'rota_meta_diaria_v1';
const KEY_ULTIMO_KM_PAINEL = 'rota_ultimo_km_painel_v1';
const KEY_CONFIG_OLEO = 'rota_config_oleo_v1';
const KEY_PERCENTUAL_RESERVA = 'rota_percentual_reserva_v1';
const KEY_ENTREGA_ATIVA_LEGADO = 'rota_odometro_entrega_ativa_v1';
const KEY_ENTREGA_ATUAL = 'rota_entrega_atual_v1';
const KEY_ENTREGAS = 'rota_entregas_v1';
const KEY_TEMA = 'rota_tema_v1';
const KEY_MIN_LUCRO_KM = 'rota_min_lucro_km_v1';
const KEY_MODO_MOVIMENTO = 'rota_modo_movimento_v1';
const KEY_CONTRASTE = 'rota_contraste_v1';
const KEY_RESERVA_KM = 'rota_reserva_km_v1';
const KEY_RESERVA_MES = 'rota_reserva_mes_v1';
const KEY_VENCIMENTOS = 'rota_vencimentos_v1';

export type PreferenciaTema = 'auto' | 'claro' | 'escuro';

export interface EntregaAtual {
  inicioIso: string;
  kmInicial: number;
  segundosInicial: number;
}

export interface EntregaEmAndamento {
  ativa: boolean;
  kmInicio: number;
  tempoInicioSegundos: number;
  iniciadaEm: string;
}

export interface ConfigTrocaOleo {
  intervaloKm: number;
  kmBase: number;
  ultimaTrocaData?: string;
}

const TIPOS_VALIDOS = new Set<string>(Object.values(TipoLancamento));
const CATEGORIAS_VALIDAS = new Set<string>([
  ...Object.values(Plataforma),
  ...Object.values(CategoriaGasto),
]);

const REGEX_DATA_ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;

export function obterEntregasLancamento(item: Lancamento): number {
  if (item.tipo !== TipoLancamento.GANHO) return 0;
  if (
    typeof item.entregas === 'number' &&
    Number.isFinite(item.entregas) &&
    Math.floor(item.entregas) >= 1
  ) {
    return Math.floor(item.entregas);
  }
  return 1;
}

export function sanitizarLancamentos(itens: unknown[]): Lancamento[] {
  return itens
    .filter(
      (item): item is Lancamento =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as Lancamento).id === 'string' &&
        TIPOS_VALIDOS.has(String((item as Lancamento).tipo)) &&
        CATEGORIAS_VALIDAS.has(String((item as Lancamento).categoria)) &&
        typeof (item as Lancamento).valor === 'number' &&
        Number.isFinite((item as Lancamento).valor) &&
        (item as Lancamento).valor > 0 &&
        typeof (item as Lancamento).data === 'string'
    )
    .map((item) => ({
      id: item.id,
      tipo: item.tipo,
      categoria: item.categoria,
      valor: Number(item.valor.toFixed(2)),
      data: item.data,
      observacao:
        typeof item.observacao === 'string' && item.observacao.trim()
          ? item.observacao.trim().slice(0, 80)
          : undefined,
      kmEntrega:
        item.tipo === TipoLancamento.GANHO &&
        typeof item.kmEntrega === 'number' &&
        Number.isFinite(item.kmEntrega) &&
        item.kmEntrega > 0
          ? Number(item.kmEntrega.toFixed(2))
          : undefined,
      duracaoEntregaSegundos:
        item.tipo === TipoLancamento.GANHO &&
        typeof item.duracaoEntregaSegundos === 'number' &&
        Number.isFinite(item.duracaoEntregaSegundos) &&
        item.duracaoEntregaSegundos > 0
          ? Math.floor(item.duracaoEntregaSegundos)
          : undefined,
      entregas:
        item.tipo === TipoLancamento.GANHO &&
        typeof item.entregas === 'number' &&
        Number.isFinite(item.entregas) &&
        Math.floor(item.entregas) >= 1
          ? Math.floor(item.entregas)
          : undefined,
    }));
}

export function sanitizarTrajetos(itens: unknown[]): Trajeto[] {
  return itens
    .filter(
      (item): item is Trajeto =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as Trajeto).id === 'string' &&
        typeof (item as Trajeto).data === 'string' &&
        typeof (item as Trajeto).km === 'number' &&
        Number.isFinite((item as Trajeto).km) &&
        (item as Trajeto).km > 0 &&
        ((item as Trajeto).origem === 'gps' ||
          (item as Trajeto).origem === 'manual')
    )
    .map((item) => ({
      id: item.id,
      data: item.data,
      km: Number(item.km.toFixed(2)),
      origem: item.origem,
      duracaoSegundos:
        typeof item.duracaoSegundos === 'number' &&
        Number.isFinite(item.duracaoSegundos) &&
        item.duracaoSegundos > 0
          ? Math.floor(item.duracaoSegundos)
          : undefined,
    }));
}

function sanitizarVencimentos(itens: unknown[]): Vencimento[] {
  return itens
    .filter(
      (item): item is Vencimento =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as Vencimento).id === 'string' &&
        typeof (item as Vencimento).nome === 'string' &&
        (item as Vencimento).nome.trim().length > 0 &&
        typeof (item as Vencimento).dataVencimento === 'string' &&
        REGEX_DATA_ISO_DIA.test((item as Vencimento).dataVencimento)
    )
    .map((item) => ({
      id: item.id,
      nome: item.nome.trim().slice(0, 40),
      dataVencimento: item.dataVencimento,
    }));
}

export function sanitizarEntregas(itens: unknown[]): Entrega[] {
  return itens
    .filter((item): item is Entrega => {
      if (!item || typeof item !== 'object') return false;
      const e = item as Partial<Entrega>;
      if (typeof e.id !== 'string' || !e.id.trim()) return false;
      if (
        typeof e.inicioIso !== 'string' ||
        Number.isNaN(new Date(e.inicioIso).getTime())
      ) {
        return false;
      }
      if (
        typeof e.fimIso !== 'string' ||
        Number.isNaN(new Date(e.fimIso).getTime())
      ) {
        return false;
      }
      if (typeof e.km !== 'number' || !Number.isFinite(e.km) || e.km < 0) {
        return false;
      }
      if (
        typeof e.duracaoSegundos !== 'number' ||
        !Number.isFinite(e.duracaoSegundos) ||
        e.duracaoSegundos < 0
      ) {
        return false;
      }
      return true;
    })
    .map((item) => ({
      id: item.id,
      inicioIso: item.inicioIso,
      fimIso: item.fimIso,
      km: Number(Math.max(0, item.km).toFixed(2)),
      duracaoSegundos: Math.max(0, Math.floor(item.duracaoSegundos)),
      valor:
        typeof item.valor === 'number' &&
        Number.isFinite(item.valor) &&
        item.valor > 0
          ? Number(item.valor.toFixed(2))
          : undefined,
      plataforma:
        typeof item.plataforma === 'string' && item.plataforma.trim()
          ? item.plataforma.trim().slice(0, 40)
          : undefined,
      lancamentoId:
        typeof item.lancamentoId === 'string' && item.lancamentoId.trim()
          ? item.lancamentoId.trim()
          : undefined,
    }));
}

export function carregarEntregas(): Entrega[] {
  try {
    const raw = localStorage.getItem(KEY_ENTREGAS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? sanitizarEntregas(parsed) : [];
  } catch {
    return [];
  }
}

export function salvarEntregas(entregas: Entrega[]): void {
  try {
    localStorage.setItem(KEY_ENTREGAS, JSON.stringify(entregas));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function carregarLancamentos(): Lancamento[] {
  try {
    const raw = localStorage.getItem(KEY_LANCAMENTOS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? sanitizarLancamentos(parsed) : [];
  } catch {
    return [];
  }
}

export function salvarLancamentos(lancamentos: Lancamento[]): void {
  try {
    localStorage.setItem(KEY_LANCAMENTOS, JSON.stringify(lancamentos));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function carregarTrajetos(): Trajeto[] {
  try {
    const raw = localStorage.getItem(KEY_TRAJETOS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? sanitizarTrajetos(parsed) : [];
  } catch {
    return [];
  }
}

export function salvarTrajetos(trajetos: Trajeto[]): void {
  try {
    localStorage.setItem(KEY_TRAJETOS, JSON.stringify(trajetos));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function carregarKmEmAndamento(): number {
  try {
    const raw = localStorage.getItem(KEY_ODOMETRO_KM);
    if (!raw) return 0;
    const num = Number(raw);
    return Number.isFinite(num) && num >= 0 ? num : 0;
  } catch {
    return 0;
  }
}

export function salvarKmEmAndamento(km: number): void {
  try {
    localStorage.setItem(KEY_ODOMETRO_KM, String(km));
  } catch {
    // Ignore storage errors
  }
}

export function carregarTempoOdometroSegundos(): number {
  try {
    const raw = localStorage.getItem(KEY_ODOMETRO_SEGUNDOS);
    if (!raw) return 0;
    const num = Number(raw);
    return Number.isFinite(num) && num >= 0 ? Math.floor(num) : 0;
  } catch {
    return 0;
  }
}

export function salvarTempoOdometroSegundos(segundos: number): void {
  try {
    localStorage.setItem(
      KEY_ODOMETRO_SEGUNDOS,
      String(Math.max(0, Math.floor(segundos)))
    );
  } catch {
    // Ignore storage errors
  }
}

export function carregarEntregaAtual(): EntregaAtual | null {
  try {
    const raw = localStorage.getItem(KEY_ENTREGA_ATUAL);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<EntregaAtual>;
      if (
        parsed &&
        typeof parsed.inicioIso === 'string' &&
        !Number.isNaN(new Date(parsed.inicioIso).getTime()) &&
        typeof parsed.kmInicial === 'number' &&
        Number.isFinite(parsed.kmInicial) &&
        parsed.kmInicial >= 0 &&
        typeof parsed.segundosInicial === 'number' &&
        Number.isFinite(parsed.segundosInicial) &&
        parsed.segundosInicial >= 0
      ) {
        return {
          inicioIso: parsed.inicioIso,
          kmInicial: parsed.kmInicial,
          segundosInicial: Math.floor(parsed.segundosInicial),
        };
      }
      return null;
    }

    // Fallback seguro caso exista chave legada
    const rawLegado = localStorage.getItem(KEY_ENTREGA_ATIVA_LEGADO);
    if (!rawLegado) return null;
    const parsedLegado = JSON.parse(rawLegado) as Partial<EntregaEmAndamento>;
    if (
      parsedLegado &&
      parsedLegado.ativa === true &&
      typeof parsedLegado.kmInicio === 'number' &&
      Number.isFinite(parsedLegado.kmInicio) &&
      parsedLegado.kmInicio >= 0 &&
      typeof parsedLegado.tempoInicioSegundos === 'number' &&
      Number.isFinite(parsedLegado.tempoInicioSegundos) &&
      parsedLegado.tempoInicioSegundos >= 0
    ) {
      return {
        inicioIso:
          typeof parsedLegado.iniciadaEm === 'string' &&
          !Number.isNaN(new Date(parsedLegado.iniciadaEm).getTime())
            ? parsedLegado.iniciadaEm
            : new Date().toISOString(),
        kmInicial: parsedLegado.kmInicio,
        segundosInicial: Math.floor(parsedLegado.tempoInicioSegundos),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function salvarEntregaAtual(entrega: EntregaAtual | null): void {
  try {
    if (!entrega) {
      localStorage.removeItem(KEY_ENTREGA_ATUAL);
      localStorage.removeItem(KEY_ENTREGA_ATIVA_LEGADO);
    } else {
      localStorage.setItem(KEY_ENTREGA_ATUAL, JSON.stringify(entrega));
      localStorage.removeItem(KEY_ENTREGA_ATIVA_LEGADO);
    }
  } catch {
    // Ignore storage errors
  }
}

export function carregarEntregaEmAndamento(): EntregaEmAndamento | null {
  const atual = carregarEntregaAtual();
  if (!atual) return null;
  return {
    ativa: true,
    kmInicio: atual.kmInicial,
    tempoInicioSegundos: atual.segundosInicial,
    iniciadaEm: atual.inicioIso,
  };
}

export function salvarEntregaEmAndamento(
  entrega: EntregaEmAndamento | null
): void {
  if (!entrega) {
    salvarEntregaAtual(null);
  } else {
    salvarEntregaAtual({
      inicioIso: entrega.iniciadaEm,
      kmInicial: entrega.kmInicio,
      segundosInicial: entrega.tempoInicioSegundos,
    });
  }
}

export function carregarMetaDiaria(): number {
  try {
    const raw = localStorage.getItem(KEY_META_DIARIA);
    if (!raw) return 0;
    const num = Number(raw);
    return Number.isFinite(num) && num >= 0 ? num : 0;
  } catch {
    return 0;
  }
}

export function salvarMetaDiaria(meta: number): void {
  try {
    localStorage.setItem(KEY_META_DIARIA, String(meta));
  } catch {
    // Ignore storage errors
  }
}

export function carregarMinLucroKm(): number {
  try {
    const raw = localStorage.getItem(KEY_MIN_LUCRO_KM);
    if (!raw) return 0;
    const num = Number(raw);
    return Number.isFinite(num) && num >= 0 ? num : 0;
  } catch {
    return 0;
  }
}

export function salvarMinLucroKm(valor: number): void {
  try {
    if (Number.isFinite(valor) && valor >= 0) {
      localStorage.setItem(KEY_MIN_LUCRO_KM, String(valor));
    }
  } catch {
    // Ignore storage errors
  }
}

export function carregarReservaKm(): number {
  try {
    const raw = localStorage.getItem(KEY_RESERVA_KM);
    if (!raw) return 0;
    const num = Number(raw);
    return Number.isFinite(num) && num >= 0 ? num : 0;
  } catch {
    return 0;
  }
}

export function salvarReservaKm(valor: number): void {
  try {
    if (Number.isFinite(valor) && valor >= 0) {
      localStorage.setItem(KEY_RESERVA_KM, String(valor));
    }
  } catch {
    // Ignore storage errors
  }
}

export function carregarReservaMes(): number {
  try {
    const raw = localStorage.getItem(KEY_RESERVA_MES);
    if (!raw) return 0;
    const num = Number(raw);
    return Number.isFinite(num) && num >= 0 ? num : 0;
  } catch {
    return 0;
  }
}

export function salvarReservaMes(valor: number): void {
  try {
    if (Number.isFinite(valor) && valor >= 0) {
      localStorage.setItem(KEY_RESERVA_MES, String(valor));
    }
  } catch {
    // Ignore storage errors
  }
}

export function carregarVencimentos(): Vencimento[] {
  try {
    const raw = localStorage.getItem(KEY_VENCIMENTOS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? sanitizarVencimentos(parsed) : [];
  } catch {
    return [];
  }
}

export function salvarVencimentos(vencimentos: Vencimento[]): void {
  try {
    localStorage.setItem(KEY_VENCIMENTOS, JSON.stringify(vencimentos));
  } catch {
    // Ignore storage errors
  }
}

export function carregarTema(): PreferenciaTema {
  try {
    const raw = localStorage.getItem(KEY_TEMA);
    if (raw === 'claro' || raw === 'escuro' || raw === 'auto') {
      return raw;
    }
    return 'auto';
  } catch {
    return 'auto';
  }
}

export function salvarTema(tema: PreferenciaTema): void {
  try {
    localStorage.setItem(KEY_TEMA, tema);
  } catch {
    // Ignore storage errors
  }
}

export function carregarModoMovimento(): boolean {
  try {
    const raw = localStorage.getItem(KEY_MODO_MOVIMENTO);
    if (raw === 'false' || raw === '0') return false;
    if (raw === 'true' || raw === '1') return true;
    return true;
  } catch {
    return true;
  }
}

export function salvarModoMovimento(ativo: boolean): void {
  try {
    localStorage.setItem(KEY_MODO_MOVIMENTO, ativo ? 'true' : 'false');
  } catch {
    // Ignore storage errors
  }
}

export function carregarAltoContraste(): boolean {
  try {
    const raw = localStorage.getItem(KEY_CONTRASTE);
    return raw === 'high';
  } catch {
    return false;
  }
}

export function salvarAltoContraste(ativo: boolean): void {
  try {
    localStorage.setItem(KEY_CONTRASTE, ativo ? 'high' : 'normal');
  } catch {
    // Ignore storage errors
  }
}

export function carregarUltimoKmPainel(): number {
  try {
    const raw = localStorage.getItem(KEY_ULTIMO_KM_PAINEL);
    if (!raw) return 0;
    const num = Number(raw);
    return Number.isFinite(num) && num >= 0 ? num : 0;
  } catch {
    return 0;
  }
}

export function salvarUltimoKmPainel(km: number): void {
  try {
    if (Number.isFinite(km) && km >= 0) {
      localStorage.setItem(KEY_ULTIMO_KM_PAINEL, String(km));
    }
  } catch {
    // Ignore storage errors
  }
}

export function carregarConfigOleo(): ConfigTrocaOleo {
  try {
    const raw = localStorage.getItem(KEY_CONFIG_OLEO);
    if (!raw) return { intervaloKm: 1000, kmBase: 0 };
    const parsed = JSON.parse(raw) as Partial<ConfigTrocaOleo>;
    const intervaloKm =
      typeof parsed?.intervaloKm === 'number' &&
      Number.isFinite(parsed.intervaloKm) &&
      parsed.intervaloKm >= 100
        ? Math.round(parsed.intervaloKm)
        : 1000;
    const kmBase =
      typeof parsed?.kmBase === 'number' &&
      Number.isFinite(parsed.kmBase) &&
      parsed.kmBase >= 0
        ? Number(parsed.kmBase.toFixed(2))
        : 0;
    const ultimaTrocaData =
      typeof parsed?.ultimaTrocaData === 'string'
        ? parsed.ultimaTrocaData
        : undefined;
    return { intervaloKm, kmBase, ultimaTrocaData };
  } catch {
    return { intervaloKm: 1000, kmBase: 0 };
  }
}

export function salvarConfigOleo(config: ConfigTrocaOleo): void {
  try {
    localStorage.setItem(KEY_CONFIG_OLEO, JSON.stringify(config));
  } catch {
    // Ignore storage errors
  }
}

export function carregarPercentualReserva(): number {
  try {
    const raw = localStorage.getItem(KEY_PERCENTUAL_RESERVA);
    if (!raw) return 30;
    const num = Number(raw);
    return Number.isFinite(num) && num >= 0 && num <= 100 ? num : 30;
  } catch {
    return 30;
  }
}

export function salvarPercentualReserva(percentual: number): void {
  try {
    if (Number.isFinite(percentual) && percentual >= 0 && percentual <= 100) {
      localStorage.setItem(KEY_PERCENTUAL_RESERVA, String(percentual));
    }
  } catch {
    // Ignore storage errors
  }
}

export function gerarId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface DadosRestauracao {
  lancamentos: Lancamento[];
  trajetos: Trajeto[];
  metaDiaria: number;
  configOleo?: ConfigTrocaOleo;
  percentualReserva?: number;
  minLucroKm?: number;
  reservaKm?: number;
  reservaMes?: number;
  vencimentos?: Vencimento[];
  entregas?: Entrega[];
  altoContraste?: boolean;
}

export interface BackupRota {
  versao: 1;
  exportadoEm: string;
  metaDiaria: number;
  minLucroKm?: number;
  reservaKm?: number;
  reservaMes?: number;
  modoMovimento?: boolean;
  altoContraste?: boolean;
  percentualReserva?: number;
  configOleo?: ConfigTrocaOleo;
  vencimentos?: Vencimento[];
  entregas?: Entrega[];
  lancamentos: Lancamento[];
  trajetos: Trajeto[];
}

function formatarDuracaoCsv(segundos: number): string {
  const safe = Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos) : 0;
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function gerarConteudoCsv(
  lancamentos: Lancamento[],
  trajetos: Trajeto[],
  entregas: Entrega[] = []
): string {
  const escapar = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const linhas: string[] = [
    'Registro;Data/Hora;Tipo;Categoria/Origem;Valor (R$);Distância (km);Entregas;Observação',
  ];

  for (const item of lancamentos) {
    const dataFormatada = new Date(item.data).toLocaleString('pt-BR');
    linhas.push(
      [
        'Lançamento',
        escapar(dataFormatada),
        item.tipo === TipoLancamento.GANHO ? 'Ganho' : 'Gasto',
        escapar(item.categoria),
        item.valor.toFixed(2).replace('.', ','),
        typeof item.kmEntrega === 'number' && item.kmEntrega > 0
          ? item.kmEntrega.toFixed(2).replace('.', ',')
          : '',
        item.tipo === TipoLancamento.GANHO
          ? String(obterEntregasLancamento(item))
          : '',
        escapar(item.observacao ?? ''),
      ].join(';')
    );
  }

  for (const entrega of entregas) {
    const dataFormatada = new Date(entrega.fimIso).toLocaleString('pt-BR');
    linhas.push(
      [
        'Entrega',
        escapar(dataFormatada),
        'Entrega',
        escapar(entrega.plataforma ?? ''),
        typeof entrega.valor === 'number' && entrega.valor > 0
          ? entrega.valor.toFixed(2).replace('.', ',')
          : '',
        entrega.km.toFixed(2).replace('.', ','),
        '1',
        escapar(`Duração: ${formatarDuracaoCsv(entrega.duracaoSegundos)}`),
      ].join(';')
    );
  }

  for (const trajeto of trajetos) {
    const dataFormatada = new Date(trajeto.data).toLocaleString('pt-BR');
    linhas.push(
      [
        'Trajeto',
        escapar(dataFormatada),
        'Quilometragem',
        trajeto.origem === 'gps' ? 'GPS automático' : 'Manual',
        '',
        trajeto.km.toFixed(2).replace('.', ','),
        '',
        trajeto.duracaoSegundos
          ? escapar(`Duração: ${Math.floor(trajeto.duracaoSegundos / 60)} min`)
          : '',
      ].join(';')
    );
  }

  return '\uFEFF' + linhas.join('\n');
}

export function validarEConverterBackupJson(texto: string): BackupRota | null {
  try {
    const parsed = JSON.parse(texto) as Partial<BackupRota>;
    if (
      !parsed ||
      !Array.isArray(parsed.lancamentos) ||
      !Array.isArray(parsed.trajetos)
    ) {
      return null;
    }

    const lancamentosValidos = sanitizarLancamentos(parsed.lancamentos);
    const trajetosValidos = sanitizarTrajetos(parsed.trajetos);

    const metaDiaria =
      typeof parsed.metaDiaria === 'number' &&
      Number.isFinite(parsed.metaDiaria) &&
      parsed.metaDiaria >= 0
        ? Number(parsed.metaDiaria.toFixed(2))
        : 0;

    const minLucroKm =
      typeof parsed.minLucroKm === 'number' &&
      Number.isFinite(parsed.minLucroKm) &&
      parsed.minLucroKm >= 0
        ? Number(parsed.minLucroKm.toFixed(2))
        : undefined;

    const reservaKm =
      typeof parsed.reservaKm === 'number' &&
      Number.isFinite(parsed.reservaKm) &&
      parsed.reservaKm >= 0
        ? Number(parsed.reservaKm.toFixed(2))
        : undefined;

    const reservaMes =
      typeof parsed.reservaMes === 'number' &&
      Number.isFinite(parsed.reservaMes) &&
      parsed.reservaMes >= 0
        ? Number(parsed.reservaMes.toFixed(2))
        : undefined;

    const modoMovimento =
      typeof parsed.modoMovimento === 'boolean'
        ? parsed.modoMovimento
        : undefined;

    const altoContraste =
      typeof parsed.altoContraste === 'boolean'
        ? parsed.altoContraste
        : undefined;

    let configOleo: ConfigTrocaOleo | undefined;
    if (parsed.configOleo && typeof parsed.configOleo === 'object') {
      const interval = parsed.configOleo.intervaloKm;
      const base = parsed.configOleo.kmBase;
      if (
        typeof interval === 'number' &&
        Number.isFinite(interval) &&
        interval >= 100 &&
        typeof base === 'number' &&
        Number.isFinite(base) &&
        base >= 0
      ) {
        configOleo = {
          intervaloKm: Math.round(interval),
          kmBase: Number(base.toFixed(2)),
          ultimaTrocaData:
            typeof parsed.configOleo.ultimaTrocaData === 'string'
              ? parsed.configOleo.ultimaTrocaData
              : undefined,
        };
      }
    }

    const percentualReserva =
      typeof parsed.percentualReserva === 'number' &&
      Number.isFinite(parsed.percentualReserva) &&
      parsed.percentualReserva >= 0 &&
      parsed.percentualReserva <= 100
        ? Number(parsed.percentualReserva.toFixed(1))
        : undefined;

    const vencimentos = Array.isArray(parsed.vencimentos)
      ? sanitizarVencimentos(parsed.vencimentos)
      : undefined;

    const entregas = Array.isArray(parsed.entregas)
      ? sanitizarEntregas(parsed.entregas)
      : undefined;

    return {
      versao: 1,
      exportadoEm:
        typeof parsed.exportadoEm === 'string'
          ? parsed.exportadoEm
          : new Date().toISOString(),
      metaDiaria,
      minLucroKm,
      reservaKm,
      reservaMes,
      modoMovimento,
      altoContraste,
      percentualReserva,
      configOleo,
      vencimentos,
      entregas,
      lancamentos: lancamentosValidos,
      trajetos: trajetosValidos,
    };
  } catch {
    return null;
  }
}
