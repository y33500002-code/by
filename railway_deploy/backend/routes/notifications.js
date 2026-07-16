const express = require("express");

module.exports = function notificationsRouter(social) {
  const router = express.Router();

  router.get("/", (req, res) => {
    const list = social.getNotifications(req.tgUser.id);
    social.markNotificationsRead(req.tgUser.id);
    res.json(list.map((n) => ({ ...n, time: relativeTime(n.createdAt) })));
  });

  return router;
};

function relativeTime(iso) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "hozir";
  if (min < 60) return `${min} daqiqa oldin`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} soat oldin`;
  return `${Math.floor(h / 24)} kun oldin`;
}
