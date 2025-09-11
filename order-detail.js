// order-detail.js - الإصدار الكامل
import { 
  auth, database,
  ref, onValue, update,
  onAuthStateChanged
} from './firebase.js';

// عناصر DOM
const orderDetailContent = document.getElementById('order-detail-content');
const orderActions = document.getElementById('order-actions');
const adminIcon = document.getElementById('admin-icon');

// متغيرات النظام
let currentUserData = null;
let currentOrder = null;

// تحميل البيانات عند بدء التحميل
document.addEventListener('DOMContentLoaded', () => {
    checkAuthState();
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
                    loadOrderDetails();
                } else {
                    window.location.href = 'index.html';
                }
            }
        });
    });
}

// تحميل تفاصيل الطلب
function loadOrderDetails() {
    const orderData = JSON.parse(localStorage.getItem('currentOrder'));
    
    if (!orderData) {
        orderDetailContent.innerHTML = '<p class="error">لم يتم العثور على بيانات الطلب</p>';
        setTimeout(() => {
            window.location.href = 'orders.html';
        }, 2000);
        return;
    }
    
    currentOrder = orderData;
    showOrderDetail(orderData);
}

// عرض تفاصيل الطلب
async function showOrderDetail(order) {
    currentOrder = order;
    
    // جلب بيانات المشتري والبائع
    const buyerRef = ref(database, 'users/' + order.buyerId);
    const sellerRef = ref(database, 'users/' + order.sellerId);
    
    const [buyerSnapshot, sellerSnapshot] = await Promise.all([
        new Promise(resolve => onValue(buyerRef, resolve, { onlyOnce: true })),
        new Promise(resolve => onValue(sellerRef, resolve, { onlyOnce: true }))
    ]);
    
    const buyerData = buyerSnapshot.exists() ? buyerSnapshot.val() : { name: 'غير معروف', phone: 'غير معروف', email: 'غير معروف' };
    const sellerData = sellerSnapshot.exists() ? sellerSnapshot.val() : { name: 'غير معروف', phone: 'غير معروف', email: 'غير معروف' };
    
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
    
    // إنشاء محتوى تفاصيل الطلب
    orderDetailContent.innerHTML = `
        <button class="btn back-btn" id="back-to-orders">
            <i class="fas fa-arrow-right"></i> العودة إلى الطلبات
        </button>
        
        <div class="order-detail-section">
            <h3>معلومات المنتج</h3>
            ${order.postImage ? `<img src="${order.postImage}" alt="${order.postTitle}" class="product-image">` : ''}
            <div class="order-detail-item">
                <span class="order-detail-label">اسم المنتج:</span>
                <span class="order-detail-value">${order.postTitle}</span>
            </div>
            <div class="order-detail-item">
                <span class="order-detail-label">وصف المنتج:</span>
                <span class="order-detail-value">${order.postDescription || 'غير متوفر'}</span>
            </div>
            <div class="order-detail-item">
                <span class="order-detail-label">سعر المنتج:</span>
                <span class="order-detail-value">${order.postPrice || 'غير محدد'}</span>
            </div>
            <div class="order-detail-item">
                <span class="order-detail-label">نوع المنتج:</span>
                <span class="order-detail-value">${order.postCategory || 'غير محدد'}</span>
            </div>
            <div class="order-detail-item">
                <span class="order-detail-label">موقع المنتج:</span>
                <span class="order-detail-value">${order.postLocation || 'غير محدد'}</span>
            </div>
            <div class="order-detail-item">
                <span class="order-detail-label">معرف المنتج:</span>
                <span class="order-detail-value">${order.postId}</span>
            </div>
        </div>
        
        <div class="order-detail-section">
            <h3>معلومات الطلب</h3>
            <div class="order-detail-item">
                <span class="order-detail-label">حالة الطلب:</span>
                <span class="order-detail-value ${statusClass}">${statusText}</span>
            </div>
            <div class="order-detail-item">
                <span class="order-detail-label">تاريخ الطلب:</span>
                <span class="order-detail-value">${formatDate(order.createdAt)}</span>
            </div>
        </div>
        
        <div class="order-detail-section">
            <h3>معلومات المشتري</h3>
            <div class="order-detail-item">
                <span class="order-detail-label">الاسم:</span>
                <span class="order-detail-value">${buyerData.name || 'غير معروف'}</span>
            </div>
            <div class="order-detail-item">
                <span class="order-detail-label">الهاتف:</span>
                <span class="order-detail-value">${buyerData.phone || 'غير معروف'}</span>
            </div>
            <div class="order-detail-item">
                <span class="order-detail-label">البريد الإلكتروني:</span>
                <span class="order-detail-value">${buyerData.email || 'غير معروف'}</span>
            </div>
        </div>
        
        <div class="order-detail-section">
            <h3>معلومات البائع</h3>
            <div class="order-detail-item">
                <span class="order-detail-label">الاسم:</span>
                <span class="order-detail-value">${sellerData.name || 'غير معروف'}</span>
            </div>
            <div class="order-detail-item">
                <span class="order-detail-label">الهاتف:</span>
                <span class="order-detail-value">${sellerData.phone || 'غير معروف'}</span>
            </div>
            <div class="order-detail-item">
                <span class="order-detail-label">البريد الإلكتروني:</span>
                <span class="order-detail-value">${sellerData.email || 'غير معروف'}</span>
            </div>
        </div>
    `;
    
    // إضافة أزرار التحكم
    orderActions.innerHTML = '';
    
    if (order.status === 'pending') {
        const approveBtn = document.createElement('button');
        approveBtn.className = 'btn btn-success';
        approveBtn.innerHTML = '<i class="fas fa-check"></i> قبول الطلب';
        approveBtn.addEventListener('click', approveOrder);
        
        const rejectBtn = document.createElement('button');
        rejectBtn.className = 'btn btn-danger';
        rejectBtn.innerHTML = '<i class="fas fa-times"></i> رفض الطلب';
        rejectBtn.addEventListener('click', rejectOrder);
        
        orderActions.appendChild(approveBtn);
        orderActions.appendChild(rejectBtn);
    }
    
    const chatWithBuyerBtn = document.createElement('button');
    chatWithBuyerBtn.className = 'btn btn-primary';
    chatWithBuyerBtn.innerHTML = '<i class="fas fa-comment"></i> مراسلة المشتري';
    chatWithBuyerBtn.addEventListener('click', () => chatWithUser(order.buyerId, 'المشتري'));
    
    const chatWithSellerBtn = document.createElement('button');
    chatWithSellerBtn.className = 'btn btn-primary';
    chatWithSellerBtn.innerHTML = '<i class="fas fa-comment"></i> مراسلة البائع';
    chatWithSellerBtn.addEventListener('click', () => chatWithUser(order.sellerId, 'البائع'));
    
    const addPointsBuyerBtn = document.createElement('button');
    addPointsBuyerBtn.className = 'btn btn-secondary';
    addPointsBuyerBtn.innerHTML = '<i class="fas fa-coins"></i> إضافة نقاط للمشتري';
    addPointsBuyerBtn.addEventListener('click', () => addPointsToUser(order.buyerId, 'المشتري'));
    
    const addPointsSellerBtn = document.createElement('button');
    addPointsSellerBtn.className = 'btn btn-secondary';
    addPointsSellerBtn.innerHTML = '<i class="fas fa-coins"></i> إضافة نقاط للبائع';
    addPointsSellerBtn.addEventListener('click', () => addPointsToUser(order.sellerId, 'البائع'));
    
    orderActions.appendChild(chatWithBuyerBtn);
    orderActions.appendChild(chatWithSellerBtn);
    orderActions.appendChild(addPointsBuyerBtn);
    orderActions.appendChild(addPointsSellerBtn);
    
    // إضافة مستمع حدث للزر العودة
    document.getElementById('back-to-orders').addEventListener('click', () => {
        window.location.href = 'orders.html';
    });
}

// قبول الطلب
async function approveOrder() {
    if (!currentOrder) return;
    
    try {
        await update(ref(database, 'orders/' + currentOrder.id), {
            status: 'approved',
            processedAt: Date.now(),
            processedBy: auth.currentUser.uid
        });
        
        alert('تم قبول الطلب بنجاح');
        window.location.href = 'orders.html';
    } catch (error) {
        console.error('Error approving order:', error);
        alert('حدث خطأ أثناء قبول الطلب. يرجى المحاولة مرة أخرى.');
    }
}

// رفض الطلب
async function rejectOrder() {
    if (!currentOrder) return;
    
    try {
        await update(ref(database, 'orders/' + currentOrder.id), {
            status: 'rejected',
            processedAt: Date.now(),
            processedBy: auth.currentUser.uid
        });
        
        alert('تم رفض الطلب بنجاح');
        window.location.href = 'orders.html';
    } catch (error) {
        console.error('Error rejecting order:', error);
        alert('حدث خطأ أثناء رفض الطلب. يرجى المحاولة مرة أخرى.');
    }
}

// التحدث مع مستخدم
function chatWithUser(userId, userType) {
    // حفظ بيانات المحادثة
    const chatData = {
        userId: userId,
        userType: userType,
        isPrivateChat: true
    };
    
    localStorage.setItem('privateChat', JSON.stringify(chatData));
    window.location.href = 'messages.html';
}

// إضافة نقاط للمستخدم
function addPointsToUser(userId, userType) {
    const points = prompt(`يرجى إدخال عدد النقاط التي ترغب في إضافتها لـ ${userType}:`);
    
    if (points && !isNaN(points) && parseInt(points) > 0) {
        // هنا سيتم استدعاء دالة إضافة النقاط من Firebase
        alert(`سيتم إضافة ${points} نقطة لـ ${userType}`);
        // addPointsToUser(userId, parseInt(points), auth.currentUser.uid);
    } else if (points !== null) {
        alert('يرجى إدخال عدد صحيح موجب من النقاط');
    }
}

// وظائف مساعدة
function formatDate(timestamp) {
    if (!timestamp) return 'غير معروف';
    
    try {
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
