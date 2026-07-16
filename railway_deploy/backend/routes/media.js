const express = require("express");
const { streamHandler } = require("../lib/telegramFile");

module.exports = function mediaRouter() {
  const router = express.Router();
  const handler = streamHandler();
  router.get("/poster/:fileId", handler);
  router.get("/video/:fileId", handler);
  return router;
};
