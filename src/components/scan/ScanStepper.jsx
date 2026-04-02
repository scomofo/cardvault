export default function ScanStepper({ step, steps, onStepChange }) {
  return (
    <div className="stepper">
      {steps.map((label, index) => (
        <button
          key={label}
          onClick={() => onStepChange(index)}
          aria-label={`Step ${index + 1}: ${label}`}
          className={`stepper-step ${index === step ? "current" : index < step ? "completed" : "upcoming"}`}
        >
          {index < step ? "✓" : index + 1}. {label}
        </button>
      ))}
    </div>
  );
}
