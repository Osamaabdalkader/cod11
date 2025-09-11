// app.js - الإصدار الكامل بعد التعديل
import { 
  auth, database, storage,
  onAuthStateChanged, signOut,
  ref, onValue, serverTimestamp, push, set, update, remove
} from './firebase.js';

// عناصر DOM
const postsContainer = document.getElementById('posts-container');
const loadingOverlay = document.getElementById('loading-overlay');
const uploadProgress = document.getElementById('upload-progress');
const notificationsIcon = document.getElementById('notifications-icon');
const profileHeaderIcon = document.getElementById('profile-header-icon');
const supportIcon = document.getElementById('support-icon');
const moreIcon = document.getElementById('more-icon');
const groupsIcon = document.getElementById('groups-icon');
const cartIcon = document.getElementById('cart-icon');


// متغيرات النظام
let currentUserData = null;
let adminUsers = [];
let currentPosts = [];
let currentFilter = {
    type: '',
    location: ''
};

// تحميل المنشورات عند بدء التحميل
document.addEventListener('DOMContentLoaded', () => {
    loadPosts();
    checkAuthState();
    initFiltersAndSearch();
    setupEventListeners();
});

// إعداد مستمعي الأحداث
function setupEventListeners() {
    // أيقونة الإشعارات
    if (notificationsIcon) {
        notificationsIcon.addEventListener('click', () => {
            alert('صفحة الإشعارات قيد التطوير');
        });
    }

    // أيقونة الملف الشخصي في الهيدر
    if (profileHeaderIcon) {
        profileHeaderIcon.addEventListener('click', () => {
            const user = auth.currentUser;
            if (user) {
                window.location.href = 'dashboard.html';
            } else {
                window.location.href = 'dashboard.html';
            }
        });
    }

    // أيقونة الجروبات
    if (groupsIcon) {
        groupsIcon.addEventListener('click', () => {
            const user = auth.currentUser;
            if (user) {
                // الانتقال إلى groups .html للمستخدم المسجل
                window.location.href = 'groups.html';
            } else {
                alert('يجب تسجيل الدخول أولاً للوصول إلى الرسائل');
                window.location.href = 'register.html';
            }
        });
    }
    
    // أيقونة السلة
    if (cartIcon) {
        cartIcon.addEventListener('click', () => {
            const user = auth.currentUser;
            if (user) {
                // الانتقال .carthtml للمستخدم المسجل
                window.location.href = 'cart.html';
            } else {
                alert('يجب تسجيل الدخول أولاً للوصول إلى الرسائل');
                window.location.href = 'login.html';
            }
        });
    }
    
    // أيقونة الدعم    
    if (supportIcon) {
        supportIcon.addEventListener('click', () => {
            const user = auth.currentUser;
            if (user) {
                // الانتقال إلى messages.html للمستخدم المسجل
                window.location.href = 'messages.html';
            } else {
                alert('يجب تسجيل الدخول أولاً للوصول إلى الرسائل');
                window.location.href = 'auth.html';
            }
        });
    }
    
    // أيقونة المزيد (
    if (moreIcon) {
        moreIcon.addEventListener('click', () => {
            const user = auth.currentUser;
            if (user && currentUserData && currentUserData.isAdmin) {
                // الانتقال إلى orders.html للمشرفين
                window.location.href = 'orders.html';
            } else if (user) {
                // الانتقال إلى more.html للمستخدمين العاديين
                window.location.href = 'more.html'; 
            } else {
                alert('يجب تسجيل الدخول أولاً');
                window.location.href = 'auth.html';
            }
        });
    }
                                           }

  
// التحقق من حالة المصادقة
function checkAuthState() {
    onAuthStateChanged(auth, user => {
        if (user) {
            // تحميل بيانات المستخدم الحالي
            const userRef = ref(database, 'users/' + user.uid);
            onValue(userRef, (snapshot) => {
                if (snapshot.exists()) {
                    currentUserData = snapshot.val();
                    currentUserData.uid = user.uid;
                    
                    
                    // تطبيق سمة المرتبة
                    applyRankTheme(currentUserData.rank || 0);
                    
                    // تحديث واجهة المستخدم
                    updateUIForLoggedInUser();
                    
                    // تحميل المشرفين
                    loadAdminUsers();
                }
            });
        } else {
            // المستخدم غير ممسجل
            updateUIForLoggedOutUser();
        }
    });
}

// تحميل المشرفين
function loadAdminUsers() {
    const usersRef = ref(database, 'users');
    onValue(usersRef, (snapshot) => {
        adminUsers = [];
        if (snapshot.exists()) {
            const users = snapshot.val();
            for (const userId in users) {
                if (users[userId].isAdmin) {
                    adminUsers.push(userId);
                }
            }
        }
    });
}

// تحميل المنشورات للجميع
function loadPosts() {
    showLoading();
    const postsRef = ref(database, 'posts');
    onValue(postsRef, (snapshot) => {
        postsContainer.innerHTML = '';
        currentPosts = [];
        
        if (snapshot.exists()) {
            const posts = snapshot.val();
            const postsArray = [];
            
            for (const postId in posts) {
                postsArray.push({ id: postId, ...posts[postId] });
            }
            
            // ترتيب المنشورات حسب التاريخ (الأحدث أولاً)
            postsArray.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            
            currentPosts = postsArray;
            
            // عرض المنشورات
            postsArray.forEach(post => {
                const postCard = createPostCard(post);
                postsContainer.appendChild(postCard);
            });
        } else {
            postsContainer.innerHTML = '<p class="no-posts">لا توجد منشورات بعد</p>';
        }
        hideLoading();
    }, {
        onlyOnce: true
    });
}

// إنشاء بطاقة منشور
function createPostCard(post) {
    const postCard = document.createElement('div');
    postCard.className = 'post-card';
    postCard.dataset.type = post.category || '';
    postCard.dataset.location = post.location || '';
    
    // تقييد الوصف إلى سطرين
    const shortDescription = post.description && post.description.length > 100 ? 
        post.description.substring(0, 100) + '...' : post.description;
    
    // حساب المدة المنقضية منذ النشر
    const timeAgo = formatTimeAgo(post.createdAt);
    
    postCard.innerHTML = `
        <div class="post-image">
            ${post.imageUrl ? `<img src="${post.imageUrl}" alt="${post.title}" loading="lazy">` : 
            `<div class="no-image"><i class="fas fa-image"></i></div>`}
        </div>
        <div class="post-content">
            <h3 class="post-title">${post.title}</h3>
            <p class="post-description">${shortDescription || 'لا يوجد وصف'}</p>
            
            <div class="post-details">
                ${post.location ? `
                    <div class="detail-item">
                        <i class="fas fa-map-marker-alt"></i>
                        <span class="detail-location">${post.location}</span>
                    </div>
                ` : ''}
                
                ${post.category ? `
                    <div class="detail-item">
                        <i class="fas fa-tag"></i>
                        <span class="detail-category">${post.category}</span>
                    </div>
                ` : ''}
                
                ${post.price ? `
                    <div class="detail-item">
                        <i class="fas fa-money-bill-wave"></i>
                        <span>${post.price}</span>
                    </div>
                ` : ''}
                
                <div class="detail-item">
                    <i class="fas fa-clock"></i>
                    <span>${timeAgo}</span>
                </div>
            </div>
            
            <div class="post-meta">
                <div class="post-time">
                    <i class="fas fa-calendar-alt"></i>
                    <span>${timeAgo}</span>
                </div>
                <div class="post-author">
                    <i class="fas fa-user-circle"></i>
                    <span>${post.authorName || 'مستخدم'}</span>
                </div>
            </div>
        </div>
    `;
    
    postCard.addEventListener('click', () => {
        // حفظ المنشور في localStorage والانتقال إلى صفحة التفاصيل
        localStorage.setItem('currentPost', JSON.stringify(post));
        window.location.href = 'post-detail.html';
    });
    
    return postCard;
}


// دالة لتطبيق سمة المرتبة
function applyRankTheme(rank) {
    document.body.classList.remove('rank-0', 'rank-1', 'rank-2', 'rank-3', 'rank-4', 
                                  'rank-5', 'rank-6', 'rank-7', 'rank-8', 'rank-9', 'rank-10');
    document.body.classList.add(`rank-${rank}`);
}




// تهيئة الفلاتر والبحث
function initFiltersAndSearch() {
    // البحث
    const searchInput = document.querySelector('.search-input');
    const searchBtn = document.querySelector('.search-btn');
    
    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', filterPosts);
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                filterPosts();
            }
        });
    }
    
    // الفلاتر
    const typeFilter = document.querySelector('.filter-category select');
    const locationFilter = document.querySelector('.filter-location select');
    
    if (typeFilter) {
        typeFilter.addEventListener('change', () => {
            currentFilter.type = typeFilter.value;
            filterPosts();
        });
    }
    
    if (locationFilter) {
        locationFilter.addEventListener('change', () => {
            currentFilter.location = locationFilter.value;
            filterPosts();
        });
    }
}

// فلترة المنشورات
function filterPosts() {
    const searchInput = document.querySelector('.search-input');
    const searchText = searchInput ? searchInput.value.toLowerCase() : '';
    const posts = document.querySelectorAll('.post-card');
    
    let visibleCount = 0;
    
    posts.forEach(post => {
        const title = post.querySelector('.post-title').textContent.toLowerCase();
        const description = post.querySelector('.post-description').textContent.toLowerCase();
        const type = post.dataset.type || '';
        const location = post.dataset.location || '';
        
        const matchesSearch = !searchText || 
                             title.includes(searchText) || 
                             description.includes(searchText);
        
        const matchesType = !currentFilter.type || type === currentFilter.type;
        const matchesLocation = !currentFilter.location || location === currentFilter.location;
        
        if (matchesSearch && matchesType && matchesLocation) {
            post.style.display = 'block';
            visibleCount++;
        } else {
            post.style.display = 'none';
        }
    });
    
    // إظهار رسالة إذا لم توجد نتائج
    const noResults = document.getElementById('no-results');
    if (visibleCount === 0 && posts.length > 0) {
        if (!noResults) {
            const noResultsMsg = document.createElement('p');
            noResultsMsg.id = 'no-results';
            noResultsMsg.className = 'no-posts';
            noResultsMsg.textContent = 'لا توجد نتائج تطابق بحثك';
            postsContainer.appendChild(noResultsMsg);
        }
    } else if (noResults) {
        noResults.remove();
    }
}

// دالة لتنسيق الوقت المنقضي
function formatTimeAgo(timestamp) {
    if (!timestamp) return 'غير معروف';
    
    const now = new Date();
    let postDate;
    
    // معالجة تنسيقات التاريخ المختلفة
    if (typeof timestamp === 'object' && timestamp.seconds) {
        // إذا كان timestamp من Firebase
        postDate = new Date(timestamp.seconds * 1000);
    } else if (typeof timestamp === 'number') {
        // إذا كان timestamp رقمي
        postDate = new Date(timestamp);
    } else {
        return 'غير معروف';
    }
    
    const diff = now - postDate;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    
    if (minutes < 1) return 'الآن';
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    if (hours < 24) return `منذ ${hours} ساعة`;
    if (days < 7) return `منذ ${days} يوم`;
    if (weeks < 4) return `منذ ${weeks} أسبوع`;
    if (months < 12) return `منذ ${months} شهر`;
    
    return postDate.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// وظائف مساعدة
function showLoading() {
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
}
