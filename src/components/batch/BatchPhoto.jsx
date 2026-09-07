import { useEffect, useState } from "react";
import { loadImage } from "../../lib/storage";
import { apiPath } from "../../lib/apiBase";

export default function BatchPhoto({ imageId, inlineImage, alt = "Card photo" }) {
  const [image, setImage] = useState(null), [failed, setFailed] = useState(false), [resolved, setResolved] = useState(false);
  useEffect(() => {
    let cancelled = false; setImage(null); setFailed(false); setResolved(false);
    if (imageId) loadImage(imageId).then((value) => { if (!cancelled) { setImage(value); setResolved(true); } }).catch(() => { if (!cancelled) setResolved(true); });
    return () => { cancelled = true; };
  }, [imageId]);
  const src = inlineImage || image || (imageId && resolved ? apiPath(`/images/${encodeURIComponent(imageId)}`) : null);
  return src && !failed ? <img className="batch-photo" src={src} alt={alt} onError={() => setFailed(true)} />
    : <span className="batch-photo batch-photo-missing">{imageId ? "Photo unavailable" : "Photo needed"}</span>;
}
