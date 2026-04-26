"use strict";

const { ERROR_CODES, fail } = require("@conot/shared-types");
const { requireSession } = require("../middlewares/authGuard");
const { requireGuildAccess, requireManageGuild } = require("../middlewares/rbacGuard");
const { readBodyOrError, sendInternalError, sendOk } = require("../lib/handlers");
const { sendJson } = require("../lib/http");
const youtubeScraper = require("../../../../src/utils/youtubeScraper");
const rssChecker = require("../../../../src/utils/rssChecker");

async function resolveLatestVideo(youtubeInfo, shouldFetchLatestVideo) {
  if (!shouldFetchLatestVideo) {
    return null;
  }

  try {
    return await rssChecker.fetchLatestVideo(youtubeInfo.channelId);
  } catch {
    return null;
  }
}

function registerYoutubeRoutes(router, appContext) {
  router.add("POST", "/v1/guilds/:guildId/youtube/resolve", async (req, res, routeContext) => {
    try {
      const sessionContext = await requireSession(req, res, appContext);
      if (!sessionContext) return;

      const guild = requireGuildAccess(req, res, routeContext.params.guildId, sessionContext);
      if (!guild || !requireManageGuild(req, res, guild)) return;

      const body = await readBodyOrError(req, res);
      if (!body) return;

      const source = String(body.source || "").trim();
      if (!source) {
        sendJson(
          res,
          400,
          fail(
            ERROR_CODES.VALIDATION_ERROR,
            "Sumber YouTube wajib diisi.",
            { fields: [{ field: "source", message: "Sumber YouTube wajib diisi." }] },
            req.traceId
          )
        );
        return;
      }

      try {
        const normalizedSource = youtubeScraper.normalizeYouTubeInput(source);
        const youtubeInfo = await youtubeScraper.scrapeYouTubeChannel(source);
        const latestVideo = await resolveLatestVideo(
          youtubeInfo,
          !youtubeScraper.looksLikeChannelId(normalizedSource)
        );

        sendOk(res, {
          username: youtubeInfo.username,
          channelId: youtubeInfo.channelId,
          title: youtubeInfo.title || latestVideo?.channelTitle || youtubeInfo.username,
          resolvedUrl: youtubeInfo.resolvedUrl,
          latestVideo: latestVideo
            ? {
                videoId: latestVideo.videoId,
                title: latestVideo.title,
                link: latestVideo.link,
                publishedAt: latestVideo.publishedAt,
                channelTitle: latestVideo.channelTitle,
                label: latestVideo.label
              }
            : null
        });
      } catch (error) {
        sendJson(
          res,
          400,
          fail(
            ERROR_CODES.YOUTUBE_SOURCE_INVALID,
            error.message || "Sumber YouTube tidak valid.",
            { fields: [{ field: "source", message: error.message || "Sumber YouTube tidak valid." }] },
            req.traceId
          )
        );
      }
    } catch (error) {
      sendInternalError(req, res, error);
    }
  });
}

module.exports = {
  registerYoutubeRoutes
};
