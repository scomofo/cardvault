const DEFAULT_MAX_EDGE = 1600;
const DEFAULT_QUALITY = 0.86;

export function fitImageDimensions(width, height, maxEdge = DEFAULT_MAX_EDGE) {
  if (!width || !height || !maxEdge) {
    return { width, height, scaled: false };
  }
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width, height, scaled: false };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    scaled: true,
  };
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

export async function prepareImageForAi(
  dataUrl,
  { maxEdge = DEFAULT_MAX_EDGE, quality = DEFAULT_QUALITY } = {},
) {
  if (
    typeof document === "undefined" ||
    typeof Image === "undefined" ||
    typeof dataUrl !== "string" ||
    !dataUrl.startsWith("data:image/")
  ) {
    return dataUrl;
  }

  try {
    const image = await loadImage(dataUrl);
    const { width, height, scaled } = fitImageDimensions(
      image.naturalWidth || image.width,
      image.naturalHeight || image.height,
      maxEdge,
    );
    if (!scaled) return dataUrl;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return dataUrl;
  }
}
