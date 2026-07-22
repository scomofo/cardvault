import { useEffect, useRef, useState } from "react";
import { useToast } from "../components/Toast";
import { useData } from "../lib/DataContext";
import { EMPTY_CARD, EMPTY_LISTING } from "../lib/constants";
import { aiPrice, aiRecognize, aiVisualSearch } from "../lib/ai";
import { identificationAPI, imagesAPI, itemsAPI, listingsAPI, marketplacesAPI } from "../lib/api";
import { apiPath } from "../lib/apiBase";
import { analyzeCentering, checkCvHealth } from "../lib/cvApi";
import {
  applyChannelToListing,
  getPublishTarget,
  publishScanListing,
  summarizePublishOutcome,
} from "../lib/scanPublish";
import { findLikelyDuplicate } from "../lib/duplicateDetection";
import { catalogCardToItemPatch, describeCatalogCard } from "../lib/identificationDisplay";
import { computeDHash } from "../lib/phash";
import { saveImage } from "../lib/storage";
import { condOf, fmtShort, uid } from "../lib/utils";

const MIN_CAPTURE_SHORT_EDGE = 600;
const CV_DETECTION_THRESHOLD = 0.6;

function readImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = dataUrl;
  });
}

function buildSavedCard({
  id,
  card,
  frontImgId,
  backImgId,
  frontImgPhash,
  gradingData,
  cvResult,
  priceEst,
  priceHistory,
}) {
  return {
    id,
    ...card,
    costBasis: parseFloat(card.costBasis) || 0,
    frontImgId,
    backImgId,
    frontImgPhash: frontImgPhash || null,
    priceEstimate: priceEst,
    priceHistory,
    binder: card.binder || "",
    status: card.status || "inventory",
    listedOn: card.listedOn || [],
    ...(gradingData
      ? {
          centering: gradingData.centering,
          corners: gradingData.corners,
          edges: gradingData.edges,
          surface: gradingData.surface,
          projected_grade: gradingData.projected_grade,
          vault_status: gradingData.vault_status,
          condition_report: gradingData.condition_report,
        }
      : {}),
    ...(cvResult?.centering
      ? {
          cv_centering_lr: cvResult.centering.lr,
          cv_centering_tb: cvResult.centering.tb,
          cv_centering_score: cvResult.centering.score,
          cv_processed: 1,
        }
      : {}),
    createdAt: new Date().toISOString(),
  };
}

function buildListingRecord({ card, entry, listing }) {
  return {
    id: uid(),
    cardId: entry.id,
    cardName: card.name,
    set: card.set,
    number: card.number,
    // Server-persisted aliases + marketplace content (listing_title drives a live eBay publish).
    cardSet: card.set,
    cardNumber: card.number,
    listingTitle: listing.title,
    listingDescription: listing.description,
    platform: listing.platform,
    format: "fixed",
    startPrice: parseFloat(listing.price),
    buyNowPrice: null,
    auctionEndDate: null,
    shipping: parseFloat(listing.shipping) || 0,
    currentBid: null,
    status: "active",
    notes: "",
    createdAt: new Date().toISOString(),
  };
}

export function useScanWorkflow() {
  const toast = useToast();
  const { catalog, setCatalog, setListings, useServer } = useData();

  const [step, setStep] = useState(0);
  const [batchMode, setBatchMode] = useState(null); // null | "capture" | "process"
  const [batchQueue, setBatchQueue] = useState([]);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProcessedCount, setBatchProcessedCount] = useState(0);
  const [frontImg, setFrontImg] = useState(null);
  const [backImg, setBackImg] = useState(null);
  const [card, setCard] = useState({ ...EMPTY_CARD });
  const [searchQ, setSearchQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [status, setStatus] = useState("");
  const [priceEst, setPriceEst] = useState({ low: "", mid: "", high: "" });
  const [priceHistory, setPriceHistory] = useState([]);
  const [listing, setListing] = useState({ ...EMPTY_LISTING });
  const [showGrading, setShowGrading] = useState(false);
  const [gradingData, setGradingData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [ebayConnected, setEbayConnected] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [cvOnline, setCvOnline] = useState(false);
  const scanItemRef = useRef(null);
  const [cvAnalyzing, setCvAnalyzing] = useState(false);
  const [cvResult, setCvResult] = useState(null);
  const [showCvOverlay, setShowCvOverlay] = useState(true);
  const [visualSearching, setVisualSearching] = useState(false);
  const [visualSearchResult, setVisualSearchResult] = useState(null);
  const [identificationResult, setIdentificationResult] = useState(null);

  useEffect(() => {
    checkCvHealth().then(setCvOnline);
  }, []);

  useEffect(() => {
    fetch(apiPath("/ebay/status"))
      .then((response) => (response.ok ? response.json() : null))
      .then((status) => setEbayConnected(Boolean(status?.connected)))
      .catch(() => setEbayConnected(false));
  }, []);

  const publishTarget = getPublishTarget(listing.platform, { useServer, ebayConnected });

  async function processCapturedImage(dataUrl, side) {
    if (!dataUrl) return null;
    const { width, height } = await readImageDimensions(dataUrl);
    const shortEdge = Math.min(width, height);
    if (shortEdge && shortEdge < MIN_CAPTURE_SHORT_EDGE) {
      toast.error(`${side} photo is low-res (${shortEdge}px) — move closer or use a better camera`);
    }

    if (!cvOnline) return dataUrl;

    try {
      const analysis = await analyzeCentering(dataUrl);
      if (!analysis || !analysis.card_detected) {
        toast.error(`Couldn't detect card edges in ${side} photo — try a darker background`);
        return dataUrl;
      }
      if (Number(analysis.detection_confidence || 0) < CV_DETECTION_THRESHOLD) {
        toast.error(`${side} card detection low (${Math.round((analysis.detection_confidence || 0) * 100)}%) — consider retaking`);
      }
      if (side === "front" && analysis.centering) {
        setCvResult(analysis);
      }
      if (analysis.warped_image && Number(analysis.warp_quality || 0) >= 0.5) {
        return analysis.warped_image;
      }
      return dataUrl;
    } catch {
      return dataUrl;
    }
  }

  async function captureFrontImg(dataUrl) {
    if (!dataUrl) {
      setFrontImg(null);
      setCvResult(null);
      setDuplicateWarning(null);
      return;
    }
    setFrontImg(dataUrl);
    const processed = await processCapturedImage(dataUrl, "front");
    if (processed && processed !== dataUrl) setFrontImg(processed);
    // Warn about a likely duplicate NOW, before the user invests in
    // identify/price/list work — not after save.
    const phash = await computeDHash(processed || dataUrl);
    setDuplicateWarning(findLikelyDuplicate(catalog, phash));
  }

  function dismissDuplicateWarning() {
    setDuplicateWarning((warning) => (warning ? { ...warning, dismissed: true } : null));
  }

  function dismissIdentificationResult() {
    setIdentificationResult((result) => (result ? { ...result, dismissed: true } : null));
  }

  // User picked a different candidate: record the correction for the learning
  // loop and fix the saved item's fields (plus the open form when still on
  // this card's scan session).
  async function applyIdentificationCorrection(candidate) {
    const result = identificationResult;
    if (!result?.itemId || !candidate?.card?.id) return;
    try {
      await identificationAPI.correct({
        identificationResultId: result.id,
        correctedCatalogCardId: candidate.card.id,
        reason: "scan_correction_picker",
      });
    } catch { /* learning is non-critical; still fix the item locally */ }
    const patch = catalogCardToItemPatch(candidate.card);
    setCatalog((previous) =>
      previous.map((item) => (item.id === result.itemId ? { ...item, ...patch } : item)),
    );
    if (scanItemRef.current === result.itemId) {
      setCard((previous) => ({ ...previous, ...patch }));
    }
    toast.success(`Corrected to ${describeCatalogCard(candidate.card)?.label || "selected card"}`);
    dismissIdentificationResult();
  }

  async function captureBackImg(dataUrl) {
    if (!dataUrl) {
      setBackImg(null);
      return;
    }
    setBackImg(dataUrl);
    const processed = await processCapturedImage(dataUrl, "back");
    if (processed && processed !== dataUrl) setBackImg(processed);
  }

  async function doCvAnalyze() {
    if (!frontImg) return;
    setCvAnalyzing(true);
    setStatus("CV analyzing…");
    const result = await analyzeCentering(frontImg);
    if (result?.card_detected) {
      setCvResult(result);
      setStatus(
        `CV: ${result.centering.lr} L/R, ${result.centering.tb} T/B (${result.processing_ms}ms)`,
      );
    } else {
      setStatus(result?.error || "CV: Card not detected");
      toast.error("Card edges not found - try a darker background");
    }
    setCvAnalyzing(false);
  }

  async function doVisualSearch() {
    if (!frontImg) return;
    setVisualSearching(true);
    setStatus("Visual search… identifying + pricing from photo");
    const response = await aiVisualSearch(frontImg);
    if (response?.name) {
      setVisualSearchResult(response);
      setCard((previous) => ({
        ...previous,
        name: response.name,
        set: response.set || previous.set,
        year: response.year || previous.year,
        number: response.number || previous.number,
        rarity: response.rarity || previous.rarity,
        parallel: response.parallel || "",
        type: response.type || previous.type,
      }));
      setSearchQ(
        [response.name, response.set, response.number && `#${response.number}`]
          .filter(Boolean)
          .join(" "),
      );
      if (response.results?.length > 0) setResults(response.results);
      if (response.priceEstimate) setPriceEst(response.priceEstimate);
      if (response.priceHistory?.length > 0) {
        setPriceHistory(response.priceHistory);
      }
      setStatus(
        `✓ ${response.name} - ${response.results?.length || 0} comps found (${response.confidence})`,
      );
      setStep(1);
    } else {
      setStatus("Visual search failed - try AI Identify or search manually");
      toast.error("Couldn't identify card from photo");
    }
    setVisualSearching(false);
  }

  async function doSearch() {
    if (!searchQ.trim()) return;
    setSearching(true);
    setResults([]);
    setStatus("Searching…");
    const data = await aiPrice(searchQ);
    if (data) {
      setResults(data.results || []);
      setPriceEst(data.priceEstimate || {});
      setPriceHistory(data.priceHistory || []);
      if (data.cardInfo) {
        setCard((previous) => ({
          ...previous,
          name: previous.name || data.cardName || "",
          set: previous.set || data.cardInfo.set || "",
          year: previous.year || data.cardInfo.year || "",
          number: previous.number || data.cardInfo.number || "",
          rarity: previous.rarity || data.cardInfo.rarity || "",
          type: data.cardInfo.type || previous.type,
        }));
      }
      setStatus(`${(data.results || []).length} results`);
    } else {
      setStatus("Search failed");
      toast.error("Price search failed");
    }
    setSearching(false);
  }

  async function doRecognize() {
    if (!frontImg) return;
    setRecognizing(true);
    setStatus("Identifying…");
    const response = await aiRecognize(frontImg);
    if (response?.name) {
      setCard((previous) => ({
        ...previous,
        name: response.name,
        set: response.set || previous.set,
        year: response.year || previous.year,
        number: response.number || previous.number,
        rarity: response.rarity || previous.rarity,
        parallel: response.parallel || "",
        type: response.type || previous.type,
      }));
      setSearchQ(
        [response.name, response.set, response.number && `#${response.number}`]
          .filter(Boolean)
          .join(" "),
      );
      setStatus(`✓ ${response.name} (${response.confidence})`);
    } else {
      setStatus("Couldn't ID - enter manually");
      toast.error("Card recognition failed");
    }
    setRecognizing(false);
  }

  async function saveCard() {
    if (saving) return null;
    setSaving(true);
    try {
      const id = uid();
      scanItemRef.current = id;
      let frontImgId = null;
      let backImgId = null;
      let frontImgPhash = null;

      if (frontImg) {
        frontImgId = `img_${id}_front`;
        await saveImage(frontImgId, frontImg);
        // Mirror to the server so a live eBay publish can attach photos.
        if (useServer) await imagesAPI.upload(frontImgId, frontImg).catch(() => {});
        frontImgPhash = await computeDHash(frontImg);
        // The capture-time banner already surfaced any likely duplicate;
        // only fall back to a toast when the check never ran (e.g. a
        // direct step jump with a pre-set image).
        if (frontImgPhash && !duplicateWarning) {
          const duplicate = findLikelyDuplicate(catalog, frontImgPhash);
          if (duplicate) {
            toast.error(`Possible duplicate of ${duplicate.card.name || "existing card"} — saved anyway, review your collection`);
          }
        }
      }

      if (backImg) {
        backImgId = `img_${id}_back`;
        await saveImage(backImgId, backImg);
        if (useServer) await imagesAPI.upload(backImgId, backImg).catch(() => {});
      }

      const entry = buildSavedCard({
        id,
        card,
        frontImgId,
        backImgId,
        frontImgPhash,
        gradingData,
        cvResult,
        priceEst,
        priceHistory,
      });

      setCatalog((previous) => [entry, ...previous]);
      toast.success(`Saved: ${card.name || "Card"}`);

      // Server-side identification + learning (fire-and-forget, but
      // deterministic: item creates are idempotent upserts, so persist the
      // item first instead of racing the debounced sync on a timer).
      const runIdentification = async () => {
        try {
          await itemsAPI.create(entry);
          const idResult = await identificationAPI.identify({ itemId: id, visualSearchResult });
          if (idResult?.result?.id) {
            // Only surface the panel if the user is still on this card's scan.
            if (scanItemRef.current === id) {
              setIdentificationResult({
                ...idResult.result,
                itemId: id,
                candidates: (idResult.candidates || []).slice(0, 6),
              });
            }
            const verification = idResult.result.finalCatalogCard?.ebayVerification;
            if (verification) {
              const range = verification.priceRange;
              const priceBlurb = range
                ? ` — active ${range.currency || ""} ${range.low}-${range.high} (median ${range.mid}, n=${range.sampleSize})`
                : "";
              if (verification.hits === 0) {
                toast.error(`eBay verifier: no matches — review before listing`);
              } else if (verification.hits >= 3) {
                toast.success(`eBay verifier: ${verification.hits} matches${priceBlurb}`);
              } else if (range) {
                toast.info(`eBay verifier: ${verification.hits} match${priceBlurb}`);
              }
            }
            // Auto-confirm if high confidence match
            if (idResult.result.confidence >= 0.8) {
              await identificationAPI.confirm({
                itemId: id,
                identificationResultId: idResult.result.id,
                acceptedBy: "auto",
              });
            }
          }
        } catch {
          // Identification is non-critical — don't block the save flow
        }
      };
      if (useServer) runIdentification();

      return entry;
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setStep(0);
    setFrontImg(null);
    setBackImg(null);
    setCard({ ...EMPTY_CARD });
    setSearchQ("");
    setResults([]);
    setPriceEst({ low: "", mid: "", high: "" });
    setPriceHistory([]);
    setListing({ ...EMPTY_LISTING });
    setStatus("");
    setShowGrading(false);
    setGradingData(null);
    setCvResult(null);
    setCvAnalyzing(false);
    setVisualSearching(false);
    setVisualSearchResult(null);
    setIdentificationResult(null);
    setDuplicateWarning(null);
    scanItemRef.current = null;
  }

  async function copyListing() {
    try {
      await navigator.clipboard.writeText(
        `${listing.title}\n${fmtShort(listing.price)} CAD + ${fmtShort(listing.shipping)} shipping\n\n${listing.description}`,
      );
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  function prepareListing() {
    const condition = condOf(card.condition);
    setListing((previous) => ({
      ...previous,
      title: [
        card.name,
        card.set,
        card.number && `#${card.number}`,
        `[${condition.s}]`,
      ]
        .filter(Boolean)
        .join(" "),
      description: [
        card.name,
        card.set && `Set: ${card.set}`,
        card.rarity && `Rarity: ${card.rarity}`,
        `Condition: ${condition.l}`,
        "Ships tracked from Canada",
      ]
        .filter(Boolean)
        .join("\n"),
      price: priceEst.mid || "",
    }));
    setStep(3);
  }

  async function saveAndList() {
    const entry = await saveCard();
    if (entry && listing.price) {
      const listingRecord = buildListingRecord({ card, entry, listing });
      const target = publishTarget;
      setListings((previous) => [listingRecord, ...previous]);
      setCatalog((previous) =>
        previous.map((item) =>
          item.id === entry.id
            ? { ...item, status: "listed", listedOn: [listing.platform] }
            : item,
        ),
      );
      if (target) {
        setPublishing(true);
        try {
          const channel = await publishScanListing({
            itemsAPI,
            listingsAPI,
            marketplacesAPI,
            item: entry,
            listingRecord,
            marketplace: target.marketplace,
          });
          setListings((previous) =>
            previous.map((item) =>
              item.id === listingRecord.id ? applyChannelToListing(item, channel) : item,
            ),
          );
          const summary = summarizePublishOutcome(channel, {
            marketplace: target.marketplace,
            label: target.label,
            listingId: listingRecord.id,
          });
          (toast[summary.type] || toast.info)(summary.message);
        } catch (error) {
          toast.error(
            `Saved locally — publish to ${target.label} failed: ${error.message}. Retry from the Sales tab.`,
          );
        } finally {
          setPublishing(false);
        }
      } else {
        toast.success(`Listed on ${listing.platform} for ${fmtShort(listing.price)} (tracked locally)`);
      }
    }
    reset();
  }


  function addToBatchQueue({ front, back }) {
    setBatchQueue((prev) => [...prev, { id: crypto.randomUUID(), front, back, status: "captured", result: null, error: null }]);
  }

  async function processBatchQueue() {
    setBatchProcessing(true);
    setBatchProcessedCount(0);
    const currentQueue = [...batchQueue];
    for (let i = 0; i < currentQueue.length; i++) {
      const item = currentQueue[i];
      setBatchQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "processing" } : q));
      try {
        const response = await aiVisualSearch(item.front);
        if (response && response.name) {
          const confidence = response.confidence === "high" ? 0.9 : response.confidence === "medium" ? 0.7 : 0.4;
          const result = {
            name: response.name, set: response.set || "", number: response.number || "",
            year: response.year || "", rarity: response.rarity || "",
            priceEstimate: response.priceEstimate || { low: 0, mid: 0, high: 0 },
            priceHistory: response.priceHistory || [],
            confidence, type: response.type || "sports",
          };
          const status = confidence >= 0.7 ? "done" : "review";
          setBatchQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status, result } : q));
        } else {
          setBatchQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "failed", error: "Could not identify" } : q));
        }
      } catch (e) {
        setBatchQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "failed", error: e.message } : q));
      }
      setBatchProcessedCount(i + 1);
    }
    setBatchProcessing(false);
  }

  async function saveBatchCards() {
    const saveable = batchQueue.filter((q) => q.status === "done" || q.status === "approved");
    const entries = [];
    for (const item of saveable) {
      const entryId = crypto.randomUUID();
      const frontImgId = item.front ? `img_${entryId}_front` : null;
      const backImgId = item.back ? `img_${entryId}_back` : null;
      if (frontImgId) {
        await saveImage(frontImgId, item.front);
        if (useServer) await imagesAPI.upload(frontImgId, item.front).catch(() => {});
      }
      if (backImgId) {
        await saveImage(backImgId, item.back);
        if (useServer) await imagesAPI.upload(backImgId, item.back).catch(() => {});
      }
      entries.push({
        id: entryId,
        name: item.result.name, set: item.result.set, number: item.result.number,
        year: item.result.year, rarity: item.result.rarity, condition: "NM",
        binder: "", type: item.result.type || "sports", status: "inventory",
        costBasis: 0, frontImgId, backImgId,
        priceEstimate: item.result.priceEstimate, priceHistory: item.result.priceHistory,
        listedOn: [], createdAt: new Date().toISOString(),
      });
    }
    setCatalog((prev) => [...entries, ...prev]);
    toast.success(entries.length + " cards saved to collection");
    setBatchQueue([]);
    setBatchMode(null);
    setBatchProcessedCount(0);
  }

  function retryBatchItem(id) {
    setBatchQueue((prev) => prev.map((q) => q.id === id ? { ...q, status: "captured", result: null, error: null } : q));
  }

  function removeBatchItem(id) {
    setBatchQueue((prev) => prev.filter((q) => q.id !== id));
  }
  return {
    actions: {
      copyListing,
      doCvAnalyze,
      doRecognize,
      doSearch,
      doVisualSearch,
      prepareListing,
      reset,
      setBatchMode,
      addToBatchQueue,
      processBatchQueue,
      saveBatchCards,
      retryBatchItem,
      removeBatchItem,
      saveAndList,
      saveCard,
      captureFrontImg,
      captureBackImg,
      applyIdentificationCorrection,
      dismissDuplicateWarning,
      dismissIdentificationResult,
      setBackImg,
      setCard,
      setFrontImg,
      setGradingData,
      setListing,
      setSearchQ,
      setShowCvOverlay,
      setShowGrading,
      setStep,
      confirmIdentification: async (itemId, resultId) => {
        try {
          await identificationAPI.confirm({ itemId, identificationResultId: resultId, acceptedBy: "user" });
          toast.success("Identification confirmed for learning");
        } catch { /* non-critical */ }
      },
      correctIdentification: async (resultId, correctedCardId, reason) => {
        try {
          await identificationAPI.correct({ identificationResultId: resultId, correctedCatalogCardId: correctedCardId, reason });
          toast.success("Correction recorded for learning");
        } catch { /* non-critical */ }
      },
    },
    state: {
      backImg,
      card,
      cvAnalyzing,
      cvOnline,
      cvResult,
      duplicateWarning,
      frontImg,
      gradingData,
      listing,
      priceEst,
      priceHistory,
      publishing,
      publishTarget,
      recognizing,
      results,
      saving,
      searchQ,
      searching,
      showCvOverlay,
      showGrading,
      status,
      step,
      visualSearching,
      identificationResult,
      batchMode,
      batchQueue,
      batchProcessing,
      batchProcessedCount,
    },
  };
}
