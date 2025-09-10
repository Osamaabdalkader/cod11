// distribution.js - إدارة صفحة سجل توزيع النقاط
import { auth, database, ref, get, query, orderByChild, equalTo } from './firebase.js';
import { authManager } from './auth.js';

class DistributionManager {
  constructor() {
    this.currentUser = null;
    this.currentPage = 1;
    this.logsPerPage = 10;
    this.totalPages = 1;
    this.allLogs = [];
    this.filteredLogs = [];
    this.userNamesCache = {}; // كاش لأسماء المستخدمين
    this.init();
  }

  async init() {
    console.log("بدء تهيئة صفحة توزيع النقاط");
    
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
    
    // التحقق من صلاحية المشرف
    const isAdmin = await this.checkAdminStatus(this.currentUser.uid);
    console.log("صلاحية المشرف:", isAdmin);
    
    if (!isAdmin) {
      console.log("ليست لديك صلاحية الوصول إلى هذه الصفحة");
      alert("ليست لديك صلاحية الوصول إلى صفحة توزيع النقاط");
      window.location.href = 'dashboard.html';
      return;
    }
    
    console.log("تم التحقق من الصلاحية بنجاح، تحميل صفحة توزيع النقاط");
    
    // تحميل بيانات المستخدم أولاً
    await this.loadCurrentUserData();
    
    this.setupEventListeners();
    this.loadDistributionLogs();
  }

  async checkAdminStatus(userId) {
    try {
      const userRef = ref(database, 'users/' + userId);
      const userSnapshot = await get(userRef);
      
      if (!userSnapshot.exists()) return false;
      
      const userData = userSnapshot.val();
      return userData.isAdmin === true;
    } catch (error) {
      console.error("Error checking admin status:", error);
      return false;
    }
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
      }
    } catch (error) {
      console.error("Error loading current user data:", error);
    }
  }

  async loadDistributionLogs() {
    try {
      console.log("جاري تحميل سجل توزيع النقاط");
      const logsRef = ref(database, 'pointDistributionLogs');
      const snapshot = await get(logsRef);
      
      if (!snapshot.exists()) {
        this.showInfo("لا توجد سجلات توزيع نقاط");
        this.allLogs = [];
        this.filteredLogs = [];
        this.updatePagination();
        return;
      }
      
      const logs = snapshot.val();
      this.allLogs = Object.entries(logs).map(([id, log]) => ({ id, ...log }));
      
      // ترتيب السجلات حسب التاريخ (الأحدث أولاً)
      this.allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      this.filteredLogs = [...this.allLogs];
      this.updatePagination();
      this.calculateStats();
      
      // تحميل أسماء المستخدمين
      await this.loadUserNames();
      
    } catch (error) {
      console.error("Error loading distribution logs:", error);
      this.showError("فشل في تحميل سجل التوزيع");
    }
  }

  async loadUserNames() {
    try {
      const usersRef = ref(database, 'users');
      const snapshot = await get(usersRef);
      
      if (!snapshot.exists()) return;
      
      const users = snapshot.val();
      this.userNamesCache = {};
      
      for (const userId in users) {
        const user = users[userId];
        this.userNamesCache[userId] = {
          name: user.name || "غير معروف",
          email: user.email || "غير معروف"
        };
      }
      
      // بعد تحميل الأسماء، قم بتحديث العرض
      this.updatePagination();
      
    } catch (error) {
      console.error("Error loading user names:", error);
    }
  }

  async searchLogs() {
    const searchTerm = document.getElementById('distribution-search').value.toLowerCase();
    const levelFilter = document.getElementById('distribution-level-filter').value;
    const dateFilter = document.getElementById('distribution-date-filter').value;
    
    try {
      // إذا لم يكن هناك بحث أو تصفية، عرض جميع السجلات
      if (!searchTerm && !levelFilter && !dateFilter) {
        this.filteredLogs = [...this.allLogs];
      } else {
        // تطبيق البحث والتصفية
        this.filteredLogs = this.allLogs.filter(log => {
          // تطبيق فلتر المستوى
          if (levelFilter && log.level.toString() !== levelFilter) {
            return false;
          }
          
          // تطبيق فلتر التاريخ
          if (dateFilter) {
            const logDate = new Date(log.timestamp);
            const now = new Date();
            
            switch (dateFilter) {
              case 'today':
                if (!this.isSameDay(logDate, now)) return false;
                break;
              case 'week':
                if (!this.isSameWeek(logDate, now)) return false;
                break;
              case 'month':
                if (!this.isSameMonth(logDate, now)) return false;
                break;
            }
          }
          
          // تطبيق البحث إذا كان موجوداً
          if (searchTerm) {
            // البحث في أسماء المستخدمين إذا كانت محملة في الكاش
            const sourceUser = this.userNamesCache[log.sourceUserId];
            const targetUser = this.userNamesCache[log.targetUserId];
            
            const sourceNameMatch = sourceUser && sourceUser.name.toLowerCase().includes(searchTerm);
            const sourceEmailMatch = sourceUser && sourceUser.email.toLowerCase().includes(searchTerm);
            const targetNameMatch = targetUser && targetUser.name.toLowerCase().includes(searchTerm);
            const targetEmailMatch = targetUser && targetUser.email.toLowerCase().includes(searchTerm);
            
            if (!sourceNameMatch && !sourceEmailMatch && !targetNameMatch && !targetEmailMatch) {
              return false;
            }
          }
          
          return true;
        });
      }
      
      this.currentPage = 1; // العودة إلى الصفحة الأولى عند البحث/التصفية
      this.updatePagination();
      this.calculateStats();
      
    } catch (error) {
      console.error("Error searching logs:", error);
      this.showError("فشل في البحث في السجلات");
    }
  }

  isSameDay(date1, date2) {
    return date1.getDate() === date2.getDate() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getFullYear() === date2.getFullYear();
  }

  isSameWeek(date1, date2) {
    const firstDayOfWeek = new Date(date2);
    firstDayOfWeek.setDate(date2.getDate() - date2.getDay()); // الأحد من هذا الأسبوع
    
    const lastDayOfWeek = new Date(date2);
    lastDayOfWeek.setDate(date2.getDate() + (6 - date2.getDay())); // السبت من هذا الأسبوع
    
    return date1 >= firstDayOfWeek && date1 <= lastDayOfWeek;
  }

  isSameMonth(date1, date2) {
    return date1.getMonth() === date2.getMonth() &&
           date1.getFullYear() === date2.getFullYear();
  }

  updatePagination() {
    // حساب عدد الصفحات
    this.totalPages = Math.ceil(this.filteredLogs.length / this.logsPerPage);
    
    // عرض السجلات للصفحة الحالية
    this.displayLogs();
    
    // تحديث واجهة الترقيم
    this.updatePaginationUI();
  }

  displayLogs() {
    const logsTable = document.getElementById('distribution-logs-table');
    if (!logsTable) return;

    logsTable.innerHTML = '';

    if (!this.filteredLogs || this.filteredLogs.length === 0) {
      logsTable.innerHTML = '<tr><td colspan="9" style="text-align: center;">لا توجد نتائج</td></tr>';
      return;
    }

    // حساب مؤشرات البداية والنهاية للصفحة الحالية
    const startIndex = (this.currentPage - 1) * this.logsPerPage;
    const endIndex = Math.min(startIndex + this.logsPerPage, this.filteredLogs.length);
    const currentLogs = this.filteredLogs.slice(startIndex, endIndex);

    currentLogs.forEach(log => {
      const row = logsTable.insertRow();
      
      // الحصول على بيانات المستخدمين من الكاش
      const sourceUser = this.userNamesCache[log.sourceUserId] || { name: "غير معروف", email: "غير معروف" };
      const targetUser = this.userNamesCache[log.targetUserId] || { name: "غير معروف", email: "غير معروف" };
      const adminUser = this.userNamesCache[log.distributedBy] || { name: "غير معروف", email: "غير معروف" };
      
      row.innerHTML = `
        <td>${sourceUser.name}</td>
        <td>${sourceUser.email}</td>
        <td>${targetUser.name}</td>
        <td>${targetUser.email}</td>
        <td>${log.points}</td>
        <td>${log.level}</td>
        <td>${log.percentage}%</td>
        <td>${adminUser.name}</td>
        <td>${new Date(log.timestamp).toLocaleString('ar-SA')}</td>
      `;
    });
  }

  calculateStats() {
    if (this.filteredLogs.length === 0) {
      document.getElementById('total-distributed-points').textContent = '0';
      document.getElementById('total-distributions').textContent = '0';
      document.getElementById('highest-distribution').textContent = '0';
      return;
    }
    
    // حساب إجمالي النقاط الموزعة
    const totalPoints = this.filteredLogs.reduce((sum, log) => sum + (log.points || 0), 0);
    document.getElementById('total-distributed-points').textContent = this.formatNumber(totalPoints);
    
    // حساب عدد عمليات التوزيع
    document.getElementById('total-distributions').textContent = this.formatNumber(this.filteredLogs.length);
    
    // حساب أعلى توزيع
    const highestDistribution = Math.max(...this.filteredLogs.map(log => log.points || 0));
    document.getElementById('highest-distribution').textContent = this.formatNumber(highestDistribution);
  }

  updatePaginationUI() {
    const paginationContainer = document.getElementById('distribution-pagination-container');
    const paginationInfo = document.getElementById('distribution-pagination-info');
    const paginationPages = document.getElementById('distribution-pagination-pages');
    const prevButton = document.getElementById('distribution-pagination-prev');
    const nextButton = document.getElementById('distribution-pagination-next');
    
    if (this.filteredLogs.length === 0) {
      paginationContainer.style.display = 'none';
      return;
    }
    
    paginationContainer.style.display = 'flex';
    
    // تحديث معلومات الترقيم
    const startIndex = (this.currentPage - 1) * this.logsPerPage + 1;
    const endIndex = Math.min(startIndex + this.logsPerPage - 1, this.filteredLogs.length);
    paginationInfo.textContent = `عرض ${startIndex} إلى ${endIndex} من ${this.filteredLogs.length} سجل`;
    
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
    const table = document.querySelector('.distribution-table');
    if (table) {
      table.scrollIntoView({ behavior: 'smooth' });
    }
  }

  setupEventListeners() {
    // البحث
    const searchInput = document.getElementById('distribution-search');
    if (searchInput) {
      searchInput.addEventListener('keyup', () => {
        this.searchLogs();
      });
    }

    // التصفية حسب المستوى
    const levelFilter = document.getElementById('distribution-level-filter');
    if (levelFilter) {
      levelFilter.addEventListener('change', () => {
        this.searchLogs();
      });
    }

    // التصفية حسب التاريخ
    const dateFilter = document.getElementById('distribution-date-filter');
    if (dateFilter) {
      dateFilter.addEventListener('change', () => {
        this.searchLogs();
      });
    }

    // عدد السجلات في الصفحة
    const logsPerPage = document.getElementById('logs-per-page');
    if (logsPerPage) {
      logsPerPage.addEventListener('change', (e) => {
        this.logsPerPage = parseInt(e.target.value);
        this.currentPage = 1;
        this.updatePagination();
      });
    }

    // أزرار الترقيم
    const prevButton = document.getElementById('distribution-pagination-prev');
    const nextButton = document.getElementById('distribution-pagination-next');
    
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
        this.loadDistributionLogs();
        this.showSuccess("تم تحديث البيانات بنجاح");
      });
    }

    // زر العودة للإدارة
    const backButton = document.getElementById('back-to-admin-btn');
    if (backButton) {
      backButton.addEventListener('click', () => {
        window.location.href = 'admin.html';
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
    const alertDiv = document.getElementById('distribution-alert');
    if (alertDiv) {
      alertDiv.textContent = message;
      alertDiv.className = 'alert alert-error';
      alertDiv.style.display = 'block';
      
      setTimeout(() => {
        alertDiv.style.display = 'none';
      }, 5000);
    }
  }

  showSuccess(message) {
    const alertDiv = document.getElementById('distribution-alert');
    if (alertDiv) {
      alertDiv.textContent = message;
      alertDiv.className = 'alert alert-success';
      alertDiv.style.display = 'block';
      
      setTimeout(() => {
        alertDiv.style.display = 'none';
      }, 5000);
    }
  }

  showInfo(message) {
    const alertDiv = document.getElementById('distribution-alert');
    if (alertDiv) {
      alertDiv.textContent = message;
      alertDiv.className = 'alert alert-info';
      alertDiv.style.display = 'block';
    }
  }

  formatNumber(num) {
    return new Intl.NumberFormat('ar-SA').format(num);
  }
}

// تهيئة صفحة توزيع النقاط عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  console.log("تم تحميل صفحة توزيع النقاط");
  new DistributionManager();
});
