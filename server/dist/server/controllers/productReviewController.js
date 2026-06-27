"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProductReview = exports.getProductReviews = void 0;
const db_1 = require("../db");
const errorHandler_1 = require("../utils/errorHandler");
const crypto_1 = require("crypto");
const getProductReviews = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id: productId } = req.params;
        const conn = yield (0, db_1.getConnection)();
        const [reviews] = yield conn.query(`SELECT id, productId, customerId, customerName, rating, comment, images, isVerified, createdAt 
       FROM product_reviews 
       WHERE productId = ? 
       ORDER BY createdAt DESC`, [productId]);
        const [statsRows] = yield conn.query(`SELECT 
          COUNT(*) as count,
          COALESCE(AVG(rating), 0) as averageRating,
          COALESCE(SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END), 0) as star5,
          COALESCE(SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END), 0) as star4,
          COALESCE(SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END), 0) as star3,
          COALESCE(SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END), 0) as star2,
          COALESCE(SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END), 0) as star1
       FROM product_reviews 
       WHERE productId = ?`, [productId]);
        conn.release();
        const stats = statsRows[0];
        const formattedReviews = reviews.map(r => (Object.assign(Object.assign({}, r), { images: typeof r.images === 'string' ? JSON.parse(r.images) : (r.images || []) })));
        res.json({
            reviews: formattedReviews,
            stats: {
                count: Number(stats.count),
                averageRating: Number(Number(stats.averageRating).toFixed(1)),
                starsBreakdown: {
                    5: Number(stats.star5),
                    4: Number(stats.star4),
                    3: Number(stats.star3),
                    2: Number(stats.star2),
                    1: Number(stats.star1)
                }
            }
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'getProductReviews');
    }
});
exports.getProductReviews = getProductReviews;
const createProductReview = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id: productId } = req.params;
        const { rating, comment, images = [] } = req.body;
        const user = req.user;
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'التقييم يجب أن يكون بين ١ و ٥ نجوم.' });
        }
        const conn = yield (0, db_1.getConnection)();
        const customerId = user.partnerId || null;
        const customerName = user.name || user.username || 'عميل مجهول';
        // Verify if customer has actually purchased this item
        let isVerified = false;
        if (customerId) {
            const [purchaseRows] = yield conn.query(`SELECT COUNT(*) AS count
         FROM invoices i
         JOIN invoice_items ii ON i.id = ii.invoiceId
         WHERE i.partnerId = ? AND ii.productId = ? AND i.status != 'VOID'`, [customerId, productId]);
            isVerified = Number((_a = purchaseRows[0]) === null || _a === void 0 ? void 0 : _a.count) > 0;
        }
        const reviewId = (0, crypto_1.randomUUID)();
        yield conn.query(`INSERT INTO product_reviews (id, productId, customerId, customerName, rating, comment, images, isVerified) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [reviewId, productId, customerId, customerName, rating, comment || null, JSON.stringify(images), isVerified]);
        conn.release();
        res.status(201).json({
            message: 'تم إضافة التقييم بنجاح.',
            review: {
                id: reviewId,
                productId,
                customerId,
                customerName,
                rating,
                comment,
                images,
                isVerified,
                createdAt: new Date().toISOString()
            }
        });
    }
    catch (error) {
        return (0, errorHandler_1.handleControllerError)(res, error, 'createProductReview');
    }
});
exports.createProductReview = createProductReview;
