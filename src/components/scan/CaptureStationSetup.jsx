export default function CaptureStationSetup() {
  return (
    <details className="mb-12">
      <summary className="text-xs fw-700" style={{ cursor: "pointer", padding: "8px 0", color: "var(--acc)" }}>iPhone + lightbox setup</summary>
      <div className="card mt-6 text-xs" style={{ lineHeight: 1.8 }}>
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          <li>Mount the iPhone on the tripod with its rear camera parallel to the card. Use even, diffused light and a contrasting matte background. Keep all four edges in frame and move the lights to remove glare.</li>
          <li><strong>Mac:</strong> connect by USB and trust the Mac, or use wireless Continuity Camera. Lock and mount the iPhone, then select it in the camera menu. Requires iPhone XR or later, iOS 16+, macOS Ventura+, and the same Apple Account with two-factor authentication. <a href="https://support.apple.com/en-us/102546" target="_blank" rel="noreferrer">Apple setup</a></li>
          <li><strong>Windows:</strong> run Camo Camera on iPhone and Camo Studio on the computer, connect by USB, then select Camo in CardVault. USB alone does not expose the iPhone as a Windows webcam. <a href="https://camo.com/support/camo/camo-getting-started" target="_blank" rel="noreferrer">Camo setup</a></li>
          <li>Use the rear main lens as a starting point; adjust height until small text is sharp. Turn off portrait blur, filters, overlays, and automatic framing in the camera app. Set focus, exposure, and white balance there when CardVault reports “camera managed.” Available controls and resolutions depend on the device, browser, and bridge edition.</li>
          <li>Open the camera once. CardVault remembers the camera and requests a high-resolution preview, continuous focus/exposure/white balance, and torch off where supported. Check the reported settings and preview before the first card.</li>
          <li>Click the preview and press <strong>Space</strong> for the front, flip the card, then press <strong>Space</strong> for the back. Review and retake as needed. In Sell a batch → Photograph cards, each pair is saved to the queue while the camera stays open. Select Review cards when finished; failed saves keep your photos for retry.</li>
        </ol>
        <p className="text-dim mt-8">CardVault tries the camera’s still-photo feature first, then falls back to a video frame and tells you which was used. A virtual webcam may only provide video frames. iPhone Camera app settings, ProRAW, and 48 MP capture are not automatically available through a webcam connection.</p>
        <p className="text-dim mt-6">Using Safari directly on the iPhone requires HTTPS for live capture. A desktop keyboard controls CardVault on that desktop; it does not remotely trigger a separate iPhone browser session.</p>
      </div>
    </details>
  );
}
