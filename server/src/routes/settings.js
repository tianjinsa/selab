const express = require('express');
const store = require('../services/store');
const categories = require('../services/categories');
const { ok } = require('../response');

const router = express.Router();

router.get('/categories', (req, res) => {
  const data = store.load();
  return ok(res, categories.getCategorySettings(data));
});

module.exports = router;
