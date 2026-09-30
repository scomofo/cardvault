This guide combines technical camera settings, physical staging, and cataloging workflows into a single high-efficiency protocol for bulk sports card photography.

## CardVault capture station

Use CardVault on the computer with the keyboard, and expose the mounted iPhone as a camera on that computer. Open **Scan Card**, choose the iPhone camera, and select **Open Camera**. Grant camera permission when prompted. Camera names normally become available after permission; use **Refresh cameras** after connecting a device.

- **Mac:** use [Apple Continuity Camera](https://support.apple.com/en-us/102546). Connect by USB and trust the Mac, or use wireless mode. Lock and mount the iPhone with the rear cameras unobstructed. Requires iPhone XR or later, iOS 16+, macOS Ventura 13+, the same Apple Account with two-factor authentication, and Continuity Camera enabled. Keep Bluetooth and Wi-Fi on as Apple specifies.
- **Windows:** install Camo Camera on the iPhone and Camo Studio on Windows using [Camo's setup guide](https://camo.com/support/camo/camo-getting-started). Connect by USB, confirm the live preview in Camo Studio, then choose Camo in CardVault. USB by itself does not make the iPhone a Windows webcam. Available manual controls and resolutions depend on the bridge edition; no paid upgrade is required by CardVault.
- **iPhone browser only:** use the existing HTTPS setup for live camera access, or Upload for the native photo picker. A LAN HTTP address is not a secure camera origin. The desktop keyboard does not control a separate iPhone browser; this feature does not add remote pairing or expose the server publicly.

### Operation

1. Put a sample card under the tripod. Make the rear lens parallel to the card; use a matte background and diffuse light. Adjust height until small text is sharp and all four edges fit. Move the lights to reduce glare before changing the card angle.
2. Disable portrait blur, beauty filters, overlays, and automatic framing in the source camera app. Start with the rear main lens. Use another lens only if it focuses sharply at the working distance; a “2x” option is not necessarily a separate optical lens.
3. Open the camera once. CardVault remembers the selected device in this browser. It requests up to a 3840 × 2160 preview at 30 fps as preferences, and requests continuous focus, exposure and white balance plus torch off only where the track advertises support. The displayed settings come from the camera's report. “Camera managed” means the browser did not report that control; adjust it in Camo or the camera source if available. CardVault does not set ISO, shutter speed, lens selection, or AE/AF lock through unsupported controls.
4. Click the preview and press **Space** for the front. Flip the card, let the preview settle, and press **Space** for the back. The stream stays open. Review the thumbnails; **Retake front/back** returns that side to the capture station. Continue through identification, details and save/list as before. You can still proceed with only a front image.
5. For a stack, open **Sell a batch → Photograph cards**. Each front/back pair is saved to the existing queue and capture returns to the next front. **Retake front** clears the pending front; **Save front only** queues a front-only card. **Review cards** and **Save and pause** save any pending card before leaving. Failed saves retain both photos for retry. Identification, draft review, and publication remain explicit actions.

Space only operates inside the focused capture panel. Typing in fields, using selectors/buttons, holding the key, and an in-progress capture do not trigger another shutter. Click the preview again after using other controls. Leaving capture releases the camera. A disconnected camera requires reconnecting and opening it again; a missing remembered camera falls back with a visible notice so you can check the source.

CardVault first tries `ImageCapture.takePhoto` with advertised photo dimensions. If that fails it retries without dimensions, then uses the current video frame at JPEG quality 0.95. Unsupported or stalled still capture also falls back; the status says which path was used. The preview preserves the full frame. A virtual camera may provide video resolution only; this cannot guarantee native 48 MP, HEIF, ProRAW, or the iPhone Camera app's settings.

### Hardware acceptance check

On the intended iPhone/computer/browser: connect, select the source, confirm reported resolution, and capture a front/back pair. Inspect small text, corners, glare, and colour before photographing the stack. Check a held Space key produces one shot, typing does not shoot, a retake targets the correct side, and unplug/reconnect shows recovery guidance. Finally capture two batch pairs and a front-only card, then process and review the queue. Automated tests use simulated camera APIs; they cannot certify physical focus, exposure, USB reliability, or device-specific still capture.

## ---

**1\. Physical Setup & Lighting**

Consistency in your physical environment ensures that you don't have to edit photos individually later.

* **The Pedestal Method:** Place the card on a small "riser" (like a small block or stacked card cases) inside the lightbox. This makes it easier to swap cards quickly without fumbling with the floor of the box.  
* **Background Selection:** Use a **Black** background for white-bordered or "Chrome" cards to make edges pop. Use **Grey or White** for vintage or dark-bordered cards.  
* **Angle of Attack:** Position the camera parallel to the card. If you see the phone’s reflection, tilt the card stand back **5–10 degrees**.  
* **Glare Control:** \* **The Shield:** Use a piece of black poster board with a small hole for the lens to sit behind; this prevents your own reflection or room light from hitting the card.  
  * **Diffusion:** Tape parchment paper or thin white fabric over the internal LED strips to soften harsh "hot spots" on glossy surfaces.

## **2\. Native iPhone Camera App Configuration**

These controls apply when using the native Camera app, such as through Upload. They are not automatically inherited by Continuity Camera, Camo, or a browser camera track.

* **Lens Choice:** Start with the rear main lens and enough working distance for sharp focus. Test a telephoto lens only if the phone has one and it can focus at your tripod height. Keep the card near the centre of the frame.
* **AE/AF Lock (Crucial):** Tap and hold the screen on a card until **"AE/AF LOCK"** appears. Slide the **Sun icon** to set the brightness. This prevents the phone from "hunting" for focus or changing exposure between light and dark cards.  
* **Format & Grid:** Enable the **Grid** (*Settings \> Camera*) to ensure every card is centered. Use **HEIF** for space-saving or **ProRAW** for maximum detail.  
* **Disable Auto-Macro:** If using an iPhone 13 Pro or newer, turn off the "Auto Macro" flower icon to maintain manual control over your focal length.

## ---

**3\. The Bulk Workflow**

Efficiency is found in reducing "touches" per card.

* **Remote Shutter:** Use a **Bluetooth remote** or an **Apple Watch** to trigger the shutter. This eliminates camera shake and allows you to keep your hands near the cards for faster swapping.  
* **Refractor/Holo "Pop":** For cards with holographic effects, keep a small handheld LED light nearby. Briefly shine it at an angle during the shot to catch the rainbow effect without ruining the main exposure.  
* **Live Maintenance:** Keep a **Bulb Air Blower** and a **Microfiber cloth** inside the box. Blow off dust before every shot to avoid "phantom" surface flaws in the photos.

## ---

**4\. Condition Report & Cataloging Template**

Use this standardized format to log details as you photograph.

| Category | Assessment | Notes |
| :---- | :---- | :---- |
| **Identity** | \[Year\] \[Set\] \[Player\] | Card \#\[Number\] |
| **Variant** | \[Parallel/Refractor/Auto\] | Serial \# if applicable |
| **Centering** | \[ /10\] | Check L/R and T/B ratios |
| **Corners** | \[ /10\] | Look for whitening/softness |
| **Edges** | \[ /10\] | Check for chipping/silvering |
| **Surface** | \[ /10\] | Look for scratches/dimples |
| **Estimate** | \[Raw/NM-MT/Mint/Gem\] | Final Grade Projection |

### **Quick-Logging Strategy**

* **Red-Yellow-Green:** Sort cards into three physical piles based on a 5-second glance before photographing.  
  * **Green:** Flawless (Grading candidates).  
  * **Yellow:** Minor flaws (Raw sales).  
  * **Red:** Obvious damage (Bulk/Discount).  
* **Voice-to-Text:** While your hands are swapping cards, use your phone’s dictation feature to log condition notes into a spreadsheet or notes app.

---
