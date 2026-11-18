export const prerender = false;

// src/pages/api/pink-friday/admin.js
// Protected Admin API for Dandy Pink Friday Annual Campaign Management
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { INITIAL_2026_CAMPAIGN, invalidatePinkFridayCache } from '../../../utils/pink-friday-server.ts';

async function enrichNormalizedOffers(rawOffers, adminDb) {
  const offersList = Array.isArray(rawOffers)
    ? rawOffers
    : (rawOffers && typeof rawOffers === 'object' ? Object.values(rawOffers) : []);

  const validOffers = offersList.filter((o) => o && o.productId);
  if (validOffers.length === 0) return [];

  let productsMap = {};
  try {
    const pSnap = await adminDb.ref('products').once('value');
    productsMap = pSnap.val() || {};
  } catch (err) {
    console.warn('[PinkFriday Admin API] Could not read products for offer enrichment:', err?.message);
  }

  return validOffers.map((o) => {
    const productId = String(o.productId).trim();
    const prod = productsMap[productId] || null;
    const prodPrice = prod ? parseFloat(String(prod.price || 0).replace(/[^0-9.-]+/g, '')) || 0 : 0;
    const rawExpected = Number(o.expectedBasePrice);
    const expectedBasePrice = prodPrice > 0 ? prodPrice : (Number.isFinite(rawExpected) && rawExpected > 0 ? rawExpected : 0);

    const rawDiscount = Number(o.discountPercentage);
    const discountPercentage = Number.isFinite(rawDiscount) && rawDiscount > 0 && rawDiscount < 100
      ? Math.round(rawDiscount)
      : 0;

    const rawCampaignPrice = Number(o.campaignPrice);
    let campaignPrice = Number.isFinite(rawCampaignPrice) && rawCampaignPrice > 0 ? rawCampaignPrice : 0;
    if (expectedBasePrice > 0 && discountPercentage > 0) {
      campaignPrice = Math.round(expectedBasePrice * (1 - discountPercentage / 100));
    }

    const active = o.active !== false && o.active !== 'false' && o.active !== 0;

    return {
      ...o,
      productId,
      expectedBasePrice,
      discountPercentage,
      campaignPrice,
      active,
      badgeText: typeof o.badgeText === 'string' && o.badgeText.trim() ? o.badgeText.trim() : 'Pink Friday',
      allowWithGenericDiscount: Boolean(o.allowWithGenericDiscount)
    };
  });
}

function normalizeCampaignI18n(rawI18n) {
  if (!rawI18n || typeof rawI18n !== 'object') return undefined;
  const en = rawI18n.en;
  if (!en || typeof en !== 'object') return undefined;

  const cleanCollectionOverrides = {};
  if (en.collectionTextOverrides && typeof en.collectionTextOverrides === 'object') {
    for (const [colId, val] of Object.entries(en.collectionTextOverrides)) {
      if (val && typeof val === 'object') {
        cleanCollectionOverrides[colId] = {
          ...(typeof val.name === 'string' ? { name: val.name } : {}),
          ...(typeof val.description === 'string' ? { description: val.description } : {}),
          ...(typeof val.badgeText === 'string' ? { badgeText: val.badgeText } : {})
        };
      }
    }
  }

  return {
    en: {
      ...(typeof en.title === 'string' ? { title: en.title } : {}),
      ...(typeof en.headline === 'string' ? { headline: en.headline } : {}),
      ...(typeof en.subtitle === 'string' ? { subtitle: en.subtitle } : {}),
      ...(typeof en.ctaText === 'string' ? { ctaText: en.ctaText } : {}),
      ...(typeof en.badgeText === 'string' ? { badgeText: en.badgeText } : {}),
      ...(typeof en.heroImageOverride === 'string' ? { heroImageOverride: en.heroImageOverride } : {}),
      ...(Object.keys(cleanCollectionOverrides).length > 0
        ? { collectionTextOverrides: cleanCollectionOverrides }
        : {})
    }
  };
}

function getAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saEnv) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is missing');
  }

  const serviceAccount = typeof saEnv === 'string' ? JSON.parse(saEnv) : saEnv;

  return initializeApp({
    credential: cert(serviceAccount),
    databaseURL: 'https://dandy-562fc-default-rtdb.europe-west1.firebasedatabase.app'
  });
}

async function authenticateAdmin(request) {
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }
  const idToken = authHeader.substring(7).trim();
  if (!idToken) return null;

  try {
    const app = getAdminApp();
    const adminAuth = getAuth(app);
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (decoded && decoded.email && decoded.email.toLowerCase() === 'admin@dandy.com') {
      return decoded;
    }
  } catch (err) {
    console.warn('[PinkFriday Admin API] Auth verification failed:', err.message);
  }
  return null;
}

export async function GET({ request }) {
  const admin = await authenticateAdmin(request);
  if (!admin) {
    return new Response(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const app = getAdminApp();
    const adminDb = getDatabase(app);

    const snap = await adminDb.ref('settings/pinkFriday').once('value');
    let data = snap.val();

    if (!data || !data.campaigns) {
      // Bootstrap 2026 default baseline into RTDB (strictly fail-closed enabled: false)
      const baseline = { ...INITIAL_2026_CAMPAIGN, enabled: false };
      const nowIso = new Date().toISOString();
      const bootstrapData = {
        currentYear: 2026,
        campaigns: {
          'pink-friday-2026': {
            ...baseline,
            draft: { ...baseline, updatedAt: nowIso },
            published: { ...baseline, publishedAt: nowIso }
          }
        },
        publishedActiveCampaign: {
          ...baseline,
          publishedAt: nowIso
        }
      };

      await adminDb.ref('settings/pinkFriday').set(bootstrapData);
      invalidatePinkFridayCache();
      data = bootstrapData;
    }

    return new Response(JSON.stringify({
      success: true,
      currentYear: data.currentYear || 2026,
      campaigns: data.campaigns || {},
      publishedActiveCampaign: data.publishedActiveCampaign || null
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[PinkFriday Admin API GET] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function POST({ request }) {
  const admin = await authenticateAdmin(request);
  if (!admin) {
    return new Response(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json();
    const { action, year, campaignData } = body;

    const app = getAdminApp();
    const adminDb = getDatabase(app);
    let adminFs;
    try {
      adminFs = getFirestore(app);
    } catch (e) {
      // Optional firestore logger
    }

    const campaignYear = Number(year) || 2026;
    const campaignId = `pink-friday-${campaignYear}`;

    if (action === 'save_draft') {
      if (!campaignData || typeof campaignData !== 'object') {
        return new Response(JSON.stringify({ success: false, error: 'INVALID_PAYLOAD' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const startAt = campaignData.startAt || campaignData.startDate || null;
      const endAt = campaignData.endAt || campaignData.endDate || null;

      const normalizedOffers = await enrichNormalizedOffers(campaignData.offers, adminDb);

      const rawCollections = campaignData.collections;
      const collectionsList = Array.isArray(rawCollections)
        ? rawCollections
        : (rawCollections && typeof rawCollections === 'object' ? Object.values(rawCollections) : []);

      const normalizedCollections = collectionsList.filter(Boolean).map(col => ({
        ...col,
        allowDuplicates: Boolean(col.allowDuplicates),
        active: col.active !== false && col.active !== 'false' && col.active !== 0,
        items: Array.isArray(col.items)
          ? col.items
          : (col.items && typeof col.items === 'object' ? Object.values(col.items) : [])
      }));

      const normalizedI18n = normalizeCampaignI18n(campaignData.i18n);

      const draftPayload = {
        ...campaignData,
        id: campaignId,
        year: campaignYear,
        enabled: campaignData.enabled === true,
        startAt,
        startDate: startAt,
        endAt,
        endDate: endAt,
        offers: normalizedOffers,
        collections: normalizedCollections,
        ...(normalizedI18n ? { i18n: normalizedI18n } : {}),
        updatedAt: new Date().toISOString(),
        updatedBy: admin.email
      };

      await adminDb.ref(`settings/pinkFriday/campaigns/${campaignId}/draft`).set(draftPayload);
      await adminDb.ref(`settings/pinkFriday/campaigns/${campaignId}/meta`).update({
        id: campaignId,
        year: campaignYear,
        updatedAt: new Date().toISOString()
      });
      invalidatePinkFridayCache();

      // Log activity to Firestore change_logs if available
      if (adminFs) {
        try {
          await adminFs.collection('change_logs').add({
            adminEmail: admin.email,
            action: `تحديث مسودة حملة Pink Friday لسنة ${campaignYear}`,
            timestamp: FieldValue.serverTimestamp()
          });
        } catch (fsErr) {
          console.warn('[change_logs] Error writing log:', fsErr.message);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'تم حفظ المسودة بنجاح دون التأثير على النسخة المنشورة',
        draft: draftPayload
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (action === 'publish') {
      let draft = campaignData;
      if (!draft || typeof draft !== 'object') {
        const draftSnap = await adminDb.ref(`settings/pinkFriday/campaigns/${campaignId}/draft`).once('value');
        draft = draftSnap.val();
      }

      if (!draft) {
        return new Response(JSON.stringify({ success: false, error: 'DRAFT_NOT_FOUND' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const startAt = draft.startAt || draft.startDate;
      const endAt = draft.endAt || draft.endDate;

      // Check dates
      if (!startAt || !endAt || Date.parse(startAt) >= Date.parse(endAt)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'INVALID_DATES',
          message: 'لا يمكن النشر: تواريخ بداية ونهاية الحملة غير صحيحة'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const normalizedOffers = await enrichNormalizedOffers(draft.offers, adminDb);

      const rawCollections = draft.collections;
      const collectionsList = Array.isArray(rawCollections)
        ? rawCollections
        : (rawCollections && typeof rawCollections === 'object' ? Object.values(rawCollections) : []);

      const normalizedCollections = collectionsList.filter(Boolean).map(col => ({
        ...col,
        allowDuplicates: Boolean(col.allowDuplicates),
        active: col.active !== false && col.active !== 'false' && col.active !== 0,
        items: Array.isArray(col.items)
          ? col.items
          : (col.items && typeof col.items === 'object' ? Object.values(col.items) : [])
      }));

      const normalizedI18n = normalizeCampaignI18n(draft.i18n);
      const nowIso = new Date().toISOString();

      const publishedPayload = {
        ...draft,
        id: campaignId,
        year: campaignYear,
        enabled: draft.enabled === true,
        unpublished: false,
        unpublishedAt: null,
        unpublishedBy: null,
        startAt,
        startDate: startAt,
        endAt,
        endDate: endAt,
        offers: normalizedOffers,
        collections: normalizedCollections,
        ...(normalizedI18n ? { i18n: normalizedI18n } : {}),
        publishedAt: nowIso,
        publishedBy: admin.email,
        updatedAt: nowIso,
        updatedBy: admin.email
      };

      // Keep draft in sync
      await adminDb.ref(`settings/pinkFriday/campaigns/${campaignId}/draft`).set(publishedPayload);

      // 1. Save published under campaign year
      await adminDb.ref(`settings/pinkFriday/campaigns/${campaignId}/published`).set(publishedPayload);

      // 2. Publish as the active campaign snapshot for customer storefront
      await adminDb.ref('settings/pinkFriday/publishedActiveCampaign').set(publishedPayload);
      await adminDb.ref('settings/pinkFriday/currentYear').set(campaignYear);
      invalidatePinkFridayCache();

      if (adminFs) {
        try {
          await adminFs.collection('change_logs').add({
            adminEmail: admin.email,
            action: `اعتماد ونشر حملة Pink Friday لسنة ${campaignYear}`,
            timestamp: FieldValue.serverTimestamp()
          });
        } catch (fsErr) {
          console.warn('[change_logs] Error writing log:', fsErr.message);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        message: publishedPayload.enabled
          ? `تم اعتماد ونشر حملة Pink Friday ${campaignYear} بنجاح`
          : `تم نشر حالة إيقاف الحملة لسنة ${campaignYear} على المتجر بنجاح`,
        published: publishedPayload,
        draft: publishedPayload
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (action === 'unpublish') {
      const nowIso = new Date().toISOString();
      const [liveSnap, pubSnap, draftSnap] = await Promise.all([
        adminDb.ref('settings/pinkFriday/publishedActiveCampaign').once('value'),
        adminDb.ref(`settings/pinkFriday/campaigns/${campaignId}/published`).once('value'),
        adminDb.ref(`settings/pinkFriday/campaigns/${campaignId}/draft`).once('value')
      ]);

      const baseLive = liveSnap.val() || pubSnap.val() || draftSnap.val() || {
        ...INITIAL_2026_CAMPAIGN,
        id: campaignId,
        year: campaignYear
      };

      const unpublishedPayload = {
        ...baseLive,
        id: baseLive.id || campaignId,
        year: Number(baseLive.year) || campaignYear,
        enabled: false,
        unpublished: true,
        unpublishedAt: nowIso,
        unpublishedBy: admin.email,
        updatedAt: nowIso,
        updatedBy: admin.email
      };

      const draftBase = draftSnap.val() || unpublishedPayload;
      const updatedDraft = {
        ...draftBase,
        enabled: false,
        unpublished: true,
        unpublishedAt: nowIso,
        unpublishedBy: admin.email,
        updatedAt: nowIso,
        updatedBy: admin.email
      };

      await Promise.all([
        adminDb.ref('settings/pinkFriday/publishedActiveCampaign').set(unpublishedPayload),
        adminDb.ref(`settings/pinkFriday/campaigns/${campaignId}/published`).set(unpublishedPayload),
        adminDb.ref(`settings/pinkFriday/campaigns/${campaignId}/draft`).set(updatedDraft)
      ]);
      invalidatePinkFridayCache();

      if (adminFs) {
        try {
          await adminFs.collection('change_logs').add({
            adminEmail: admin.email,
            action: `إيقاف وإلغاء نشر حملة Pink Friday لسنة ${campaignYear} فوراً`,
            timestamp: FieldValue.serverTimestamp()
          });
        } catch (fsErr) {
          console.warn('[change_logs] Error writing log:', fsErr.message);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'تم إيقاف الحملة وإلغاء نشرها على المتجر فوراً',
        published: unpublishedPayload,
        draft: updatedDraft
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (action === 'restore_published') {
      const pubSnap = await adminDb.ref(`settings/pinkFriday/campaigns/${campaignId}/published`).once('value');
      const published = pubSnap.val();

      if (!published) {
        return new Response(JSON.stringify({
          success: false,
          error: 'NO_PUBLISHED_VERSION',
          message: 'لا توجد نسخة منشورة سابقة لاستعادتها'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const restoredDraft = {
        ...published,
        enabled: published.enabled === true && published.unpublished !== true,
        updatedAt: new Date().toISOString(),
        updatedBy: admin.email
      };

      await adminDb.ref(`settings/pinkFriday/campaigns/${campaignId}/draft`).set(restoredDraft);
      invalidatePinkFridayCache();

      return new Response(JSON.stringify({
        success: true,
        message: 'تمت استعادة آخر نسخة منشورة إلى المسودة',
        draft: restoredDraft
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (action === 'create_year') {
      const targetYear = Number(body.targetYear);
      if (!targetYear || targetYear < 2026 || targetYear > 2099) {
        return new Response(JSON.stringify({ success: false, error: 'INVALID_YEAR' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const newCampaignId = `pink-friday-${targetYear}`;
      const copyFromYear = body.copyFromYear ? Number(body.copyFromYear) : null;
      let baseTemplate = { ...INITIAL_2026_CAMPAIGN };

      if (copyFromYear) {
        const sourceSnap = await adminDb.ref(`settings/pinkFriday/campaigns/pink-friday-${copyFromYear}/published`).once('value');
        const sourceData = sourceSnap.val();
        if (sourceData) {
          baseTemplate = {
            ...sourceData,
            enabled: false // New year defaults to disabled until confirmed
          };
        }
      }

      // Default new dates to targetYear November
      const newStartAt = `${targetYear}-11-06T00:00:00+02:00`;
      const newEndAt = `${targetYear}-11-30T23:59:59+02:00`;

      const newCampaignData = {
        ...baseTemplate,
        id: newCampaignId,
        year: targetYear,
        startAt: newStartAt,
        endAt: newEndAt,
        enabled: false,
        updatedAt: new Date().toISOString(),
        updatedBy: admin.email
      };

      await adminDb.ref(`settings/pinkFriday/campaigns/${newCampaignId}`).set({
        id: newCampaignId,
        year: targetYear,
        draft: newCampaignData,
        published: null
      });

      return new Response(JSON.stringify({
        success: true,
        message: `تم إنشاء حملة Pink Friday لسنة ${targetYear} بنجاح`,
        campaignId: newCampaignId,
        year: targetYear
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'UNKNOWN_ACTION' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[PinkFriday Admin API POST] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
