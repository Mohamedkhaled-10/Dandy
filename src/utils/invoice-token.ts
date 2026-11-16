// src/utils/invoice-token.ts
import crypto from 'node:crypto';

export interface PrivateOrderAccessRecord {
  token: string;
  tokenHash: string;
  orderId: string;
  createdAt: string;
  status: 'active' | 'revoked';
}

export interface PrivateInvoiceAccessRecord {
  orderId: string;
  tokenHash: string;
  createdAt: string;
  status: 'active' | 'revoked';
}

/**
 * Computes SHA-256 hash of access token as hex string.
 */
export function hashInvoiceToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim(), 'utf8').digest('hex');
}

/**
 * Generates a cryptographically secure, high-entropy 256-bit token encoded in Base64URL.
 */
export function generateSecureInvoiceToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Validates token string format (non-empty base64url string with sufficient length).
 */
export function isValidInvoiceTokenFormat(token: unknown): boolean {
  if (!token || typeof token !== 'string') return false;
  if (token.length < 32 || token.length > 64) return false;
  return /^[A-Za-z0-9_-]+$/.test(token);
}

/**
 * Retrieves existing active invoice token or creates a new one for the given order.
 * Uses Firebase Admin Realtime Database.
 */
export async function getOrCreateInvoiceToken(orderId: string, adminDb: any): Promise<string> {
  if (!orderId || typeof orderId !== 'string') {
    throw new Error('Valid orderId is required to get or create invoice token');
  }

  // 1. Check existing privateOrderAccess record
  if (adminDb) {
    try {
      const snap = await adminDb.ref(`privateOrderAccess/${orderId}`).once('value');
      const existing = snap.val();
      if (existing && existing.token && existing.status === 'active') {
        return existing.token;
      }
    } catch (err) {
      console.warn(`[InvoiceToken] Failed reading privateOrderAccess for ${orderId}:`, err);
    }
  }

  // 2. Generate new 256-bit secure token
  const token = generateSecureInvoiceToken();
  const tokenHash = hashInvoiceToken(token);
  const nowIso = new Date().toISOString();

  const orderAccessRecord: PrivateOrderAccessRecord = {
    token,
    tokenHash,
    orderId,
    createdAt: nowIso,
    status: 'active'
  };

  const invoiceAccessRecord: PrivateInvoiceAccessRecord = {
    orderId,
    tokenHash,
    createdAt: nowIso,
    status: 'active'
  };

  // 3. Atomically persist to private nodes
  if (adminDb) {
    try {
      const updates: Record<string, any> = {};
      updates[`privateOrderAccess/${orderId}`] = orderAccessRecord;
      updates[`privateInvoiceAccess/${tokenHash}`] = invoiceAccessRecord;
      await adminDb.ref().update(updates);
    } catch (err) {
      console.error(`[InvoiceToken] Failed saving private token for ${orderId}:`, err);
      // Return generated token so email doesn't fail; but error is logged
    }
  }

  return token;
}

/**
 * Resolves order details for public invoice display using an access token.
 * Returns only a strict whitelist of fields safe for customer viewing.
 */
export async function resolvePublicInvoiceByToken(token: string, adminDb: any): Promise<{
  order: Record<string, any>;
  orderId: string;
} | null> {
  if (!isValidInvoiceTokenFormat(token) || !adminDb) {
    return null;
  }

  const tokenHash = hashInvoiceToken(token);

  try {
    const mappingSnap = await adminDb.ref(`privateInvoiceAccess/${tokenHash}`).once('value');
    const mapping = mappingSnap.val();

    if (!mapping || mapping.status !== 'active' || !mapping.orderId) {
      return null;
    }

    const orderId = mapping.orderId;
    const orderSnap = await adminDb.ref(`orders/${orderId}`).once('value');
    const rawOrder = orderSnap.val();

    if (!rawOrder) {
      return null;
    }

    // Strict customer-facing field whitelist
    const sanitizedProducts = Array.isArray(rawOrder.products)
      ? rawOrder.products.map((p: any) => ({
          name: p.name || 'منتج داندي',
          quantity: p.quantity || 1,
          price: p.price || 0,
          effectiveUnitPrice: p.effectiveUnitPrice || p.price || 0,
          lineTotal: p.lineTotal || 0,
          image: p.image || '',
          variantName: p.variantName || (p.selectedVariant?.name) || '',
          badgeText: p.badgeText || '',
          isCollection: Boolean(p.isCollection || p.type === 'collection'),
          items: Array.isArray(p.items)
            ? p.items.map((sub: any) => ({
                productName: sub.productName || sub.name || '',
                variantName: sub.variantName || ''
              }))
            : []
        }))
      : [];

    const publicOrder = {
      orderId,
      invoiceCode: rawOrder.invoiceCode || `DNY-${orderId.slice(-6)}`,
      timestamp: rawOrder.timestamp || null,
      status: rawOrder.status || 'جديد',
      name: rawOrder.name || '',
      phone: rawOrder.phone || '',
      email: rawOrder.email && rawOrder.email !== 'N/A' ? rawOrder.email : '',
      governorate: rawOrder.governorate || '',
      city: rawOrder.city || '',
      address: rawOrder.address || '',
      products: sanitizedProducts,
      subtotal: Number(rawOrder.subtotal) || 0,
      shippingFee: Number(rawOrder.shippingFee) || 0,
      totalAmount: Number(rawOrder.totalAmount) || 0,
      paymentMethod: 'الدفع عند الاستلام (COD)'
    };

    return {
      order: publicOrder,
      orderId
    };

  } catch (err) {
    console.error('[InvoiceToken] Error resolving public invoice:', err);
    return null;
  }
}
