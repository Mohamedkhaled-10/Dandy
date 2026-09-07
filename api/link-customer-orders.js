// api/link-customer-orders.js
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { idToken, phone } = body;

    if (!idToken) {
      return res.status(400).json({ error: 'Missing idToken' });
    }

    if (!phone) {
      return res.status(400).json({ error: 'Missing phone' });
    }

    const app = getAdminApp();
    const adminAuth = getAuth(app);
    const adminDb = getDatabase(app);

    // التحقق الصارم من صحة توكن المستخدم واستخراج uid الآمن
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    if (!uid) {
      return res.status(401).json({ error: 'Invalid token or missing uid' });
    }

    // تنظيف وتجهيز صيغ أرقام الهاتف المختلفة (01xxxxxxxxx أو +201xxxxxxxxx)
    const phoneStr = String(phone).trim();
    const cleanDigits = phoneStr.replace(/\D/g, '');
    const phoneVariants = new Set();
    phoneVariants.add(phoneStr);
    if (phoneStr.startsWith('+20')) {
      phoneVariants.add('0' + phoneStr.slice(3));
      phoneVariants.add(phoneStr.slice(3));
    } else if (phoneStr.startsWith('0')) {
      phoneVariants.add('+2' + phoneStr);
      phoneVariants.add('+20' + phoneStr.slice(1));
      phoneVariants.add(phoneStr.slice(1));
    } else if (cleanDigits.length === 10) {
      phoneVariants.add('0' + cleanDigits);
      phoneVariants.add('+20' + cleanDigits);
    }

    let linkedCount = 0;
    const processedOrderIds = new Set();

    for (const variant of phoneVariants) {
      const snap = await adminDb.ref('orders').orderByChild('phone').equalTo(variant).once('value');
      if (snap.exists()) {
        const orders = snap.val();
        for (const [orderId, orderData] of Object.entries(orders)) {
          if (!processedOrderIds.has(orderId)) {
            processedOrderIds.add(orderId);
            // ربط الطلب فقط إذا لم يكن يملك customerId بالفعل
            if (!orderData?.customerId) {
              await adminDb.ref(`orders/${orderId}/customerId`).set(uid);
              linkedCount++;
            }
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      linkedCount,
      message: `تم ربط ${linkedCount} طلب/طلبات بحساب العميل بنجاح`
    });

  } catch (error) {
    console.error('Error in link-customer-orders handler:', error);
    return res.status(500).json({
      error: 'Failed to link customer orders',
      message: error.message
    });
  }
}
