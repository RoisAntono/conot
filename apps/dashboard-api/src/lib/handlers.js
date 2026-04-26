"use strict";

const { ERROR_CODES, fail, ok } = require("@conot/shared-types");
const { parseJsonBody, sendJson } = require("./http");

async function readBodyOrError(req, res) {
  try {
    return await parseJsonBody(req);
  } catch (error) {
    sendJson(
      res,
      400,
      fail(ERROR_CODES.VALIDATION_ERROR, error.message || "Payload tidak valid.", null, req.traceId)
    );
    return null;
  }
}

function sendOk(res, data, meta) {
  sendJson(res, 200, ok(data, meta));
}

function sendCreated(res, data, meta) {
  sendJson(res, 201, ok(data, meta));
}

function sendValidationError(req, res, errors) {
  sendJson(
    res,
    400,
    fail(ERROR_CODES.VALIDATION_ERROR, "Validasi gagal.", { fields: errors }, req.traceId)
  );
}

function sendNotFound(req, res, message) {
  sendJson(res, 404, fail(ERROR_CODES.NOT_FOUND, message, null, req.traceId));
}

function sendInternalError(req, res, error) {
  sendJson(
    res,
    500,
    fail(ERROR_CODES.INTERNAL_ERROR, "Terjadi error internal.", { message: error.message }, req.traceId)
  );
}

function sendAttachment(res, {
  contentType,
  filename,
  content
}) {
  res.statusCode = 200;
  res.setHeader("content-type", contentType || "application/octet-stream");
  if (filename) {
    res.setHeader("content-disposition", `attachment; filename="${filename}"`);
  }
  res.end(content ?? "");
}

module.exports = {
  readBodyOrError,
  sendAttachment,
  sendCreated,
  sendInternalError,
  sendNotFound,
  sendOk,
  sendValidationError
};
