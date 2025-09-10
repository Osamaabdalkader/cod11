// orders.js - الإصدار الكامل
import { 
  auth, database,
  ref, onValue, update,
  onAuthStateChanged
} from './firebase.js';

// عناصر DOM
const ordersContainer = document.getElementById('orders-container');
const filterBtns = document.querySelectorAll('.filter-btn');
const adminIcon = document.getElementById('admin-icon');

// متغيرات النظام
let currentUserData = null;
let currentOrders = [];
let ordersListener = null;

// تحميل البيانات عند بدء التحميل
document.addEventListener('DOMContentLoaded', () => {
    checkAuthState();
    setupEventListeners();
});

// التحقق من حالة المصادقة
function checkAuthState() {
    onAuthStateChanged(auth, user => {
        if (!user) {
            window.location.href = 'auth.html';
            return;
        }
        
        // تحميل بيانات المستخدم الحالي
        const userRef = ref(database, 'users/' + user.uid);
        onValue(userRef, (snapshot) => {
            if (snapshot.exists()) {
                currentUserData = snapshot.val();
                currentUserData.uid = user.uid;
                
                if (currentUserData.isAdmin) {
                    adminIcon.style.display = 'flex';
                    loadOrders('all');
                } else {
                    window.location.href = 'index.html';
                }
            }
        });
    });
}

// إعداد مستمعي الأحداث
function setupEventListeners() {
    // فلاتر الطلبات
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadOrders(btn.dataset.filter);
        });
    });
}

// تحميل الطلبات للإدارة
function loadOrders(filter = 'all') {
    if (!currentUserData || !currentUserData.isAdmin) return;
    
    const ordersRef = ref(database, 'orders');
    
    // إزالة المستمع السابق إذا كان موجوداً
    if (ordersListener) {
        ordersListener();
    }
    
    ordersContainer.innerHTML = '<div class="loading-text">جاري تحميل الطلبات...</div>';
    
    ordersListener = onValue(ordersRef, (snapshot) => {
        ordersContainer.innerHTML = '';
        currentOrders = [];
        
        if (snapshot.exists()) {
            const orders = snapshot.val();
            const postsMap = new Map(); // تجميع الطلبات حسب المنشور
            
            // تحويل الطلبات إلى مصفوفة وتجميعها حسب المنشور
            Object.keys(orders).forEach(orderId => {
                const order = {
                    id: orderId,
                    ...orders[orderId]
                };
                
                // تطبيق الفلتر
                if (filter === 'all' || order.status === filter) {
                    if (!postsMap.has(order.postId)) {
                        postsMap.set(order.postId, {
                            postId: order.postId,
                            postTitle: order.postTitle,
                            postPrice: order.postPrice,
                            postImage: order.postImage,
                            orders: [],
                            createdAt: order.createdAt
                        });
                    }
                    
                    const postData = postsMap.get(order.postId);
                    postData.orders.push(order);
                    
                    // تحديث الوقت لأحدث طلب
                    if (!postData.createdAt || order.createdAt > postData.createdAt) {
                        postData.createdAt = order.createdAt;
                    }
                }
            });
            
            // تحويل Map إلى مصفوفة وترتيبها حسب الأحدث
            const postsArray = Array.from(postsMap.values());
            postsArray.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            
            // عرض الطلبات المجمعة
            if (postsArray.length > 0) {
                postsArray.forEach(postData => {
                    createPostOrderItem(postData);
                });
            } else {
                ordersContainer.innerHTML = '<p class="no-orders">لا توجد طلبات</p>';
            }
        } else {
            ordersContainer.innerHTML = '<p class="no-orders">لا توجد طلبات</p>';
        }
    });
}

// إنشاء عنصر طلب مجمع حسب المنشور
function createPostOrderItem(postData) {
    const orderElement = document.createElement('div');
    orderElement.className = 'order-item';
    orderElement.dataset.postId = postData.postId;
    
    // حساب عدد الطلبات والحالات
    const pendingCount = postData.orders.filter(o => o.status === 'pending').length;
    const approvedCount = postData.orders.filter(o => o.status === 'approved').length;
    const rejectedCount = postData.orders.filter(o => o.status === 'rejected').length;
    
    orderElement.innerHTML = `
        <div class="order-header">
            <h3 class="order-title">${postData.postTitle}</h3>
            <span class="order-count">${postData.orders.length} طلب</span>
        </div>
        <div class="order-meta">
            <span class="order-price">${postData.postPrice || 'غير محدد'}</span>
            <div class="order-statuses">
                ${pendingCount > 0 ? `<span class="status-badge status-pending">${pendingCount}</span>` : ''}
                ${approvedCount > 0 ? `<span class="status-badge status-approved">${approvedCount}</span>` : ''}
                ${rejectedCount > 0 ? `<span class="status-badge status-rejected">${rejectedCount}</span>` : ''}
            </div>
        </div>
    `;
    
    orderElement.addEventListener('click', () => {
        showPostOrders(postData);
    });
    
    ordersContainer.appendChild(orderElement);
}

// عرض طلبات منشور معين
function showPostOrders(postData) {
    // حفظ طلبات المنشور الحالي
    window.currentPostOrders = postData;
    
    // إنشاء محتوى عرض الطلبات
    ordersContainer.innerHTML = '';
    
    // إضافة زر العودة
    const backButton = document.createElement('button');
    backButton.className = 'btn back-btn';
    backButton.innerHTML = '<i class="fas fa-arrow-right"></i> العودة';
    backButton.addEventListener('click', () => {
        loadOrders(document.querySelector('.filter-btn.active').dataset.filter);
    });
    ordersContainer.appendChild(backButton);
    
    // عرض عنوان المنشور
    const postHeader = document.createElement('div');
    postHeader.className = 'post-orders-header';
    postHeader.innerHTML = `
        <h3>طلبات المنشور: ${postData.postTitle}</h3>
        <p>إجمالي الطلبات: ${postData.orders.length}</p>
    `;
    ordersContainer.appendChild(postHeader);
    
    // عرض الطلبات الفردية
    if (postData.orders.length > 0) {
        // ترتيب الطلبات حسب الأحدث
        postData.orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        
        postData.orders.forEach(order => {
            createIndividualOrderItem(order);
        });
    } else {
        ordersContainer.innerHTML += '<p class="no-orders">لا توجد طلبات لهذا المنشور</p>';
    }
}

// إنشاء عنصر طلب فردي
function createIndividualOrderItem(order) {
    const orderElement = document.createElement('div');
    orderElement.className = 'order-item individual-order';
    orderElement.dataset.orderId = order.id;
    
    // تنسيق حالة الطلب
    let statusClass = 'status-pending';
    let statusText = 'قيد الانتظار';
    
    if (order.status === 'approved') {
        statusClass = 'status-approved';
        statusText = 'مقبول';
    } else if (order.status === 'rejected') {
        statusClass = 'status-rejected';
        statusText = 'مرفوض';
    }
    
    orderElement.innerHTML = `
        <div class="order-header">
            <h3 class="order-title">طلب من مستخدم</h3>
            <span class="order-status ${statusClass}">${statusText}</span>
        </div>
        <div class="order-meta">
            <span class="order-date">${formatDate(order.createdAt)}</span>
        </div>
    `;
    
    orderElement.addEventListener('click', () => {
        showOrderDetail(order);
    });
    
    ordersContainer.appendChild(orderElement);
}

// عرض تفاصيل الطلب
async function showOrderDetail(order) {
    // حفظ الطلب الحالي للانتقال إلى صفحة التفاصيل
    localStorage.setItem('currentOrder', JSON.stringify(order));
    window.location.href = 'order-detail.html';
}

// وظائف مساعدة
function formatDate(timestamp) {
    if (!timestamp) return 'غير معروف';
    
    try {
        // إذا كان timestamp كائن Firebase، نحوله إلى رقم
        const date = typeof timestamp === 'object' ? 
            new Date(timestamp.seconds * 1000) : 
            new Date(timestamp);
            
        return date.toLocaleDateString('ar-EG', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        console.error('Error formatting date:', error);
        return 'غير معروف';
    }
                       }
