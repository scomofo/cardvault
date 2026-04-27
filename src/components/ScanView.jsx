import { useEffect } from "react";
import BatchCaptureMode from "./BatchCaptureMode";
import BatchProcessView from "./BatchProcessView";
import ScanCaptureStep from "./scan/ScanCaptureStep";
import ScanDetailsStep from "./scan/ScanDetailsStep";
import ScanIdentifyStep from "./scan/ScanIdentifyStep";
import ScanListingStep from "./scan/ScanListingStep";
import ScanStepper from "./scan/ScanStepper";
import { PLATFORM_FEES } from "./SalesFlow";
import { useScanWorkflow } from "../hooks/useScanWorkflow";

export default function ScanView({ onNavigate, pendingImage, onPendingImageConsumed }) {
  const { actions, state } = useScanWorkflow();

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
    frontImg,
    gradingData,
    listing,
    priceEst,
    priceHistory,
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
    batchMode,
    batchQueue,
    batchProcessing,
    batchProcessedCount,
  } = state;

  const steps = ["Capture", "Identify", "Details", "List"];

  if (batchMode === "capture") {
    return (
      <>
        <h1 className="page-title">Scan Card</h1>
        <BatchCaptureMode
          queue={batchQueue}
          onAddToQueue={actions.addToBatchQueue}
          onDone={() => { actions.setBatchMode("process"); actions.processBatchQueue(); }}
          onCancel={() => { actions.setBatchMode(null); }}
        />
      </>
    );
  }

  if (batchMode === "process") {
    return (
      <>
        <h1 className="page-title">Scan Card</h1>
        <BatchProcessView
          queue={batchQueue}
          processing={batchProcessing}
          processedCount={batchProcessedCount}
          onSaveAll={actions.saveBatchCards}
          onRetry={(id) => { actions.retryBatchItem(id); actions.processBatchQueue(); }}
          onRemove={actions.removeBatchItem}
          onCancel={() => { actions.setBatchMode(null); }}
        />
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">Scan Card</h1>
      <button className="btn btn-outline btn-full mb-12" onClick={() => actions.setBatchMode("capture")}>
        Batch Capture Mode
      </button>
      <ScanStepper step={step} steps={steps} onStepChange={setStep} />

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
          costBasis={parseFloat(card.costBasis) || 0}
          feeRate={PLATFORM_FEES[listing.platform] || 0}
          comps={results}
          priceEst={priceEst}
        />
      )}
    </>
  );
}
