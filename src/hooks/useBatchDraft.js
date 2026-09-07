import { useEffect, useRef, useSyncExternalStore } from "react";
import { useData } from "../lib/DataContext";
import { useToast } from "../components/Toast";
import { useFeeModels } from "./useFeeModels";
import { batchDraftStore as store } from "../lib/batchDraftPersistence";
import { newDraftEntry, inventoryBlockedReason, applyDraftIdentification, draftReadiness } from "../lib/batchDraft";
import { saveDraftSelection } from "../lib/batchDraftSave";
import { loadImage, saveImage, loadData, saveData } from "../lib/storage";
import { prepareImageForAi } from "../lib/imageForAi";
import { aiVisualSearch } from "../lib/ai";
import { imagesAPI, itemsAPI, listingsAPI } from "../lib/api";

const fileData = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error(`Could not read ${file.name}`)); reader.readAsDataURL(file);
});
const mergeRecord = (records, record) => [record, ...records.filter((item) => item.id !== record.id)];

export function useBatchDraft() {
  const data = useData(), toast = useToast();
  const { getFeeRate } = useFeeModels(data.useServer);
  const current = useRef({ data, toast, feeRate: getFeeRate("ebay") });
  current.current = { data, toast, feeRate: getFeeRate("ebay") };
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { store.init().catch(() => {}); }, []);
  const report = (promise) => promise.catch((error) => { current.current.toast.error(error.message); return false; });
  const edit = (transform) => store.getSnapshot().busy ? Promise.resolve(false) : report(store.mutate(transform));
  const patch = (id, updates) => edit((session) => ({ ...session, entries: session.entries.map((entry) => {
    if (entry.id !== id || entry.stage === "saved") return entry;
    return { ...entry, ...updates, error: null };
  }) }));

  async function addCapture({ front, back }) {
    const entry = newDraftEntry({ id: crypto.randomUUID(), defaults: store.getSnapshot().session.defaults });
    if (!front) throw new Error("Add a front photo");
    for (const [side, image] of [["front", front], ["back", back]]) {
      if (!image) continue;
      const id = `img_${entry.itemId}_${side}`;
      await saveImage(id, await prepareImageForAi(image));
      entry[`${side}ImgId`] = id;
    }
    entry.selected = true;
    await store.mutate((session) => ({ ...session, entries: [...session.entries, entry] }));
    return true;
  }

  async function persistDraft(payload, entry) {
    const { data: latest } = current.current;
    if (latest.loading) throw new Error("Inventory is still loading");
    let serverItem = null;
    if (latest.useServer) {
      try { serverItem = await itemsAPI.get(entry.itemId); }
      catch (error) { if (error.status !== 404) throw error; }
    }
    // Local and server image storage are distinct; mirror real photos before DB writes.
    for (const id of [entry.frontImgId, entry.backImgId]) {
      const image = await loadImage(id);
      if (latest.useServer && image && !serverItem && entry.source === "photo") await imagesAPI.upload(id, image);
      if (!latest.useServer && !image) throw new Error("A photo is not available offline. Reconnect before saving.");
    }
    let result;
    if (latest.useServer) result = await listingsAPI.createDraft(payload);
    else {
      const catalog = loadData("catalog", latest.catalog), listings = loadData("listings", latest.listings);
      const existing = catalog.find((card) => card.id === entry.itemId);
      const prior = listings.find((listing) => listing.id === entry.listingId);
      if (existing?.status === "sold" || existing?.status === "listed") throw new Error("Card is sold or listed. Review the collection.");
      if (entry.source === "inventory" && !existing) throw new Error("The selected card no longer exists");
      if (prior && (prior.status !== "draft" || prior.externalListingId || prior.exportBatchId !== payload.batchId || prior.cardId !== entry.itemId)) throw new Error("This listing changed; review it in Sales");
      if (listings.some((listing) => listing.cardId === entry.itemId && listing.id !== entry.listingId && listing.status !== "ended")) throw new Error("Card already has a draft or listing");
      result = { item: existing || { ...payload.item, createdAt: entry.createdAt }, listing: prior || { ...payload.draft, createdAt: new Date().toISOString() } };
    }
    // Do not clear the queued entry until BOTH local records and the session checkpoint succeed.
    if (!saveData("catalog", mergeRecord(loadData("catalog", latest.catalog), result.item)) ||
        !saveData("listings", mergeRecord(loadData("listings", latest.listings), result.listing))) {
      throw new Error("Local storage is full. The queued card and stable draft ID have been retained.");
    }
    latest.setCatalog((previous) => mergeRecord(previous, result.item));
    latest.setListings((previous) => mergeRecord(previous, result.listing));
    return result;
  }

  return {
    ...snapshot, data, feeRate: getFeeRate("ebay"), patch,
    reload: () => report(store.reload()),
    capture: (images) => report(store.run("Saving photos", () => addCapture(images))),
    importPhotos: (files, paired) => report(store.run("Importing photos", async () => {
      if (paired && files.length % 2) throw new Error("Front/back pairs require an even number of photos in front, back order");
      if (files.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024)) throw new Error("Use JPEG, PNG or WebP photos up to 8 MB each");
      for (let index = 0; index < files.length; index += paired ? 2 : 1) {
        await addCapture({ front: await fileData(files[index]), back: paired ? await fileData(files[index + 1]) : null });
      }
      current.current.toast.success("Photos saved in your selling batch");
    })),
    addManual: () => edit((session) => ({ ...session, entries: [...session.entries, { ...newDraftEntry({ id: crypto.randomUUID(), defaults: session.defaults }), selected: true }] })),
    addInventory: (ids) => edit((session) => {
      const entries = [...session.entries];
      for (const id of ids) {
        const card = current.current.data.catalog.find((item) => item.id === id);
        if (!card || inventoryBlockedReason(card, current.current.data.listings, entries)) continue;
        entries.push({ ...newDraftEntry({ id: crypto.randomUUID(), card, source: "inventory", defaults: session.defaults }), selected: true });
      }
      return { ...session, entries };
    }),
    updateCard: (entry, field, value) => edit((session) => ({ ...session, entries: session.entries.map((row) => row.id === entry.id && row.stage !== "saved" && row.source !== "inventory" ? {
      ...row, card: { ...row.card, [field]: value }, error: null,
      ...(field === "condition" ? { conditionConfirmed: false } : { identityConfirmed: false }),
    } : row) })),
    replacePhoto: (entry, side, image) => report(store.run("Saving photo", async () => {
      if (entry.source === "inventory") throw new Error("Edit inventory photos in Collection, then select the card again");
      const imageId = `img_${entry.itemId}_${side}_${crypto.randomUUID().slice(0, 8)}`;
      if (typeof image !== "string") {
        if (!["image/jpeg", "image/png", "image/webp"].includes(image.type) || image.size > 8 * 1024 * 1024) throw new Error("Use a JPEG, PNG or WebP photo up to 8 MB");
        image = await fileData(image);
      }
      await saveImage(imageId, await prepareImageForAi(image));
      await store.mutate((session) => ({ ...session, entries: session.entries.map((row) => row.id === entry.id ? { ...row, [`${side}ImgId`]: imageId, identityConfirmed: false, conditionConfirmed: false } : row) }));
    })),
    identify: (id) => report(store.run("Identifying selected photos", async () => {
      const work = store.getSnapshot().session.entries.filter((entry) => entry.stage !== "saved" && entry.source === "photo" && (id ? entry.id === id : entry.selected && !entry.card.name));
      for (const entry of work) {
        try {
          const image = await loadImage(entry.frontImgId);
          if (!image) throw new Error("Front photo unavailable; add it again");
          const response = await aiVisualSearch(image);
          await store.mutate((session) => ({ ...session, entries: session.entries.map((row) => row.id === entry.id ? applyDraftIdentification(row, response) : row) }));
        } catch (error) {
          if (store.getSnapshot().error) throw error;
          await store.mutate((session) => ({ ...session, entries: session.entries.map((row) => row.id === entry.id ? { ...row, error: error.message } : row) }));
        }
      }
    })),
    changeDefaults: (updates) => edit((session) => ({ ...session, defaults: { ...session.defaults, ...updates } })),
    applyDefaults: () => edit((session) => ({ ...session, entries: session.entries.map((entry) => entry.selected && entry.stage !== "saved" ? {
      ...entry, ...session.defaults, storageLocation: entry.source === "inventory" ? entry.storageLocation : session.defaults.storageLocation,
    } : entry) })),
    savePreset: (name) => edit((session) => {
      if (!name.trim()) throw new Error("Name the selling preset");
      return { ...session, presets: [...session.presets.filter((preset) => preset.name !== name.trim()), { name: name.trim().slice(0, 80), defaults: { ...session.defaults } }] };
    }),
    inspectSelected: (condition) => edit((session) => ({ ...session, entries: session.entries.map((entry) => entry.selected && entry.stage !== "saved" && entry.source === "photo" ? { ...entry, card: { ...entry.card, condition }, conditionConfirmed: Boolean(condition) } : entry) })),
    selectAll: (selected) => edit((session) => ({ ...session, entries: session.entries.map((entry) => entry.stage === "saved" ? entry : { ...entry, selected }) })),
    remove: (id) => edit((session) => ({ ...session, entries: session.entries.filter((entry) => entry.id !== id) })),
    clearFinished: () => edit((session) => ({ ...session, entries: session.entries.filter((entry) => entry.stage !== "saved") })),
    saveSelected: () => report(store.run("Saving reviewed drafts", async () => {
      const session = store.getSnapshot().session;
      const summary = await saveDraftSelection({
        entries: session.entries, batchId: session.id, feeRate: current.current.feeRate,
        persist: persistDraft,
        onSaved: (entry, result) => store.mutate((value) => ({ ...value, entries: value.entries.map((row) => row.id === entry.id ? {
          ...row, stage: "saved", selected: false, error: null, savedListing: result.listing,
        } : row) })),
        onError: (entry, error) => store.mutate((value) => ({ ...value, entries: value.entries.map((row) => row.id === entry.id ? { ...row, error: error.message } : row) })),
      });
      current.current.toast.info(`${summary.savedIds.length} drafts saved; ${summary.failedIds.length} failed; ${summary.skippedIds.length} still need review. Nothing was published.`);
      return summary;
    })),
    readiness: (entry) => draftReadiness(entry, getFeeRate("ebay")),
  };
}
