import { transactSellingBatch } from "./storage.js";
import { migrateDraftSession } from "./batchDraft.js";
import { createBatchDraftStore } from "./batchDraftStore.js";

export const batchDraftStore = createBatchDraftStore({
  load: () => transactSellingBatch((values) => ({
    session: migrateDraftSession(values.selling, values.scan, values.tools), migrate: true,
  })),
  save: (session, revision) => transactSellingBatch((values) => {
    if (values.selling?.revision !== revision) throw new Error("This batch changed in another tab");
    return { session };
  }),
});
