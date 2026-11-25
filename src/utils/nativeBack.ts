import { useEffect, useRef } from 'react';

interface EntradaPilha {
  id: number;
  fechar: () => void;
}

let proximoId = 1;
const pilhaModais: EntradaPilha[] = [];

export function executarBackHandlerModalAberto(): boolean {
  const topo = pilhaModais[pilhaModais.length - 1];
  if (!topo) return false;
  topo.fechar();
  return true;
}

export function useNativeBackHandler(
  aberto: boolean,
  onFechar: () => void
): void {
  const callbackRef = useRef(onFechar);
  callbackRef.current = onFechar;

  useEffect(() => {
    if (!aberto) return;
    const id = proximoId++;
    pilhaModais.push({
      id,
      fechar: () => callbackRef.current(),
    });
    return () => {
      const idx = pilhaModais.findIndex((item) => item.id === id);
      if (idx !== -1) {
        pilhaModais.splice(idx, 1);
      }
    };
  }, [aberto]);
}
