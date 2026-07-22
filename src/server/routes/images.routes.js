import { readImageFile, saveImageFile } from "../services/imageStore.js";
import { requireJsonBody } from "../validation/common.js";

export function registerImageRoutes(app) {
  app.post("/api/images/:id", requireJsonBody, (req, res) => {
    try {
      const result = saveImageFile(req.params.id, req.body?.dataUrl);
      if (result.error) return res.status(result.status).json({ error: result.error });
      res.status(201).json({ id: result.id, size: result.size, mime: result.mime });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/images/:id", (req, res) => {
    try {
      const image = readImageFile(req.params.id);
      if (!image) return res.status(404).json({ error: "Image not found" });
      res.setHeader("Content-Type", image.mime);
      res.send(image.buffer);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
