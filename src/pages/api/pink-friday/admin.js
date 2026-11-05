export const prerender = false;

// src/pages/api/pink-friday/admin.js
// Protected Admin API for Dandy Pink Friday Annual Campaign Management
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { INITIAL_2026_CAMPAIGN } from '../../../utils/pink-friday-server.ts';

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
      // Bootstrap 2026 default baseline into RTDB
      const bootstrapData = {
        currentYear: 2026,
        campaigns: {
          'pink-friday-2026': {
            ...INITIAL_2026_CAMPAIGN,
            draft: { ...INITIAL_2026_CAMPAIGN, updatedAt: new Date().toISOString() },
            published: { ...INITIAL_2026_CAMPAIGN, publishedAt: new Date().toISOString() }
          }
        },
        publishedActiveCampaign: {
          ...INITIAL_2026_CAMPAIGN,
          publishedAt: new Date().toISOString()
        }
      };

      await adminDb.ref('settings/pinkFriday').set(bootstrapData);
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

      const draftPayload = {
        ...campaignData,
        id: campaignId,
        year: campaignYear,
        updatedAt: new Date().toISOString(),
        updatedBy: admin.email
      };

      await adminDb.ref(`settings/pinkFriday/campaigns/${campaignId}/draft`).set(draftPayload);
      await adminDb.ref(`settings/pinkFriday/campaigns/${campaignId}/meta`).update({
        id: campaignId,
        year: campaignYear,
        updatedAt: new Date().toISOString()
      });

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
      const draftSnap = await adminDb.ref(`settings/pinkFriday/campaigns/${campaignId}/draft`).once('value');
      const draft = draftSnap.val();

      if (!draft) {
        return new Response(JSON.stringify({ success: false, error: 'DRAFT_NOT_FOUND' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Check dates
      if (!draft.startAt || !draft.endAt || Date.parse(draft.startAt) >= Date.parse(draft.endAt)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'INVALID_DATES',
          message: 'لا يمكن النشر: تواريخ بداية ونهاية الحملة غير صحيحة'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const publishedPayload = {
        ...draft,
        publishedAt: new Date().toISOString(),
        publishedBy: admin.email
      };

      // 1. Save published under campaign year
      await adminDb.ref(`settings/pinkFriday/campaigns/${campaignId}/published`).set(publishedPayload);

      // 2. Publish as the active campaign snapshot for customer storefront
      await adminDb.ref('settings/pinkFriday/publishedActiveCampaign').set(publishedPayload);
      await adminDb.ref('settings/pinkFriday/currentYear').set(campaignYear);

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
        message: `تم اعتماد ونشر حملة Pink Friday ${campaignYear} بنجاح`,
        published: publishedPayload
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
        updatedAt: new Date().toISOString(),
        updatedBy: admin.email
      };

      await adminDb.ref(`settings/pinkFriday/campaigns/${campaignId}/draft`).set(restoredDraft);

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
