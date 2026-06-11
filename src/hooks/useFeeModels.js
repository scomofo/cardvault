import { useEffect, useState } from "react";
import { feeModelsAPI } from "../lib/api";
import { PLATFORM_FEES } from "../lib/constants";

let feeModelCache = null;

export function useFeeModels(enabled = true) {
  const [models, setModels] = useState(() => feeModelCache || {});

  useEffect(() => {
    if (!enabled || feeModelCache !== null) return;
    let cancelled = false;
    feeModelsAPI
      .list()
      .then((rows) => {
        const next = {};
        for (const row of rows || []) next[row.platform] = Number(row.feeRate) || 0;
        feeModelCache = next;
        if (!cancelled) setModels(next);
      })
      .catch(() => {
        feeModelCache = {};
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const getFeeRate = (platform) => (
    models[platform] !== undefined ? models[platform] : (PLATFORM_FEES[platform] || 0)
  );

  return { getFeeRate, models };
}

export function clearFeeModelCache() {
  feeModelCache = null;
}
