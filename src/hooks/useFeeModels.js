import { useState, useEffect } from "react";
import { feeModelsAPI } from "../lib/api";
import { PLATFORM_FEES } from "../lib/constants";

let cache = null;

export function useFeeModels() {
  const [models, setModels] = useState(cache || {});

  useEffect(() => {
    if (cache !== null) return;
    feeModelsAPI.list()
      .then((rows) => {
        const map = {};
        for (const r of rows) map[r.platform] = r.fee_rate;
        cache = map;
        setModels(map);
      })
      .catch(() => { cache = {}; });
  }, []);

  const getFeeRate = (platform) => {
    const v = models[platform];
    return v !== undefined ? v : (PLATFORM_FEES[platform] ?? 0);
  };

  return { getFeeRate, models };
}
