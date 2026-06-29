function ok(res, data = null, message = 'ok') {
  return res.json({ success: true, code: 200, message, data });
}

function fail(res, status, message, data = null) {
  return res.status(status).json({ success: false, code: status, message, data });
}

module.exports = { ok, fail };
