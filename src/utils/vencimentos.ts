import { Vencimento } from '../types';

export const SUGESTOES_VENCIMENTO = [
  'IPVA',
  'Licenciamento',
  'CNH',
  'Seguro',
] as const;

export function calcularDiasParaVencimento(
  dataVencimento: string,
  agora: Date = new Date()
): number | null {
  const partes = dataVencimento.split('-').map(Number);
  if (partes.length !== 3 || partes.some((n) => !Number.isFinite(n))) {
    return null;
  }
  const [ano, mes, dia] = partes;
  const alvo = new Date(ano, mes - 1, dia, 0, 0, 0, 0);
  if (Number.isNaN(alvo.getTime())) return null;

  const hoje = new Date(
    agora.getFullYear(),
    agora.getMonth(),
    agora.getDate(),
    0,
    0,
    0,
    0
  );
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
}

export function formatarDataVencimento(dataVencimento: string): string {
  const partes = dataVencimento.split('-');
  if (partes.length !== 3) return dataVencimento;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

export interface AvisoVencimento {
  vencimento: Vencimento;
  dias: number;
  vencido: boolean;
  texto: string;
}

export function obterAvisoVencimentoMaisProximo(
  vencimentos: Vencimento[],
  agora: Date = new Date()
): AvisoVencimento | null {
  let escolhido: { item: Vencimento; dias: number } | null = null;

  for (const item of vencimentos) {
    const dias = calcularDiasParaVencimento(item.dataVencimento, agora);
    if (dias === null || dias > 30) continue;

    if (!escolhido || dias < escolhido.dias) {
      escolhido = { item, dias };
    }
  }

  if (!escolhido) return null;

  const { item, dias } = escolhido;
  const vencido = dias < 0;
  const texto = vencido
    ? `${item.nome} vencido`
    : dias === 0
      ? `${item.nome} vence hoje`
      : `${item.nome} em ${dias} ${dias === 1 ? 'dia' : 'dias'}`;

  return {
    vencimento: item,
    dias,
    vencido,
    texto,
  };
}
