export function isObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function validateRequestShape(value, label = "body") {
  if (!isObject(value)) {
    return `${label} must be an object`;
  }
  return null;
}

export function validateArray(value, field) {
  if (value != null && !Array.isArray(value)) {
    return `${field} must be an array`;
  }
  return null;
}

export function validateNumberLike(value, field) {
  if (value == null || value === "") return null;
  return Number.isFinite(Number(value)) ? null : `${field} must be a number`;
}

export function validateStringLike(value, field) {
  if (value == null) return null;
  return typeof value === "string" ? null : `${field} must be a string`;
}

export function sendValidationError(res, error) {
  return res.status(400).json({ error });
}

export function requireJsonBody(req, res, next) {
  const error = validateRequestShape(req.body);
  if (error) return sendValidationError(res, error);
  next();
}

export function requireFields(...fields) {
  return function (req, res, next) {
    const shapeError = validateRequestShape(req.body);
    if (shapeError) return sendValidationError(res, shapeError);
    for (const field of fields) {
      const value = req.body[field];
      if (value == null || value === "") {
        return sendValidationError(res, `${field} required`);
      }
    }
    next();
  };
}
