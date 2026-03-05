const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

router.get("/select-stall", (req, res) => {
  res.render("seller/select_stall");
});

module.exports = router;