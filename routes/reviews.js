/* ============================================================
   routes/reviews.js  — Product Reviews
   ============================================================
   GET  /api/reviews/:productId          List all reviews for a product
   POST /api/reviews/:productId          Submit a new review
   POST /api/reviews/:productId/:reviewId/vote      Upvote or downvote a review
   ============================================================ */
'use strict';

const express = require('express');
const router  = express.Router();

module.exports = function(authenticate, requireAdmin, readDB, writeDB, supabase) {

  function ensureReviews(db) {
    if (!db.reviews) { db.reviews = {}; writeDB(db); }
  }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     GET /api/reviews/:productId
     Get all reviews for a specific product
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.get('/:productId', async (req, res) => {
    const { productId } = req.params;
    const pid = Number(productId);

    try {
      if (supabase) {
        const { data, error } = await supabase.from('reviews').select('*').eq('product_id', pid).order('created_at', { ascending: false });
        if (!error && data) {
          const mapped = data.map(mapSupabaseReviewToClient);
          return res.json({ success: true, data: mapped, total: mapped.length, source: 'supabase' });
        }
      }
    } catch (e) {}

    const db = readDB();
    ensureReviews(db);
    let reviews = db.reviews[productId] || [];
    res.json({ success: true, data: reviews, total: reviews.length, source: 'local' });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/reviews/:productId
     Submit a new review
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/:productId', authenticate, async (req, res) => {
    const { productId } = req.params;
    const { rating, title, text, images } = req.body;
    const pid = Number(productId);

    if (!rating || !title || !text) {
      return res.status(400).json({ success: false, error: 'Rating, title, and text are required' });
    }

    const db = readDB();
    ensureReviews(db);

    const user = db.users.find(u => u.id === req.userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const newReview = {
      id: 'r-' + Date.now() + Math.floor(Math.random() * 1000),
      productId: pid,
      userId: user.id,
      user: user.name,
      avatar: user.avatar,
      rating: Number(rating),
      date: new Date().toISOString().split('T')[0],
      title: title.trim(),
      text: text.trim(),
      verified: true,
      helpful: 0,
      unhelpful: 0,
      images: Array.isArray(images) ? images : []
    };

    if (!db.reviews[productId]) {
      db.reviews[productId] = [];
    }

    db.reviews[productId].unshift(newReview);

    const product = db.products.find(p => p.id === pid);
    if (product) {
      const allReviews = db.reviews[productId];
      const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
      product.reviewCount = allReviews.length;
      product.rating = parseFloat((totalRating / allReviews.length).toFixed(1));
    }

    writeDB(db);

    try {
      if (supabase) {
        const sbReview = mapReviewToSupabase(newReview);
        const { error } = await supabase.from('reviews').insert([sbReview]);
        if (!error) {
          const { error: upErr } = await supabase.from('products').update({ rating: newReview.rating || product?.rating || 0, review_count: db.reviews[productId].length }).eq('id', pid);
          if (upErr) console.warn('Supabase product rating update error:', upErr.message);
        }
      }
    } catch (e) {
      console.warn('Supabase review insert error:', e.message);
    }

    res.json({ success: true, data: db.reviews[productId], message: 'Review submitted successfully' });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     POST /api/reviews/:productId/:reviewId/vote
     Upvote or downvote a review
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  router.post('/:productId/:reviewId/vote', authenticate, (req, res) => {
    const { productId, reviewId } = req.params;
    const { type } = req.body; // 'helpful' or 'unhelpful'

    if (type !== 'helpful' && type !== 'unhelpful') {
      return res.status(400).json({ success: false, error: 'Invalid vote type' });
    }

    const db = readDB();
    ensureReviews(db);

    if (!db.reviews[productId]) {
      return res.status(404).json({ success: false, error: 'Product reviews not found' });
    }

    const review = db.reviews[productId].find(r => r.id === reviewId);
    if (!review) {
      return res.status(404).json({ success: false, error: 'Review not found' });
    }

    // Initialize votes array if not exists
    if (!db.reviewVotes) db.reviewVotes = {};
    const userVoteKey = `${req.userId}-${reviewId}`;

    if (db.reviewVotes[userVoteKey]) {
      return res.json({ success: false, alreadyVoted: true, error: 'You have already voted on this review' });
    }

    // Record vote
    db.reviewVotes[userVoteKey] = type;
    review[type] = (review[type] || 0) + 1;
    
    writeDB(db);

    res.json({ success: true, review, message: 'Vote recorded successfully' });
  });

  return router;
};

function mapSupabaseReviewToClient(r) {
  return {
    id: r.id,
    productId: r.product_id,
    userId: r.user_id,
    user: r.user_name,
    avatar: r.avatar,
    rating: r.rating,
    date: r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : r.date || '',
    title: r.title,
    text: r.text,
    verified: r.verified,
    helpful: r.helpful || 0,
    unhelpful: r.unhelpful || 0,
    images: r.images || []
  };
}

function mapReviewToSupabase(r) {
  return {
    id: r.id,
    product_id: r.productId,
    user_id: r.userId,
    user_name: r.user,
    avatar: r.avatar,
    rating: r.rating,
    title: r.title,
    text: r.text,
    verified: r.verified,
    helpful: r.helpful || 0,
    unhelpful: r.unhelpful || 0,
    images: r.images || []
  };
}
