// admin.js
import { auth, database, ref, get, update } from './firebase.js';
import { getAllUsers, searchUsers, addPointsToUser, checkAdminStatus } from './firebase.js';
import { authManager } from './auth.js';

class AdminManager {
  constructor() {
    this.currentUser = null;
    this.init();
  }

  async init() {
    console.log("بدء تهيئة لوحة المشرفين");
    
    // الانتظار حتى يتم تهيئة authManager
    if (!authManager.currentUser) {
      await authManager.init();
    }
    
    this.currentUser = auth.currentUser;
    
    if (!this.currentUser) {
      console.log("لا يوجد مستخدم مسجل دخول");
      alert("يجب تسجيل الدخول أولاً");
      window.location.href = 'index.html';
      return;
    }
    
    console.log("المستخدم الحالي:", this.currentUser.uid);
    
    // التحقق من صلاحية المشرف بدون إعادة توجيه تلقائية
    const isAdmin = await checkAdminStatus(this.currentUser.uid);
    console.log("صلاحية المشرف:", isAdmin);
    
    if (!isAdmin) {
      console.log("ليست لديك صلاحية الوصول إلى هذه الصفحة");
      alert("ليست لديك صلاحية الوصول إلى لوحة المشرفين");
      window.location.href = 'dashboard.html';
      return;
    }
    
    console.log("تم التحقق من الصلاحية بنجاح، تحميل لوحة المشرفين");
    
    // تحميل بيانات المستخدم أولاً
    await this.loadCurrentUserData();
    
    this.setupEventListeners();
    this.loadAllUsers();
  }

  async loadCurrentUserData() {
    try {
      const userRef = ref(database, 'users/' + this.currentUser.uid);
      const userSnapshot = await get(userRef);
      
      if (userSnapshot.exists()) {
        const userData = userSnapshot.val();
        
        // تحديث واجهة المستخدم
        const usernameEl = document.getElementById('username');
        const userAvatar = document.getElementById('user-avatar');
        
        if (usernameEl) usernameEl.textContent = userData.name;
        if (userAvatar) userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name)}&background=random`;
      }
    } catch (error) {
      console.error("Error loading current user data:", error);
    }
  }

  async loadAllUsers() {
    try {
      console.log("جاري تحميل جميع المستخدمين");
      const users = await getAllUsers();
      this.displayUsers(users);
    } catch (error) {
      console.error("Error loading users:", error);
      this.showError("فشل في تحميل المستخدمين");
    }
  }

  async searchUsers() {
    const searchTerm = document.getElementById('admin-search').value;
    const rankFilter = document.getElementById('admin-rank-filter').value;
    
    try {
      const results = await searchUsers(searchTerm, rankFilter);
      this.displayUsers(results);
    } catch (error) {
      console.error("Error searching users:", error);
      this.showError("فشل في البحث عن المستخدمين");
    }
  }

  displayUsers(users) {
    const usersTable = document.getElementById('admin-users-table');
    if (!usersTable) return;

    usersTable.innerHTML = '';

    if (!users || Object.keys(users).length === 0) {
      usersTable.innerHTML = '<tr><td colspan="8" style="text-align: center;">لا توجد نتائج</td></tr>';
      return;
    }

    // تحويل كائن المستخدمين إلى مصفوفة للترتيب
    const usersArray = Object.entries(users).map(([id, user]) => ({ id, ...user }));
    
    // ترتيب المستخدمين حسب تاريخ الانضمام (الأحدث أولاً)
    usersArray.sort((a, b) => new Date(b.joinDate) - new Date(a.joinDate));

    usersArray.forEach(user => {
      const row = usersTable.insertRow();
      
      const rankTitles = [
        "مبتدئ", "عضو", "عضو متميز", "عضو نشيط", "عضو فعال",
        "عضو برونزي", "عضو فضي", "عضو ذهبي", "عضو بلاتيني", "عضو ماسي", "قائد"
      ];
      
      const userRank = user.rank || 0;
      const rankTitle = rankTitles[userRank] || "غير محدد";

      row.innerHTML = `
        <td>${user.name || "غير معروف"}</td>
        <td>${user.email || "غير معروف"}</td>
        <td><span class="user-badge level-${userRank}">${rankTitle}</span></td>
        <td>${user.points || 0}</td>
        <td>${user.isAdmin ? 'نعم' : 'لا'}</td>
        <td>${new Date(user.joinDate).toLocaleDateString('ar-SA')}</td>
        <td>
          <input type="number" id="points-${user.id}" min="0" value="0" class="points-input">
        </td>
        <td>
          <button class="action-btn add-points-btn" data-userid="${user.id}">
            <i class="fas fa-plus"></i> إضافة نقاط
          </button>
          <button class="action-btn view-details-btn" data-userid="${user.id}">
            <i class="fas fa-eye"></i> تفاصيل
          </button>
        </td>
      `;
    });

    // إضافة مستمعين للأزرار
    this.setupUserActionsListeners();
  }

  setupUserActionsListeners() {
    // أزرار إضافة النقاط
    document.querySelectorAll('.add-points-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const userId = e.target.closest('.add-points-btn').dataset.userid;
        this.addPointsToUser(userId);
      });
    });

    // أزرار عرض التفاصيل
    document.querySelectorAll('.view-details-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const userId = e.target.closest('.view-details-btn').dataset.userid;
        this.viewUserDetails(userId);
      });
    });
  }

  async addPointsToUser(userId) {
    const pointsInput = document.getElementById(`points-${userId}`);
    const pointsToAdd = parseInt(pointsInput.value);
    
    if (isNaN(pointsToAdd) || pointsToAdd <= 0) {
      this.showError("يرجى إدخال عدد صحيح موجب من النقاط");
      return;
    }

    try {
      await addPointsToUser(userId, pointsToAdd, this.currentUser.uid);
      this.showSuccess(`تم إضافة ${pointsToAdd} نقطة للمستخدم بنجاح`);
      
      // تحديث القائمة
      this.loadAllUsers();
    } catch (error) {
      console.error("Error adding points:", error);
      this.showError(error.message || "فشل في إضافة النقاط");
    }
  }

  async viewUserDetails(userId) {
    try {
      const userRef = ref(database, 'users/' + userId);
      const userSnapshot = await get(userRef);
      
      if (userSnapshot.exists()) {
        const userData = userSnapshot.val();
        alert(`تفاصيل المستخدم:\nالاسم: ${userData.name}\nالبريد: ${userData.email}\nالنقاط: ${userData.points || 0}\nالمرتبة: ${userData.rank || 0}`);
      }
    } catch (error) {
      console.error("Error viewing user details:", error);
      this.showError("فشل في تحميل تفاصيل المستخدم");
    }
  }

  setupEventListeners() {
    // زر البحث
    const searchBtn = document.getElementById('admin-search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        this.searchUsers();
      });
    }

    // البحث أثناء الكتابة
    const searchInput = document.getElementById('admin-search');
    if (searchInput) {
      searchInput.addEventListener('keyup', () => {
        this.searchUsers();
      });
    }

    // تصفية حسب الرتبة
    const rankFilter = document.getElementById('admin-rank-filter');
    if (rankFilter) {
      rankFilter.addEventListener('change', () => {
        this.searchUsers();
      });
    }

    // تسجيل الخروج
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        authManager.handleLogout();
      });
    }
  }

  showError(message) {
    const alertDiv = document.getElementById('admin-alert');
    if (alertDiv) {
      alertDiv.textContent = message;
      alertDiv.className = 'alert alert-error';
      alertDiv.style.display = 'block';
      
      setTimeout(() => {
        alertDiv.style.display = 'none';
      }, 5000);
    } else {
      // إنشاء عنصر تنبيه إذا لم يكن موجوداً
      const newAlert = document.createElement('div');
      newAlert.id = 'admin-alert';
      newAlert.className = 'alert alert-error';
      newAlert.textContent = message;
      newAlert.style.position = 'fixed';
      newAlert.style.top = '20px';
      newAlert.style.right = '20px';
      newAlert.style.zIndex = '1000';
      document.body.appendChild(newAlert);
      
      setTimeout(() => {
        newAlert.style.display = 'none';
      }, 5000);
    }
  }

  showSuccess(message) {
    const alertDiv = document.getElementById('admin-alert');
    if (alertDiv) {
      alertDiv.textContent = message;
      alertDiv.className = 'alert alert-success';
      alertDiv.style.display = 'block';
      
      setTimeout(() => {
        alertDiv.style.display = 'none';
      }, 5000);
    }
  }
}

// تهيئة لوحة المشرفين عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  console.log("تم تحميل صفحة المشرفين");
  new AdminManager();
});
