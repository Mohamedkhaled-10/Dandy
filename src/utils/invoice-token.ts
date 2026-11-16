// src/utils/invoice-token.ts
import crypto from 'node:crypto';

export const INVOICE_TOKEN_KEY_ENV = 'DANDY_INVOICE_TOKEN_ENCRYPTION_KEY';
export const INVOICE_TOKEN_KEY_ERROR_CODE = 'INVOICE_TOKEN_ENCRYPTION_KEY_MISSING_OR_INVALID';

export interface EncryptedInvoiceTokenPayload {
  v: 1;
  alg: 'aes-256-gcm';
  iv: string;
  tag: string;
  ciphertext: string;
}

export interface PrivateOrderAccessRecord {
  encryptionVersion?: 1;
  encryptedToken?: EncryptedInvoiceTokenPayload;
  token?: string;
  tokenHash: string;
  orderId: string;
  createdAt: string;
  migratedAt?: string;
  status: 'active' | 'revoked';
}

export interface PrivateInvoiceAccessRecord {
  orderId: string;
  tokenHash: string;
  createdAt: string;
  status: 'active' | 'revoked';
  expiresAt?: string;
}

export interface GetOrCreateInvoiceTokenOptions {
  encryptionKey?: string;
}

export interface PreparedInvoiceAccessArtifacts {
  token: string;
  tokenHash: string;
  orderAccessRecord: PrivateOrderAccessRecord;
  invoiceAccessRecord: PrivateInvoiceAccessRecord;
}

export type PublicInvoiceLookupResult =
  | {
      ok: true;
      order: Record<string, any>;
      orderId: string;
    }
  | {
      ok: false;
      reason: 'invalid_token' | 'not_found' | 'expired' | 'revoked' | 'corrupted_order' | 'db_error';
    };

function isPlainObject(val: unknown): val is Record<string, any> {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

function createCodedError(message: string, code: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

function validateCleanOrderId(orderId: unknown): string {
  if (!orderId || typeof orderId !== 'string' || !orderId.trim() || /[.#$\[\]/]/.test(orderId)) {
    throw createCodedError('Valid orderId is required for invoice token operation', 'INVALID_ORDER_ID');
  }
  return orderId.trim();
}

/**
 * Validates and decodes DANDY_INVOICE_TOKEN_ENCRYPTION_KEY strictly into a 32-byte Buffer.
 * Accepts:
 * - 64-character Hex string (32 bytes)
 * - Canonical Base64 string whose decoded length is strictly 32 bytes
 * Never falls back to plaintext or default secrets.
 */
export function parseEncryptionKey(rawKey?: string): Buffer {
  const source = rawKey !== undefined ? rawKey : process.env[INVOICE_TOKEN_KEY_ENV];
  if (typeof source !== 'string') {
    throw createCodedError(
      'Invoice token encryption key is missing or invalid',
      INVOICE_TOKEN_KEY_ERROR_CODE
    );
  }

  const trimmed = source.trim();
  if (!trimmed) {
    throw createCodedError(
      'Invoice token encryption key is missing or invalid',
      INVOICE_TOKEN_KEY_ERROR_CODE
    );
  }

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const hexBuf = Buffer.from(trimmed, 'hex');
    if (hexBuf.length === 32) {
      return hexBuf;
    }
  }

  if (/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) && trimmed.length % 4 === 0) {
    const b64Buf = Buffer.from(trimmed, 'base64');
    if (b64Buf.length === 32 && b64Buf.toString('base64') === trimmed) {
      return b64Buf;
    }
  }

  throw createCodedError(
    'Invoice token encryption key is missing or invalid',
    INVOICE_TOKEN_KEY_ERROR_CODE
  );
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
 * Encrypts an invoice access token with AES-256-GCM, a fresh 12-byte random IV,
 * and AAD bound to the canonical orderId.
 */
export function encryptInvoiceToken(
  token: string,
  orderId: string,
  rawKey?: string
): EncryptedInvoiceTokenPayload {
  const cleanOrderId = validateCleanOrderId(orderId);
  if (!isValidInvoiceTokenFormat(token)) {
    throw createCodedError('Invalid invoice access token format', 'INVALID_INVOICE_TOKEN');
  }

  const keyBuf = parseEncryptionKey(rawKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(cleanOrderId, 'utf8'));

  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    v: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64url'),
    tag: tag.toString('base64url'),
    ciphertext: encrypted.toString('base64url')
  };
}

/**
 * Decrypts an AES-256-GCM invoice access token payload, verifying AAD (orderId),
 * auth tag integrity, token format, and optional SHA-256 tokenHash binding.
 */
export function decryptInvoiceToken(
  payload: unknown,
  orderId: string,
  rawKey?: string,
  expectedTokenHash?: string
): string {
  const cleanOrderId = validateCleanOrderId(orderId);
  if (
    !isPlainObject(payload) ||
    payload.v !== 1 ||
    payload.alg !== 'aes-256-gcm' ||
    typeof payload.iv !== 'string' ||
    typeof payload.tag !== 'string' ||
    typeof payload.ciphertext !== 'string'
  ) {
    throw createCodedError('Encrypted invoice token payload is invalid', 'INVOICE_TOKEN_DECRYPTION_FAILED');
  }

  const keyBuf = parseEncryptionKey(rawKey);
  const ivBuf = Buffer.from(payload.iv, 'base64url');
  const tagBuf = Buffer.from(payload.tag, 'base64url');
  const ciphertextBuf = Buffer.from(payload.ciphertext, 'base64url');

  if (ivBuf.length !== 12 || tagBuf.length !== 16 || ciphertextBuf.length === 0) {
    throw createCodedError('Encrypted invoice token metadata is malformed', 'INVOICE_TOKEN_DECRYPTION_FAILED');
  }

  let decrypted = '';
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, ivBuf, { authTagLength: 16 });
    decipher.setAAD(Buffer.from(cleanOrderId, 'utf8'));
    decipher.setAuthTag(tagBuf);
    decrypted = Buffer.concat([decipher.update(ciphertextBuf), decipher.final()]).toString('utf8');
  } catch {
    throw createCodedError('Failed to decrypt invoice access token', 'INVOICE_TOKEN_DECRYPTION_FAILED');
  }

  if (!isValidInvoiceTokenFormat(decrypted)) {
    throw createCodedError('Decrypted invoice access token has invalid format', 'INVOICE_TOKEN_DECRYPTION_FAILED');
  }

  if (expectedTokenHash && hashInvoiceToken(decrypted) !== expectedTokenHash) {
    throw createCodedError('Decrypted invoice token hash mismatch', 'INVOICE_TOKEN_HASH_MISMATCH');
  }

  return decrypted;
}

/**
 * Prepares encrypted privateOrderAccess and hash-indexed privateInvoiceAccess records
 * for an order prior to atomic multi-location write.
 * Validates the encryption key upfront and NEVER creates plaintext token records.
 */
export function prepareNewInvoiceAccessArtifacts(
  orderId: string,
  rawKey?: string,
  nowIso: string = new Date().toISOString()
): PreparedInvoiceAccessArtifacts {
  const cleanOrderId = validateCleanOrderId(orderId);
  // Fail before generating or writing anything if encryption key is absent or invalid
  parseEncryptionKey(rawKey);

  const token = generateSecureInvoiceToken();
  const tokenHash = hashInvoiceToken(token);
  const encryptedToken = encryptInvoiceToken(token, cleanOrderId, rawKey);

  const orderAccessRecord: PrivateOrderAccessRecord = {
    encryptionVersion: 1,
    encryptedToken,
    tokenHash,
    orderId: cleanOrderId,
    createdAt: nowIso,
    status: 'active'
  };

  const invoiceAccessRecord: PrivateInvoiceAccessRecord = {
    orderId: cleanOrderId,
    tokenHash,
    createdAt: nowIso,
    status: 'active'
  };

  return {
    token,
    tokenHash,
    orderAccessRecord,
    invoiceAccessRecord
  };
}

/**
 * Retrieves existing active invoice token (decrypting AES-256-GCM or handling legacy plaintext
 * with safe atomic lazy migration) or creates and persists an encrypted token for the order.
 * Never stores plaintext tokens for new records and never persists unencrypted fallbacks.
 */
export async function getOrCreateInvoiceToken(
  orderId: string,
  adminDb: any,
  options: GetOrCreateInvoiceTokenOptions = {}
): Promise<string> {
  const cleanOrderId = validateCleanOrderId(orderId);
  if (!adminDb || typeof adminDb.ref !== 'function') {
    throw new Error('Firebase Admin DB instance is required to persist invoice token');
  }

  const rawKey = options.encryptionKey;

  // 1. Check existing privateOrderAccess record
  const orderAccessRef = adminDb.ref(`privateOrderAccess/${cleanOrderId}`);
  const snap = await orderAccessRef.once('value');
  const existing = snap.val();

  if (isPlainObject(existing)) {
    if (existing.status === 'revoked') {
      throw new Error(`Invoice access has been revoked for order ${cleanOrderId}`);
    }

    // 1A. Modern AES-256-GCM encrypted record
    if (existing.status === 'active' && isPlainObject(existing.encryptedToken)) {
      const decryptedToken = decryptInvoiceToken(
        existing.encryptedToken,
        cleanOrderId,
        rawKey,
        typeof existing.tokenHash === 'string' ? existing.tokenHash : undefined
      );
      const expectedHash = hashInvoiceToken(decryptedToken);

      const invSnap = await adminDb.ref(`privateInvoiceAccess/${expectedHash}`).once('value');
      const invMapping = invSnap.val();

      if (isPlainObject(invMapping)) {
        if (invMapping.status === 'revoked') {
          throw new Error(`Invoice access hash has been revoked for order ${cleanOrderId}`);
        }
        if (invMapping.status === 'active' && invMapping.orderId === cleanOrderId) {
          return decryptedToken;
        }
      }

      if (!invMapping) {
        await adminDb.ref(`privateInvoiceAccess/${expectedHash}`).set({
          orderId: cleanOrderId,
          tokenHash: expectedHash,
          createdAt: existing.createdAt || new Date().toISOString(),
          status: 'active'
        });
        return decryptedToken;
      }
    }

    // 1B. Legacy plaintext record -> verify and perform safe atomic lazy migration when key is valid
    if (
      existing.status === 'active' &&
      typeof existing.token === 'string' &&
      isValidInvoiceTokenFormat(existing.token)
    ) {
      const legacyToken = existing.token;
      const expectedHash = hashInvoiceToken(legacyToken);

      if (typeof existing.tokenHash === 'string' && existing.tokenHash !== expectedHash) {
        throw createCodedError(
          `Legacy invoice token hash mismatch for order ${cleanOrderId}`,
          'INVOICE_TOKEN_HASH_MISMATCH'
        );
      }

      const invSnap = await adminDb.ref(`privateInvoiceAccess/${expectedHash}`).once('value');
      const invMapping = invSnap.val();

      if (isPlainObject(invMapping) && invMapping.status === 'revoked') {
        throw new Error(`Invoice access hash has been revoked for order ${cleanOrderId}`);
      }

      const hasValidMapping =
        isPlainObject(invMapping) &&
        invMapping.status === 'active' &&
        invMapping.orderId === cleanOrderId;

      let keyAvailable = false;
      try {
        parseEncryptionKey(rawKey);
        keyAvailable = true;
      } catch (keyErr: any) {
        // Read-only legacy compatibility when mapping is already active; never write plaintext
        if (hasValidMapping) {
          return legacyToken;
        }
        throw keyErr;
      }

      if (keyAvailable && typeof orderAccessRef.transaction === 'function') {
        try {
          const encryptedForMigration = encryptInvoiceToken(legacyToken, cleanOrderId, rawKey);
          const migratedAt = new Date().toISOString();
          await orderAccessRef.transaction((current: any) => {
            if (!isPlainObject(current) || current.status !== 'active') {
              return undefined;
            }
            if (isPlainObject(current.encryptedToken) && !('token' in current)) {
              return current;
            }
            if (typeof current.token !== 'string' || !isValidInvoiceTokenFormat(current.token)) {
              return undefined;
            }
            const curHash = hashInvoiceToken(current.token);
            const payload =
              current.token === legacyToken
                ? encryptedForMigration
                : encryptInvoiceToken(current.token, cleanOrderId, rawKey);

            const { token: _removedPlaintext, ...rest } = current;
            return {
              ...rest,
              tokenHash: curHash,
              orderId: cleanOrderId,
              createdAt: current.createdAt || migratedAt,
              migratedAt,
              encryptionVersion: 1,
              encryptedToken: payload,
              status: 'active'
            };
          });
        } catch (migErr: any) {
          console.warn(
            `[InvoiceToken] Lazy migration skipped/deferred for order ${cleanOrderId}:`,
            migErr?.code || migErr?.name || 'migration_failed'
          );
        }
      }

      if (hasValidMapping) {
        return legacyToken;
      }

      if (!invMapping) {
        try {
          await adminDb.ref(`privateInvoiceAccess/${expectedHash}`).set({
            orderId: cleanOrderId,
            tokenHash: expectedHash,
            createdAt: existing.createdAt || new Date().toISOString(),
            status: 'active'
          });
          return legacyToken;
        } catch (err: any) {
          console.error(
            `[InvoiceToken] Failed persisting private invoice mapping for order ${cleanOrderId}:`,
            err?.message || 'write_failed'
          );
          throw new Error('Failed to persist invoice access token');
        }
      }
    }
  }

  // 2. Generate new encrypted token artifacts (throws before DB writes if encryption key missing/invalid)
  const { token, tokenHash, orderAccessRecord, invoiceAccessRecord } =
    prepareNewInvoiceAccessArtifacts(cleanOrderId, rawKey);

  // 3. Atomically persist to private nodes (do not swallow failures or return unpersisted token)
  const updates: Record<string, any> = {};
  updates[`privateOrderAccess/${cleanOrderId}`] = orderAccessRecord;
  updates[`privateInvoiceAccess/${tokenHash}`] = invoiceAccessRecord;

  try {
    await adminDb.ref().update(updates);
  } catch (err: any) {
    console.error(
      `[InvoiceToken] Failed persisting private token for order ${cleanOrderId}:`,
      err?.message || 'write_failed'
    );
    throw new Error('Failed to persist invoice access token');
  }

  return token;
}

/**
 * Resolves order details for public invoice display using an access token, returning structured status.
 */
export async function lookupPublicInvoiceByToken(
  token: string,
  adminDb: any
): Promise<PublicInvoiceLookupResult> {
  if (!isValidInvoiceTokenFormat(token)) {
    return { ok: false, reason: 'invalid_token' };
  }
  if (!adminDb || typeof adminDb.ref !== 'function') {
    return { ok: false, reason: 'db_error' };
  }

  const tokenHash = hashInvoiceToken(token);

  try {
    const mappingSnap = await adminDb.ref(`privateInvoiceAccess/${tokenHash}`).once('value');
    const mapping = mappingSnap.val();

    if (!isPlainObject(mapping)) {
      return { ok: false, reason: 'not_found' };
    }

    if (mapping.status === 'revoked') {
      return { ok: false, reason: 'revoked' };
    }

    if (mapping.status !== 'active' || typeof mapping.orderId !== 'string' || !mapping.orderId.trim()) {
      return { ok: false, reason: 'not_found' };
    }

    if (mapping.tokenHash && mapping.tokenHash !== tokenHash) {
      return { ok: false, reason: 'not_found' };
    }

    if (typeof mapping.expiresAt === 'string' && mapping.expiresAt.trim()) {
      const expiresAtMs = Date.parse(mapping.expiresAt);
      if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
        return { ok: false, reason: 'expired' };
      }
    }

    const orderId = mapping.orderId.trim();
    const orderSnap = await adminDb.ref(`orders/${orderId}`).once('value');
    const rawOrder = orderSnap.val();

    if (!isPlainObject(rawOrder)) {
      return { ok: false, reason: 'not_found' };
    }

    // Reject severely corrupted / empty order nodes
    const hasCoreIdentity =
      (typeof rawOrder.invoiceCode === 'string' && rawOrder.invoiceCode.trim().length > 0) ||
      (typeof rawOrder.name === 'string' && rawOrder.name.trim().length > 0) ||
      Array.isArray(rawOrder.products);

    if (!hasCoreIdentity) {
      return { ok: false, reason: 'corrupted_order' };
    }

    // Strict customer-facing field whitelist
    const sanitizedProducts = Array.isArray(rawOrder.products)
      ? rawOrder.products
          .filter((p: unknown) => isPlainObject(p))
          .map((p: Record<string, any>) => ({
            name: typeof p.name === 'string' && p.name.trim() ? p.name : 'منتج داندي',
            quantity: Number(p.quantity) > 0 ? Number(p.quantity) : 1,
            price: Number(p.price) || 0,
            effectiveUnitPrice: Number(p.effectiveUnitPrice || p.price) || 0,
            lineTotal: Number(p.lineTotal) || 0,
            image: typeof p.image === 'string' ? p.image : '',
            variantName:
              typeof p.variantName === 'string'
                ? p.variantName
                : (isPlainObject(p.selectedVariant) && typeof p.selectedVariant.name === 'string' ? p.selectedVariant.name : ''),
            badgeText: typeof p.badgeText === 'string' ? p.badgeText : '',
            isCollection: Boolean(p.isCollection || p.type === 'collection'),
            items: Array.isArray(p.items)
              ? p.items
                  .filter((sub: unknown) => isPlainObject(sub))
                  .map((sub: Record<string, any>) => ({
                    productName:
                      typeof sub.productName === 'string'
                        ? sub.productName
                        : (typeof sub.name === 'string' ? sub.name : ''),
                    variantName: typeof sub.variantName === 'string' ? sub.variantName : ''
                  }))
              : []
          }))
      : [];

    const publicOrder = {
      orderId,
      invoiceCode:
        typeof rawOrder.invoiceCode === 'string' && rawOrder.invoiceCode.trim()
          ? rawOrder.invoiceCode
          : `DNY-${orderId.slice(-6)}`,
      timestamp: rawOrder.timestamp || rawOrder.createdAt || null,
      status: typeof rawOrder.status === 'string' && rawOrder.status.trim() ? rawOrder.status : 'جديد',
      name: typeof rawOrder.name === 'string' ? rawOrder.name : '',
      phone: typeof rawOrder.phone === 'string' ? rawOrder.phone : '',
      email: typeof rawOrder.email === 'string' && rawOrder.email !== 'N/A' ? rawOrder.email : '',
      governorate: typeof rawOrder.governorate === 'string' ? rawOrder.governorate : '',
      city: typeof rawOrder.city === 'string' ? rawOrder.city : '',
      address: typeof rawOrder.address === 'string' ? rawOrder.address : '',
      products: sanitizedProducts,
      subtotal: Number(rawOrder.subtotal) || 0,
      shippingFee: Number(rawOrder.shippingFee) || 0,
      totalAmount: Number(rawOrder.totalAmount) || 0,
      paymentMethod: 'الدفع عند الاستلام (COD)'
    };

    return {
      ok: true,
      order: publicOrder,
      orderId
    };
  } catch (err: any) {
    console.error('[InvoiceToken] Error resolving public invoice:', err?.message || 'lookup_error');
    return { ok: false, reason: 'db_error' };
  }
}

/**
 * Resolves order details for public invoice display using an access token.
 * Returns only a strict whitelist of fields safe for customer viewing.
 */
export async function resolvePublicInvoiceByToken(
  token: string,
  adminDb: any
): Promise<{
  order: Record<string, any>;
  orderId: string;
} | null> {
  const result = await lookupPublicInvoiceByToken(token, adminDb);
  if (!result.ok) {
    return null;
  }
  return {
    order: result.order,
    orderId: result.orderId
  };
}
