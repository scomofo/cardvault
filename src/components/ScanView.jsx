import ScanCaptureStep from "./scan/ScanCaptureStep";
import ScanDetailsStep from "./scan/ScanDetailsStep";
import ScanIdentifyStep from "./scan/ScanIdentifyStep";
import ScanListingStep from "./scan/ScanListingStep";
import ScanStepper from "./scan/ScanStepper";
import { useScanWorkflow } from "../hooks/useScanWorkflow";

export default function ScanView({ onNavigate }) {
  const { actions, state } = useScanWorkflow();
  const { setCard, setListing, setShowCvOverlay, setShowGrading, setStep } =
    actions;
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
  } = state;

  const steps = ["Capture", "Identify", "Details", "List"];

  return (
    <>
      <h1 className="page-title">Scan Card</h1>
      <ScanStepper step={step} steps={steps} onStepChange={setStep} />

      {step === 0 && (
        <ScanCaptureStep
          backImg={backImg}
          card={card}
          cvAnalyzing={cvAnalyzing}
          cvOnline={cvOnline}
          frontImg={frontImg}
          onAnalyzeCv={actions.doCvAnalyze}
          onBackCapture={actions.setBackImg}
          onBackRetake={() => actions.setBackImg(null)}
          onFrontCapture={actions.setFrontImg}
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
        />
      )}
    </>
  );
}
