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
import { loadData, saveData, saveImage } from "../lib/storage";
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

function buildSavedCard({ id, card, frontImgId, backImgId, frontImgPhash, gradingData, cvResult, priceEst, priceHistory }) {
  return {
    id, ...card,
    costBasis: parseFloat(card.costBasis) || 0,
    frontImgId, backImgId, frontImgPhash: frontImgPhash || null,
    priceEstimate: priceEst, priceHistory,
    binder: card.binder || "", status: card.status || "inventory", listedOn: card.listedOn || [],
    ...(gradingData ? {
      centering: gradingData.centering, corners: gradingData.corners,
      edges: gradingData.edges, surface: gradingData.surface,
      projected_grade: gradingData.projected_grade, vault_status: gradingData.vault_status,
      condition_report: gradingData.condition_report,
    } : {}),
    ...(cvResult?.centering ? {
      cv_centering_lr: cvResult.centering.lr, cv_centering_tb: cvResult.centering.tb,
      cv_centering_score: cvResult.centering.score, cv_processed: 1,
    } : {}),
    createdAt: new Date().toISOString(),
  };
}

function buildListingRecord({ card, entry, listing }) {
  return {
    id: uid(), cardId: entry.id, cardName: card.name, set: card.set, number: card.number,
    cardSet: card.set, cardNumber: card.number,
    listingTitle: listing.title, listingDescription: listing.description,
    platform: listing.platform, format: "fixed", startPrice: parseFloat(listing.price),
    buyNowPrice: null, auctionEndDate: null, shipping: parseFloat(listing.shipping) || 0,
    currentBid: null, status: "draft", publishStatus: "draft", notes: "", createdAt: new Date().toISOString(),
  };
}

export function useScanWorkflow() {
  const toast = useToast();
  const { catalog, setCatalog, setListings, useServer } = useData();
  const [step, setStep] = useState(0);
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
  const savingRef = useRef(false);
  const listingSubmissionRef = useRef(false);
  const listingDraftRef = useRef(null);
  const frontCaptureRef = useRef(0);
  const backCaptureRef = useRef(0);
  const [cvAnalyzing, setCvAnalyzing] = useState(false);
  const [cvResult, setCvResult] = useState(null);
  const [showCvOverlay, setShowCvOverlay] = useState(true);
  const [visualSearching, setVisualSearching] = useState(false);
  const [visualSearchResult, setVisualSearchResult] = useState(null);
  const [identificationResult, setIdentificationResult] = useState(null);

  useEffect(() => { checkCvHealth().then(setCvOnline); }, []);
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
      if (side === "front" && analysis.centering) setCvResult(analysis);
      if (analysis.warped_image && Number(analysis.warp_quality || 0) >= 0.5) return analysis.warped_image;
      return dataUrl;
    } catch { return dataUrl; }
  }

  async function captureFrontImg(dataUrl) {
    frontCaptureRef.current += 1;
    const captureId = frontCaptureRef.current;
    if (!dataUrl) {
      setFrontImg(null); setCvResult(null); setDuplicateWarning(null);
      return;
    }
    setFrontImg(dataUrl);
    const processed = await processCapturedImage(dataUrl, "front");
    if (captureId !== frontCaptureRef.current) return;
    if (processed && processed !== dataUrl) setFrontImg(processed);
    const phash = await computeDHash(processed || dataUrl);
    if (captureId !== frontCaptureRef.current) return;
    setDuplicateWarning(findLikelyDuplicate(catalog, phash));
  }

  function dismissDuplicateWarning() {
    setDuplicateWarning((warning) => warning ? { ...warning, dismissed: true } : null);
  }
  function dismissIdentificationResult() {
    setIdentificationResult((result) => result ? { ...result, dismissed: true } : null);
  }

  async function applyIdentificationCorrection(candidate) {
    const result = identificationResult;
    if (!result?.itemId || !candidate?.card?.id) return;
    try {
      await identificationAPI.correct({
        identificationResultId: result.id, correctedCatalogCardId: candidate.card.id, reason: "scan_correction_picker",
      });
    } catch { /* learning is non-critical; still fix the item locally */ }
    const patch = catalogCardToItemPatch(candidate.card);
    setCatalog((previous) => previous.map((item) => item.id === result.itemId ? { ...item, ...patch } : item));
    if (scanItemRef.current === result.itemId) setCard((previous) => ({ ...previous, ...patch }));
    toast.success(`Corrected to ${describeCatalogCard(candidate.card)?.label || "selected card"}`);
    dismissIdentificationResult();
  }

  async function captureBackImg(dataUrl) {
    backCaptureRef.current += 1;
    const captureId = backCaptureRef.current;
    if (!dataUrl) { setBackImg(null); return; }
    setBackImg(dataUrl);
    const processed = await processCapturedImage(dataUrl, "back");
    if (captureId !== backCaptureRef.current) return;
    if (processed && processed !== dataUrl) setBackImg(processed);
  }

  async function doCvAnalyze() {
    if (!frontImg) return;
    setCvAnalyzing(true);
    setStatus("CV analyzing…");
    const result = await analyzeCentering(frontImg);
    if (result?.card_detected) {
      setCvResult(result);
      setStatus(`CV: ${result.centering.lr} L/R, ${result.centering.tb} T/B (${result.processing_ms}ms)`);
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
        ...previous, name: previous.name || response.name, set: previous.set || response.set,
        year: previous.year || response.year, number: previous.number || response.number,
        rarity: previous.rarity || response.rarity, parallel: previous.parallel || response.parallel || "",
        type: response.type || previous.type,
      }));
      setSearchQ([response.name, response.set, response.number && `#${response.number}`].filter(Boolean).join(" "));
      if (response.results?.length > 0) setResults(response.results);
      if (response.priceEstimate) setPriceEst({ ...response.priceEstimate, evidence: "ai_estimate_unverified", results: response.results || [] });
      if (response.priceHistory?.length > 0) setPriceHistory(response.priceHistory);
      setStatus(`✓ ${response.name} - ${response.results?.length || 0} source results; AI estimate, verify before listing (${response.confidence})`);
      setStep(1);
    } else {
      setStatus("Visual search failed - try AI Identify or search manually");
      toast.error("Couldn't identify card from photo");
    }
    setVisualSearching(false);
  }

  async function doSearch() {
    if (!searchQ.trim()) return;
    setSearching(true); setResults([]); setStatus("Searching…");
    const data = await aiPrice(searchQ);
    if (data) {
      setResults(data.results || []);
      setPriceEst({ ...(data.priceEstimate || {}), evidence: "ai_estimate_unverified", results: data.results || [] });
      setPriceHistory(data.priceHistory || []);
      if (data.cardInfo) {
        setCard((previous) => ({
          ...previous, name: previous.name || data.cardName || "", set: previous.set || data.cardInfo.set || "",
          year: previous.year || data.cardInfo.year || "", number: previous.number || data.cardInfo.number || "",
          rarity: previous.rarity || data.cardInfo.rarity || "", type: data.cardInfo.type || previous.type,
        }));
      }
      setStatus(`${(data.results || []).length} source results — AI estimate, verify before listing`);
    } else { setStatus("Search failed"); toast.error("Price search failed"); }
    setSearching(false);
  }

  async function doRecognize() {
    if (!frontImg) return;
    setRecognizing(true); setStatus("Identifying…");
    const response = await aiRecognize(frontImg);
    if (response?.name) {
      setCard((previous) => ({
        ...previous, name: previous.name || response.name, set: previous.set || response.set,
        year: previous.year || response.year, number: previous.number || response.number,
        rarity: previous.rarity || response.rarity, parallel: previous.parallel || response.parallel || "",
        type: response.type || previous.type,
      }));
      setSearchQ([response.name, response.set, response.number && `#${response.number}`].filter(Boolean).join(" "));
      setStatus(`✓ ${response.name} (${response.confidence})`);
    } else { setStatus("Couldn't ID - enter manually"); toast.error("Card recognition failed"); }
    setRecognizing(false);
  }

  async function saveCard() {
    if (savingRef.current) return null;
    savingRef.current = true;
    setSaving(true);
    try {
      const id = scanItemRef.current || uid();
      scanItemRef.current = id;
      let frontImgId = null, backImgId = null, frontImgPhash = null;
      if (frontImg) {
        frontImgId = `img_${id}_front`;
        await saveImage(frontImgId, frontImg);
        if (useServer) await imagesAPI.upload(frontImgId, frontImg);
        frontImgPhash = await computeDHash(frontImg);
        if (frontImgPhash && !duplicateWarning) {
          const duplicate = findLikelyDuplicate(catalog, frontImgPhash);
          if (duplicate && duplicate.card.id !== id) toast.error(`Possible duplicate of ${duplicate.card.name || "existing card"} — saved anyway, review your collection`);
        }
      }
      if (backImg) {
        backImgId = `img_${id}_back`;
        await saveImage(backImgId, backImg);
        if (useServer) await imagesAPI.upload(backImgId, backImg);
      }
      let entry = buildSavedCard({ id, card, frontImgId, backImgId, frontImgPhash, gradingData, cvResult, priceEst, priceHistory });
      if (useServer) entry = { ...entry, ...await itemsAPI.create(entry) };
      const current = loadData("catalog", catalog);
      if (!saveData("catalog", [entry, ...current.filter((item) => item.id !== id)])) throw new Error("Local storage is full. Your scan is still open; retry after freeing space.");
      setCatalog((previous) => [entry, ...previous.filter((item) => item.id !== id)]);
      toast.success(`Saved: ${card.name || "Card"}`);

      // The item exists before identification; learning cannot delay the save.
      const runIdentification = async () => {
        try {
          const idResult = await identificationAPI.identify({ itemId: id, visualSearchResult });
          if (idResult?.result?.id) {
            if (scanItemRef.current === id) {
              setIdentificationResult({ ...idResult.result, itemId: id, candidates: (idResult.candidates || []).slice(0, 6) });
            }
            const verification = idResult.result.finalCatalogCard?.ebayVerification;
            if (verification) {
              const range = verification.priceRange;
              const priceBlurb = range ? ` — active ${range.currency || ""} ${range.low}-${range.high} (median ${range.mid}, n=${range.sampleSize})` : "";
              if (verification.hits === 0) toast.error("eBay verifier: no matches — review before listing");
              else if (verification.hits >= 3) toast.success(`eBay verifier: ${verification.hits} matches${priceBlurb}`);
              else if (range) toast.info(`eBay verifier: ${verification.hits} match${priceBlurb}`);
            }
            if (idResult.result.confidence >= 0.8) {
              await identificationAPI.confirm({ itemId: id, identificationResultId: idResult.result.id, acceptedBy: "auto" });
            }
          }
        } catch { /* Identification is non-critical. */ }
      };
      if (useServer) runIdentification();
      return entry;
    } catch (error) {
      toast.error(`Save failed: ${error.message}`);
      return null;
    } finally { savingRef.current = false; setSaving(false); }
  }

  function reset() {
    frontCaptureRef.current += 1;
    backCaptureRef.current += 1;
    setStep(0); setFrontImg(null); setBackImg(null); setCard({ ...EMPTY_CARD });
    setSearchQ(""); setResults([]); setPriceEst({ low: "", mid: "", high: "" });
    setPriceHistory([]); setListing({ ...EMPTY_LISTING }); setStatus("");
    setShowGrading(false); setGradingData(null); setCvResult(null); setCvAnalyzing(false);
    setVisualSearching(false); setVisualSearchResult(null); setIdentificationResult(null); setDuplicateWarning(null);
    scanItemRef.current = null;
    listingDraftRef.current = null;
  }

  async function copyListing() {
    try {
      await navigator.clipboard.writeText(`${listing.title}\n${fmtShort(listing.price)} CAD + ${fmtShort(listing.shipping)} shipping\n\n${listing.description}`);
      toast.success("Copied");
    } catch { toast.error("Copy failed"); }
  }

  function prepareListing() {
    const condition = condOf(card.condition);
    setListing((previous) => ({
      ...previous,
      title: [card.name, card.set, card.number && `#${card.number}`, `[${condition.s}]`].filter(Boolean).join(" "),
      description: [card.name, card.set && `Set: ${card.set}`, card.rarity && `Rarity: ${card.rarity}`, `Condition: ${condition.l}`, "Ships from Canada. See listing shipping details."].filter(Boolean).join("\n"),
      price: priceEst.mid || "",
    }));
    setStep(3);
  }

  async function saveAndList() {
    if (listingSubmissionRef.current) return;
    if (!Number.isFinite(Number(listing.price)) || Number(listing.price) <= 0) {
      toast.error("Enter a positive listing price. Your scan has not been cleared.");
      return;
    }
    listingSubmissionRef.current = true;
    try {
      const entry = await saveCard();
      if (!entry) return;
      const listingRecord = buildListingRecord({ card, entry, listing });
      if (listingDraftRef.current) listingRecord.id = listingDraftRef.current;
      listingDraftRef.current = listingRecord.id;
      const target = publishTarget;
      setListings((previous) => [listingRecord, ...previous.filter((item) => item.id !== listingRecord.id)]);
      if (target) {
        setPublishing(true);
        const channel = await publishScanListing({ itemsAPI, listingsAPI, marketplacesAPI, item: entry, listingRecord, marketplace: target.marketplace });
        const updated = applyChannelToListing(listingRecord, channel);
        setListings((previous) => previous.map((item) => item.id === listingRecord.id ? updated : item));
        if (updated.status === "active") {
          setCatalog((previous) => previous.map((item) => item.id === entry.id ? { ...item, status: "listed", listedOn: [...new Set([...(item.listedOn || []), listing.platform])] } : item));
        }
        const summary = summarizePublishOutcome(channel, { marketplace: target.marketplace, label: target.label, listingId: listingRecord.id });
        (toast[summary.type] || toast.info)(summary.message);
      } else {
        if (useServer) await listingsAPI.create(listingRecord);
        toast.info("Draft saved — nothing has been published. Publish from Sales after connecting the marketplace.");
      }
      reset();
    } catch (error) {
      setListings((previous) => previous.map((item) => item.id === listingDraftRef.current ? { ...item, publishStatus: "needs_review", publishError: error.message } : item));
      toast.error(`Draft retained — ${error.message}. Check marketplace status before retrying a timed-out publish.`);
    } finally { listingSubmissionRef.current = false; setPublishing(false); }
  }

  function clearFrontImg(value) { if (!value) frontCaptureRef.current += 1; setFrontImg(value); }
  function clearBackImg(value) { if (!value) backCaptureRef.current += 1; setBackImg(value); }

  return {
    actions: {
      copyListing, doCvAnalyze, doRecognize, doSearch, doVisualSearch, prepareListing, reset,
      saveAndList, saveCard, captureFrontImg, captureBackImg, applyIdentificationCorrection,
      dismissDuplicateWarning, dismissIdentificationResult, setBackImg: clearBackImg,
      setCard, setFrontImg: clearFrontImg, setGradingData, setListing, setSearchQ,
      setShowCvOverlay, setShowGrading, setStep,
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
      backImg, card, cvAnalyzing, cvOnline, cvResult, duplicateWarning, frontImg,
      gradingData, listing, priceEst, priceHistory, publishing, publishTarget,
      recognizing, results, saving, searchQ, searching, showCvOverlay,
      showGrading, status, step, visualSearching, identificationResult,
    },
  };
}
