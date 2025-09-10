// admin.js - الإصدار المحدث مع دعم التصميم الجديد ونظام الترقيم
import { auth, database, ref, get, update } from './firebase.js';
import { getAllUsers, searchUsers, addPointsToUser, checkAdminStatus } from './firebase.js';
import { authManager } from './auth.js';

class AdminManager {
  constructor() {
    this.currentUser = null;
    this.currentPage = 1;
    this.usersPerPage = 10;
    this.totalPages = 1;
    this.allUsers = [];
    this.filteredUsers = [];
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
    this.loadAdminStats();
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
        const bannerUsername = document.getElementById('banner-username');
        const userRankDisplay = document.getElementById('user-rank-display');
        
        if (usernameEl) usernameEl.textContent = userData.name;
        if (bannerUsername) bannerUsername.textContent = userData.name;
        if (userAvatar) userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name)}&background=random`;
        
        // تحديث عرض المرتبة
        const rankTitles = [
          "مبتدئ", "عضو", "عضو متميز", "عضو نشيط", "عضو فعال",
          "عضو برونزي", "عضو فضي", "عضو ذهبي", "عضو بلاتيني", "عضو ماسي", "قائد"
        ];
        const currentRank = userData.rank || 0;
        if (userRankDisplay) userRankDisplay.textContent = `مرتبة: ${rankTitles[currentRank]}`;
        
        // تطبيق سمة المرتبة
        this.applyRankTheme(currentRank);
      }
    } catch (error) {
      console.error("Error loading current user data:", error);
    }
  }

  applyRankTheme(rank) {
    // إضافة كلاس المرتبة إلى body لتطبيق أنماط الألوان
    document.body.classList.remove('rank-0', 'rank-1', 'rank-2', 'rank-3', 'rank-4', 
                                  'rank-5', 'rank-6', 'rank-7', 'rank-8', 'rank-9', 'rank-10');
    document.body.classList.add(`rank-${rank}`);
    
    // تحديث ألوان الشعار حسب المرتبة
    const navBrandIcon = document.querySelector('.nav-brand i');
    if (navBrandIcon) {
      navBrandIcon.style.color = `var(--primary)`;
    }
  }

  async loadAdminStats() {
    try {
      const users = await getAllUsers();
      
      let totalUsers = 0;
      let totalAdmins = 0;
      let totalPoints = 0;
      let highestRank = 0;
      
      for (const userId in users) {
        const user = users[userId];
        totalUsers++;
        
        if (user.isAdmin) {
          totalAdmins++;
        }
        
        totalPoints += user.points || 0;
        highestRank = Math.max(highestRank, user.rank || 0);
      }
      
      // تحديث واجهة المستخدم بالإحصائيات
      const totalUsersEl = document.getElementById('total-users');
      const totalAdminsEl = document.getElementById('total-admins');
      const totalPointsEl = document.getElementById('total-points');
      const highestRankEl = document.getElementById('highest-rank');
      
      if (totalUsersEl) totalUsersEl.textContent = this.formatNumber(totalUsers);
      if (totalAdminsEl) totalAdminsEl.textContent = this.formatNumber(totalAdmins);
      if (totalPointsEl) totalPointsEl.textContent = this.formatNumber(totalPoints);
      
      // تحويل الرقم إلى اسم المرتبة
      const rankTitles = [
        "مبتدئ", "عضو", "عضو متميز", "عضو نشيط", "عضو فعال",
        "عضو برونزي", "عضو فضي", "عضو ذهبي", "عضو بلاتيني", "عضو ماسي", "قائد"
      ];
      if (highestRankEl) highestRankEl.textContent = rankTitles[highestRank] || "غير معروف";
      
    } catch (error) {
      console.error("Error loading admin stats:", error);
    }
  }

  async loadAllUsers() {
    try {
      console.log("جاري تحميل جميع المستخدمين");
      const users = await getAllUsers();
      this.allUsers = Object.entries(users).map(([id, user]) => ({ id, ...user }));
      
      // ترتيب المستخدمين حسب تاريخ الانضمام (الأحدث أولاً)
      this.allUsers.sort((a, b) => new Date(b.joinDate) - new Date(a.joinDate));
      
      this.filteredUsers = [...this.allUsers];
      this.updatePagination();
    } catch (error) {
      console.error("Error loading users:", error);
      this.showError("فشل في تحميل المستخدمين");
    }
  }

  async searchUsers() {
    const searchTerm = document.getElementById('admin-search').value.toLowerCase();
    const rankFilter = document.getElementById('admin-rank-filter').value;
    
    try {
      // إذا لم يكن هناك بحث أو تصفية، عرض جميع المستخدمين
      if (!searchTerm && !rankFilter) {
        this.filteredUsers = [...this.allUsers];
      } else {
        // تطبيق البحث والتصفية
        this.filteredUsers = this.allUsers.filter(user => {
          const matchesSearch = !searchTerm || 
            (user.name && user.name.toLowerCase().includes(searchTerm)) ||
            (user.email && user.email.toLowerCase().includes(searchTerm));
          
          const matchesRank = !rankFilter || (user.rank || 0).toString() === rankFilter;
          
          return matchesSearch && matchesRank;
        });
      }
      
      this.currentPage = 1; // العودة إلى الصفحة الأولى عند البحث/التصفية
      this.updatePagination();
    } catch (error) {
      console.error("Error searching users:", error);
      this.showError("فشل في البحث عن المستخدمين");
    }
  }

  updatePagination() {
    // حساب عدد الصفحات
    this.totalPages = Math.ceil(this.filteredUsers.length / this.usersPerPage);
    
    // عرض المستخدمين للصفحة الحالية
    this.displayUsers();
    
    // تحديث واجهة الترقيم
    this.updatePaginationUI();
  }

  displayUsers() {
    const usersTable = document.getElementById('admin-users-table');
    if (!usersTable) return;

    usersTable.innerHTML = '';

    if (!this.filteredUsers || this.filteredUsers.length === 0) {
      usersTable.innerHTML = '<tr><td colspan="8" style="text-align: center;">لا توجد نتائج</td></tr>';
      return;
    }

    // حساب مؤشرات البداية والنهاية للصفحة الحالية
    const startIndex = (this.currentPage - 1) * this.usersPerPage;
    const endIndex = Math.min(startIndex + this.usersPerPage, this.filteredUsers.length);
    const currentUsers = this.filteredUsers.slice(startIndex, endIndex);

    currentUsers.forEach(user => {
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

  updatePaginationUI() {
    const paginationContainer = document.getElementById('pagination-container');
    const paginationInfo = document.getElementById('pagination-info');
    const paginationPages = document.getElementById('pagination-pages');
    const prevButton = document.getElementById('pagination-prev');
    const nextButton = document.getElementById('pagination-next');
    
    if (this.filteredUsers.length === 0) {
      paginationContainer.style.display = 'none';
      return;
    }
    
    paginationContainer.style.display = 'flex';
    
    // تحديث معلومات الترقيم
    const startIndex = (this.currentPage - 1) * this.usersPerPage + 1;
    const endIndex = Math.min(startIndex + this.usersPerPage - 1, this.filteredUsers.length);
    paginationInfo.textContent = `عرض ${startIndex} إلى ${endIndex} من ${this.filteredUsers.length} مستخدم`;
    
    // تحديث أزرار الصفحات
    paginationPages.innerHTML = '';
    
    // حساب الصفحات التي يجب عرضها
    let startPage = Math.max(1, this.currentPage - 2);
    let endPage = Math.min(this.totalPages, startPage + 4);
    
    if (endPage - startPage < 4) {
      startPage = Math.max(1, endPage - 4);
    }
    
    // إضافة زر الصفحة الأولى إذا لزم الأمر
    if (startPage > 1) {
      const firstPageBtn = document.createElement('button');
      firstPageBtn.className = 'pagination-page';
      firstPageBtn.textContent = '1';
      firstPageBtn.addEventListener('click', () => this.goToPage(1));
      paginationPages.appendChild(firstPageBtn);
      
      if (startPage > 2) {
        const ellipsis = document.createElement('span');
        ellipsis.className = 'pagination-ellipsis';
        ellipsis.textContent = '...';
        paginationPages.appendChild(ellipsis);
      }
    }
    
    // إضافة أزرار الصفحات
    for (let i = startPage; i <= endPage; i++) {
      const pageBtn = document.createElement('button');
      pageBtn.className = `pagination-page ${i === this.currentPage ? 'active' : ''}`;
      pageBtn.textContent = i;
      pageBtn.addEventListener('click', () => this.goToPage(i));
      paginationPages.appendChild(pageBtn);
    }
    
    // إضافة زر الصفحة الأخيرة إذا لزم الأمر
    if (endPage < this.totalPages) {
      if (endPage < this.totalPages - 1) {
        const ellipsis = document.createElement('span');
        ellipsis.className = 'pagination-ellipsis';
        ellipsis.textContent = '...';
        paginationPages.appendChild(ellipsis);
      }
      
      const lastPageBtn = document.createElement('button');
      lastPageBtn.className = 'pagination-page';
      lastPageBtn.textContent = this.totalPages;
      lastPageBtn.addEventListener('click', () => this.goToPage(this.totalPages));
      paginationPages.appendChild(lastPageBtn);
    }
    
    // تحديث حالة أزرار السابق والتالي
    prevButton.disabled = this.currentPage === 1;
    nextButton.disabled = this.currentPage === this.totalPages;
  }

  goToPage(page) {
    if (page < 1 || page > this.totalPages) return;
    
    this.currentPage = page;
    this.updatePagination();
    
    // التمرير إلى أعلى الجدول
    const table = document.querySelector('.users-table');
    if (table) {
      table.scrollIntoView({ behavior: 'smooth' });
    }
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
      
      // تحديث القائمة والإحصائيات
      this.loadAllUsers();
      this.loadAdminStats();
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

    // عدد المستخدمين في الصفحة
    const usersPerPage = document.getElementById('users-per-page');
    if (usersPerPage) {
      usersPerPage.addEventListener('change', (e) => {
        this.usersPerPage = parseInt(e.target.value);
        this.currentPage = 1;
        this.updatePagination();
      });
    }

    // أزرار الترقيم
    const prevButton = document.getElementById('pagination-prev');
    const nextButton = document.getElementById('pagination-next');
    
    if (prevButton) {
      prevButton.addEventListener('click', () => {
        this.goToPage(this.currentPage - 1);
      });
    }
    
    if (nextButton) {
      nextButton.addEventListener('click', () => {
        this.goToPage(this.currentPage + 1);
      });
    }

    // زر تحديث البيانات
    const refreshButton = document.getElementById('refresh-data-btn');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => {
        this.loadAllUsers();
        this.loadAdminStats();
        this.showSuccess("تم تحديث البيانات بنجاح");
      });
    }

    // زر التقارير الإحصائية
    const statsButton = document.getElementById('stats-report-btn');
    if (statsButton) {
      statsButton.addEventListener('click', () => {
        this.showDistributionHistory();
      });
    }

    // زر عرض سجل التوزيع
    const showDistributionBtn = document.getElementById('show-distribution-btn');
    if (showDistributionBtn) {
      showDistributionBtn.addEventListener('click', () => {
        this.showDistributionHistory();
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

  async showDistributionHistory() {
    // تحميل وعرض سجل توزيع النقاط
    try {
      const distributionLogs = await this.loadDistributionLogs();
      this.displayDistributionLogs(distributionLogs);
    } catch (error) {
      console.error("Error loading distribution logs:", error);
    }
  }

  async loadDistributionLogs() {
    try {
      const logsRef = ref(database, 'pointDistributionLogs');
      const snapshot = await get(logsRef);
      
      if (!snapshot.exists()) return [];
      
      const logs = snapshot.val();
      const logsArray = Object.entries(logs).map(([id, log]) => ({ id, ...log }));
      
      // ترتيب حسب التاريخ (الأحدث أولاً)
      return logsArray.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      console.error("Error loading distribution logs:", error);
      return [];
    }
  }

  displayDistributionLogs(logs) {
    // إنشاء واجهة لعرض سجل التوزيع
    const adminPanel = document.querySelector('.admin-panel');
    if (!adminPanel) return;
    
    adminPanel.innerHTML = `
      <h2><i class="fas fa-share-alt"></i> سجل توزيع النقاط</h2>
      
      <div class="search-section">
        <div class="search-filters">
          <input type="text" id="distribution-search" placeholder="ابحث بالاسم أو البريد الإلكتروني">
          <select id="distribution-level-filter">
            <option value="">جميع المستويات</option>
            <option value="1">المستوى 1</option>
            <option value="2">المستوى 2</option>
            <option value="3">المستوى 3</option>
            <option value="4">المستوى 4</option>
            <option value="5">المستوى 5</option>
            <option value="6">المستوى 6</option>
            <option value="7">المستوى 7</option>
            <option value="8">المستوى 8</option>
            <option value="9">المستوى 9</option>
            <option value="10">المستوى 10</option>
          </select>
          <button id="distribution-search-btn"><i class="fas fa-search"></i> بحث</button>
        </div>
      </div>
      
      <div style="overflow-x: auto;">
        <table class="users-table">
          <thead>
            <tr>
              <th>المستخدم المصدر</th>
              <th>المستخدم المستفيد</th>
              <th>النقاط</th>
              <th>المستوى</th>
              <th>النسبة</th>
              <th>التاريخ</th>
            </tr>
          </thead>
          <tbody id="distribution-logs">
            ${logs.length === 0 ? 
              '<tr><td colspan="6" style="text-align: center;">لا توجد سجلات توزيع</td></tr>' : 
              logs.map(log => `
                <tr>
                  <td>${log.sourceUserId}</td>
                  <td>${log.targetUserId}</td>
                  <td>${log.points}</td>
                  <td>${log.level}</td>
                  <td>${log.percentage}%</td>
                  <td>${new Date(log.timestamp).toLocaleString('ar-SA')}</td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>
      
      <div style="margin-top: 20px;">
        <button onclick="window.location.reload()">العودة إلى إدارة المستخدمين</button>
      </div>
    `;
    
    // إضافة مستمعين لأحداث البحث
    this.setupDistributionSearch();
  }

  setupDistributionSearch() {
    // البحث في سجل التوزيع
    const searchBtn = document.getElementById('distribution-search-btn');
    const searchInput = document.getElementById('distribution-search');
    const levelFilter = document.getElementById('distribution-level-filter');
    
    if (searchBtn) {
      searchBtn.addEventListener('click', () => this.searchDistributionLogs());
    }
    
    if (searchInput) {
      searchInput.addEventListener('keyup', () => this.searchDistributionLogs());
    }
    
    if (levelFilter) {
      levelFilter.addEventListener('change', () => this.searchDistributionLogs());
    }
  }

  async searchDistributionLogs() {
    // البحث والتصفية في سجل التوزيع
    const searchTerm = document.getElementById('distribution-search').value;
    const levelFilter = document.getElementById('distribution-level-filter').value;
    
    try {
      const allLogs = await this.loadDistributionLogs();
      const filteredLogs = allLogs.filter(log => {
        const matchesLevel = !levelFilter || log.level.toString() === levelFilter;
        // هنا يمكن إضافة البحث بالاسم إذا كان متاحاً
        return matchesLevel;
      });
      
      this.displayDistributionLogs(filteredLogs);
    } catch (error) {
      console.error("Error searching distribution logs:", error);
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

  formatNumber(num) {
    return new Intl.NumberFormat('ar-SA').format(num);
  }
}

// تهيئة لوحة المشرفين عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  console.log("تم تحميل صفحة المشرفين");
  new AdminManager();
});
