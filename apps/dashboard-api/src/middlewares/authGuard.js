"use strict";

const { ERROR_CODES, fail } = require("@conot/shared-types");
const { parseCookieHeader, sendJson, setCookie } = require("../lib/http");

async function requireSession(req, res, ctx) {
  const cookies = parseCookieHeader(req.headers.cookie);
  const sessionId = cookies[ctx.env.sessionCookieName];
  let session = await ctx.sessionStore.getSession(sessionId);

  if (!session) {
    sendJson(
      res,
      401,
      fail(ERROR_CODES.UNAUTHORIZED, "Session tidak valid atau sudah berakhir.", null, req.traceId)
    );
    return null;
  }

  if (typeof ctx.sessionStore.touchSession === "function") {
    session = await ctx.sessionStore.touchSession(sessionId);
    setCookie(res, ctx.env.sessionCookieName, sessionId, {
      maxAge: Math.floor(ctx.env.sessionTtlMs / 1000),
      secure: ctx.env.nodeEnv === "production"
    });
  }

  return {
    sessionId,
    session
  };
}

module.exports = {
  requireSession
};
