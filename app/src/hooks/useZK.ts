import { useEffect, useState } from 'react';
import { buildPoseidon } from 'circomlibjs';

let poseidonInstance: any = null;
let poseidonPromise: Promise<any> | null = null;

function ensurePoseidon(): Promise<any> {
  if (poseidonPromise) return poseidonPromise;
  const p = buildPoseidon().then((inst: any) => {
    poseidonInstance = inst;
    return inst;
  });
  poseidonPromise = p;
  return p;
}

export function useZK() {
  const [ready, setReady] = useState(!!poseidonInstance);

  useEffect(() => {
    if (poseidonInstance) {
      setReady(true);
      return;
    }
    ensurePoseidon().then(() => setReady(true));
  }, []);

  return {
    ready,
    poseidon: poseidonInstance,
    F: poseidonInstance?.F,
  };
}

export function getPoseidon() {
  return poseidonInstance;
}
