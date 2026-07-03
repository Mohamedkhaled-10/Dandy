// auth-guard.js - نظام حماية وتوجيه لوحة التحكم حسب الصلاحيات

// ننتظر حتى يتم تحميل محتوى الصفحة بالكامل
document.addEventListener("DOMContentLoaded", () => {
    // إخفاء محتوى الصفحة مؤقتاً لتجنب ظهور أي بيانات قبل التحقق من الصلاحية
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.3s ease';

    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            // جلب صلاحيات المستخدم من Firestore
            firebase.firestore().collection('admins').doc(user.uid).get()
                .then((doc) => {
                    if (doc.exists) {
                        const role = doc.data().role;
                        enforcePermissions(role);
                        // إظهار الصفحة بعد انتهاء التحقق
                        document.body.style.opacity = '1';
                    } else {
                        // الحساب مسجل دخول لكن ليس له صلاحيات إدارية
                        alert('عذراً، هذا الحساب غير مصرح له بدخول اللوحة.');
                        firebase.auth().signOut().then(() => {
                            window.location.href = 'login.html';
                        });
                    }
                })
                .catch((error) => {
                    console.error("خطأ في التحقق من الصلاحيات:", error);
                    window.location.href = 'login.html';
                });
        } else {
            // غير مسجل دخول
            window.location.href = 'login.html';
        }
    });
});

function enforcePermissions(role) {
    const currentPage = window.location.pathname.toLowerCase();

    // 1. مدير النظام (Super Admin): صلاحية كاملة
    if (role === 'super_admin') {
        return; 
    }

    // 2. مدير الطلبات (Order Admin)
    if (role === 'order_admin') {
        // إخفاء الروابط غير المصرح بها (يتم فحص وجود العنصر أولاً لتجنب الأخطاء)
        const restrictedNavs = ['nav-products', 'nav-blog', 'nav-settings', 'nav-index'];
        restrictedNavs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // التوجيه الإجباري إذا حاول فتح صفحة غير مصرحة عبر الرابط
        if (currentPage.includes('product') || currentPage.includes('blog') || currentPage.includes('index')) {
            window.location.replace('dashboard-order.html');
        }
    }

    // 3. مدير المحتوى والمنتجات (Product Admin)
    if (role === 'product_admin') {
        // إخفاء روابط الطلبات والإعدادات
        const restrictedNavs = ['nav-orders', 'nav-settings'];
        restrictedNavs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // التوجيه الإجباري إذا حاول فتح الطلبات
        if (currentPage.includes('order')) {
            window.location.replace('dashboard-blog.html'); 
        }
    }
}