export const CV_SERVICE_REQUIRED_MODULES = ["fastapi", "uvicorn", "cv2", "numpy"];

export function buildCvServiceProbeArgs() {
  return ["-c", `import ${CV_SERVICE_REQUIRED_MODULES.join(", ")}`];
}

export function buildCvServiceDependencyMessage(pythonBin) {
  return [
    "Python is available, but the Card Detection Service dependencies are missing.",
    "",
    "From the CardVault project folder, run:",
    `cd cv-service && ${pythonBin} -m pip install -r requirements.txt`,
  ].join("\n");
}
