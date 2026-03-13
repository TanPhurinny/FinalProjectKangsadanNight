const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
router.get("/repair", (req, res) => {

  if (!req.session.user) {
    return res.redirect("/login");
  }

  res.render("seller/repair", {
    user: req.session.user
  });

});

router.get("/select-stall", (req, res) => {
  res.render("seller/select_stall");
});

// หน้าแจ้งซ่อม



// บันทึกแจ้งซ่อม
router.post("/repair", async (req, res) => {

  if (!req.session.user) {
    return res.redirect("/login");
  }

  const { location, category, description } = req.body;

  await prisma.maintenanceReport.create({
    data: {
      location,
      category,
      description,
      userId: req.session.user.id
    }
  });

  res.redirect("/repair");

});

// หน้า booking แผง
router.get("/booking-stall", (req, res) => {

  if (!req.session.user) {
    return res.redirect("/login");
  }

  res.render("seller/Booking_stall", {
    user: req.session.user
  });

});
// หน้า status การจอง
router.get("/booking-status", (req, res) => {

  if (!req.session.user) {
    return res.redirect("/login");
  }

  res.render("seller/booking_status", {
    user: req.session.user
  });

});


module.exports = router;