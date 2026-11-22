import { Trajeto } from '../types';
import { ConfigTrocaOleo } from './storage';

export interface StatusTrocaOleo {
  totalKmHistorico: number;
  kmDesdeTrocaOleo: number;
  faltaParaTrocaOleo: number;
  progressoOleo: number;
  oleoVencido: boolean;
  oleoProximo: boolean;
}

export function calcularStatusTrocaOleo(
  trajetos: Trajeto[],
  configOleo: ConfigTrocaOleo
): StatusTrocaOleo {
  const totalKmHistorico = trajetos.reduce((acc, t) => acc + t.km, 0);
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
  const oleoProximo = !oleoVencido && progressoOleo >= 80;

  return {
    totalKmHistorico,
    kmDesdeTrocaOleo,
    faltaParaTrocaOleo,
    progressoOleo,
    oleoVencido,
    oleoProximo,
  };
}
