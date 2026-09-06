import { useEffect, useState } from "react";
import ScanCaptureStep from "./scan/ScanCaptureStep";
import ScanDetailsStep from "./scan/ScanDetailsStep";
import ScanIdentifyStep from "./scan/ScanIdentifyStep";
import ScanListingStep from "./scan/ScanListingStep";
import ScanStepper from "./scan/ScanStepper";
import { useFeeModels } from "../hooks/useFeeModels";
import { useScanWorkflow } from "../hooks/useScanWorkflow";
import { describeCatalogCard } from "../lib/identificationDisplay";

function IdentificationBanner({ result, actions }) {
  const [showAlternatives, setShowAlternatives] = useState(false);
  const match = describeCatalogCard(result.finalCatalogCard);
  const alternatives = (result.candidates || []).filter(
    (candidate) => candidate?.card?.id && candidate.card.id !== result.finalCatalogCardId,
  );

  return (
    <div className="card mb-12" style={{ borderColor: "var(--acc-brd)" }}>
      <div className="lbl" style={{ margin: 0 }}>
        Server Identification — {Math.round((result.confidence || 0) * 100)}%
        {result.confidence >= 0.8 ? " (auto-confirmed)" : ""}
      </div>
      {match ? (
        <div className="text-xs mt-4"><strong>{match.label}</strong></div>
      ) : (
        <div className="text-xs mt-4">No confident catalog match — review before listing</div>
      )}
      {result.explanation && (
        <div className="text-xxs text-dim mt-4">{result.explanation}</div>
      )}
      <div className="flex gap-8 mt-8 flex-wrap">
        {result.confidence < 0.8 && result.finalCatalogCard && (
          <button
            className="btn btn-outline btn-sm"
            onClick={() => {
              actions.confirmIdentification(result.itemId, result.id);
              actions.dismissIdentificationResult();
            }}
          >
            Confirm match
          </button>
        )}
        {alternatives.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setShowAlternatives((v) => !v)}>
            Not this card?
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={actions.dismissIdentificationResult}>
          Dismiss
        </button>
      </div>
      {showAlternatives && (
        <div className="mt-8">
          <div className="text-xxs text-dim mb-4">Pick the correct card — this fixes the saved entry and teaches the identifier:</div>
          {alternatives.map((candidate) => {
            const described = describeCatalogCard(candidate.card);
            return (
              <button
                key={candidate.card.id}
                className="card-interactive mb-6"
                style={{ width: "100%", textAlign: "left", cursor: "pointer", padding: "8px 12px" }}
                onClick={() => actions.applyIdentificationCorrection(candidate)}
              >
                <span className="text-xs fw-700">{described?.label || "Unknown card"}</span>
                <span className="text-xxs text-dim" style={{ marginLeft: 8 }}>
                  {Math.round((candidate.score || 0) * 100)}%
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ScanView({ onNavigate, pendingImage, onPendingImageConsumed }) {
  const { actions, state } = useScanWorkflow();
  const { getFeeRate } = useFeeModels();

  useEffect(() => {
    if (!pendingImage) return;
    actions.captureFrontImg(pendingImage);
    actions.setStep?.(0);
    onPendingImageConsumed?.();
  }, [pendingImage]);

  const { setCard, setListing, setShowCvOverlay, setShowGrading, setStep } = actions;
  const {
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
  } = state;

  const steps = ["Capture", "Identify", "Details", "List"];

  return (
    <>
      <h1 className="page-title">Scan Card</h1>
      <button className="btn btn-outline btn-full mb-12" onClick={() => onNavigate?.("sell")}>
        Sell a batch — photos to drafts
      </button>
      <ScanStepper step={step} steps={steps} onStepChange={setStep} />

      {duplicateWarning && !duplicateWarning.dismissed && (
        <div className="card mb-12" style={{ borderColor: "var(--acc-solid)" }}>
          <div className="lbl" style={{ margin: 0 }}>Possible Duplicate</div>
          <div className="text-xs mt-4">
            This looks like <strong>{duplicateWarning.card.name || "a card you already own"}</strong>
            {duplicateWarning.card.set
              ? ` (${duplicateWarning.card.set}${duplicateWarning.card.number ? ` #${duplicateWarning.card.number}` : ""})`
              : ""}
            , which is already in your collection.
          </div>
          <div className="flex gap-8 mt-8">
            <button
              className="btn btn-outline btn-sm"
              onClick={() => onNavigate?.({ view: "cards", focus: { type: "card", id: duplicateWarning.card.id } })}
            >
              View existing card
            </button>
            <button className="btn btn-ghost btn-sm" onClick={actions.dismissDuplicateWarning}>
              Scan anyway
            </button>
          </div>
        </div>
      )}

      {identificationResult && !identificationResult.dismissed && (
        <IdentificationBanner result={identificationResult} actions={actions} />
      )}

      {step === 0 && (
        <ScanCaptureStep
          backImg={backImg}
          card={card}
          cvAnalyzing={cvAnalyzing}
          cvOnline={cvOnline}
          frontImg={frontImg}
          onAnalyzeCv={actions.doCvAnalyze}
          onBackCapture={actions.captureBackImg}
          onBackRetake={() => actions.setBackImg(null)}
          onFrontCapture={actions.captureFrontImg}
          onFrontRetake={() => actions.setFrontImg(null)}
          onManualEntry={() => setStep(2)}
          onNext={() => setStep(1)}
          onRecognize={async () => {
            await actions.doRecognize();
            setStep(1);
          }}
          onVisualSearch={actions.doVisualSearch}
          visualSearching={visualSearching}
        />
      )}

      {step === 1 && (
        <ScanIdentifyStep
          backImg={backImg}
          cvResult={cvResult}
          frontImg={frontImg}
          onContinue={() => setStep(2)}
          onRecognize={actions.doRecognize}
          onSearch={actions.doSearch}
          onSearchQChange={actions.setSearchQ}
          onToggleOverlay={() => setShowCvOverlay(!showCvOverlay)}
          priceEst={priceEst}
          priceHistory={priceHistory}
          recognizing={recognizing}
          results={results}
          searchQ={searchQ}
          searching={searching}
          showCvOverlay={showCvOverlay}
          status={status}
        />
      )}

      {step === 2 && (
        <ScanDetailsStep
          card={card}
          cvResult={cvResult}
          gradingData={gradingData}
          onCardChange={(key, value) =>
            setCard((previous) => ({ ...previous, [key]: value }))
          }
          onCostBasisChange={(value) =>
            setCard((previous) => ({ ...previous, costBasis: value }))
          }
          onCreateListing={actions.prepareListing}
          onSave={async () => {
            await actions.saveCard();
            actions.reset();
          }}
          onSaveGrading={(data) => {
            actions.setGradingData(data);
            setShowGrading(false);
          }}
          onToggleGrading={() => setShowGrading(!showGrading)}
          saving={saving}
          showGrading={showGrading}
        />
      )}

      {step === 3 && (
        <ScanListingStep
          listing={listing}
          onCopy={actions.copyListing}
          onListingChange={(key, value) =>
            setListing((previous) => ({ ...previous, [key]: value }))
          }
          onNewCard={actions.reset}
          onSaveAndList={actions.saveAndList}
          onSaveOnly={async () => {
            await actions.saveCard();
            actions.reset();
          }}
          saving={saving}
          publishing={publishing}
          publishTarget={publishTarget}
          costBasis={parseFloat(card.costBasis) || 0}
          feeRate={getFeeRate(listing.platform)}
          comps={results}
          priceEst={priceEst}
        />
      )}
    </>
  );
}
