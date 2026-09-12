/* ============================================================
   routes/analytics.js  — Admin Analytics & Reports API
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();

module.exports = function (requireAdmin, readDB) {

  /* GET /api/admin/analytics  — full dashboard stats */
  router.get('/', requireAdmin, (req, res) => {
    const db = readDB();
    const totalRevenue   = db.orders.reduce((s, o) => s + Number(o.total || 0), 0);
    const totalOrders    = db.orders.length;
    const totalCustomers = db.users.filter(u => !u.isAdmin).length;
    const totalProducts  = db.products.length;
    const lowStock       = db.products.filter(p => p.stock < 10).length;
    const statusCounts   = db.orders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {});

    res.json({ success: true, data: { totalRevenue, totalOrders, totalCustomers, totalProducts, lowStock, statusCounts } });
  });

  /* GET /api/admin/analytics/revenue  — revenue over time */
  router.get('/revenue', requireAdmin, (req, res) => {
    const { period = 'monthly' } = req.query;
    const db = readDB();

    const revenueMap = {};
    db.orders.forEach(o => {
      const d   = new Date(o.date);
      const key = period === 'daily'
        ? o.date
        : period === 'weekly'
          ? `${d.getFullYear()}-W${getWeek(d)}`
          : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      revenueMap[key] = (revenueMap[key] || 0) + Number(o.total || 0);
    });

    const data = Object.entries(revenueMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, revenue]) => ({ period, revenue: parseFloat(revenue.toFixed(2)) }));

    res.json({ success: true, data });
  });

  /* GET /api/admin/analytics/top-products  — best sellers */
  router.get('/top-products', requireAdmin, (req, res) => {
    const { limit = 10 } = req.query;
    const db = readDB();

    const salesMap = {};
    db.orders.forEach(o => {
      (o.items || []).forEach(item => {
        const pid = item.productId || item.id;
        if (!salesMap[pid]) salesMap[pid] = { qty: 0, revenue: 0 };
        salesMap[pid].qty     += item.qty   || 1;
        salesMap[pid].revenue += (item.price || 0) * (item.qty || 1);
      });
    });

    const topProducts = Object.entries(salesMap)
      .map(([pid, stats]) => {
        const product = db.products.find(p => String(p.id) === String(pid));
        return product ? { ...stats, product } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, parseInt(limit));

    res.json({ success: true, data: topProducts });
  });

  /* GET /api/admin/analytics/customers  — customer stats */
  router.get('/customers', requireAdmin, (req, res) => {
    const db = readDB();
    const customers = db.users
      .filter(u => !u.isAdmin)
      .map(u => {
        const { passwordHash, password, ...safe } = u;
        const userOrders = db.orders.filter(o => o.userId === u.id);
        return {
          ...safe,
          orderCount: userOrders.length,
          totalSpent: userOrders.reduce((s, o) => s + Number(o.total || 0), 0)
        };
      })
      .sort((a, b) => b.totalSpent - a.totalSpent);

    res.json({ success: true, data: customers, total: customers.length });
  });

  /* GET /api/admin/analytics/inventory  — stock summary */
  router.get('/inventory', requireAdmin, (req, res) => {
    const db = readDB();
    const inventory = db.products.map(p => ({
      id:       p.id,
      name:     p.name,
      category: p.category,
      stock:    p.stock,
      sold:     p.sold || 0,
      price:    p.price,
      status:   p.stock === 0 ? 'out-of-stock' : p.stock < 10 ? 'low-stock' : 'in-stock'
    })).sort((a, b) => a.stock - b.stock);

    res.json({ success: true, data: inventory, total: inventory.length });
  });

  // Helper: ISO week number
  function getWeek(date) {
    const d    = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  return router;
};
