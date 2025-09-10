// management.js - الإصدار المحدث مع دعم التصميم الجديد
import { auth, database, ref, get } from './firebase.js';
import { authManager } from './auth.js';

class ManagementManager {
  constructor() {
    this.membersData = [];
    this.filteredData = [];
    this.currentPage = 1;
    this.membersPerPage = 25;
    this.sortField = 'joinDate';
    this.sortDirection = 'desc';
    this.filters = {
      type: '',
      level: '',
      search: ''
    };
    this.init();
  }

  async init() {
    try {
      const user = await authManager.init();
      if (user) {
        this.currentUser = user;
        await this.loadUserData(user.uid);
        this.setupEventListeners();
        this.loadManagementData();
      } else {
        window.location.href = 'index.html';
      }
    } catch (error) {
      console.error("Error initializing management:", error);
    }
  }

  async loadUserData(userId) {
    try {
      const snapshot = await get(ref(database, 'users/' + userId));
      const userData = snapshot.val();
      
      if (userData) {
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
      console.error("Error loading user data:", error);
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

  async loadManagementData() {
    if (!this.currentUser) return;
    
    const membersTable = document.getElementById('network-members');
    membersTable.innerHTML = '<tr><td colspan="7" class="loading-row"><i class="fas fa-spinner fa-spin"></i> جاري تحميل البيانات...</td></tr>';
    
    try {
      // الحصول على جميع الإحالات المباشرة وغير المباشرة
      this.membersData = [];
      await this.loadNetworkRecursive(this.currentUser.uid, 0, 10);
      
      // تطبيق الفرز الأولي
      this.sortData();
      
      // حساب الإحصائيات
      await this.calculateStats();
      
      // عرض البيانات
      this.applyFilters();
      
    } catch (error) {
      console.error("Error loading management data:", error);
      membersTable.innerHTML = '<tr><td colspan="7" class="loading-row">فشل في تحميل البيانات</td></tr>';
    }
  }

  async loadNetworkRecursive(userId, level, maxLevel) {
    if (level > maxLevel) return;
    
    try {
      const snapshot = await get(ref(database, 'userReferrals/' + userId));
      if (!snapshot.exists()) return;
      
      const referrals = snapshot.val();
      
      // تحميل بيانات كل مستخدم مُحال
      for (const referredUserId in referrals) {
        const userSnapshot = await get(ref(database, 'users/' + referredUserId));
        
        if (userSnapshot.exists()) {
          const userData = userSnapshot.val();
          
          // الحصول على عدد إحالات هذا المستخدم
          const referralsCount = await this.loadReferralsCount(referredUserId);
          
          // إضافة بيانات العضو إلى القائمة
          this.membersData.push({
            id: referredUserId,
            ...userData,
            level: level,
            referralsCount: referralsCount
          });
          
          // تحميل الإحالات بشكل متكرر
          await this.loadNetworkRecursive(referredUserId, level + 1, maxLevel);
        }
      }
    } catch (error) {
      console.error("Error loading network recursively:", error);
    }
  }

  async loadReferralsCount(userId) {
    try {
      const snapshot = await get(ref(database, 'userReferrals/' + userId));
      return snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
    } catch (error) {
      console.error("Error loading referrals count:", error);
      return 0;
    }
  }

  async calculateStats() {
    try {
      let totalMembers = this.membersData.length;
      let directMembers = this.membersData.filter(m => m.level === 1).length;
      let totalPoints = this.membersData.reduce((sum, member) => sum + (member.points || 0), 0);
      let averageRank = this.membersData.reduce((sum, member) => sum + (member.rank || 0), 0) / totalMembers || 0;
      
      // تحديث واجهة المستخدم بالإحصائيات
      const totalMembersEl = document.getElementById('total-members');
      const directMembersEl = document.getElementById('direct-members');
      const totalPointsEl = document.getElementById('total-points');
      const averageRankEl = document.getElementById('average-rank');
      
      if (totalMembersEl) totalMembersEl.textContent = this.formatNumber(totalMembers);
      if (directMembersEl) directMembersEl.textContent = this.formatNumber(directMembers);
      if (totalPointsEl) totalPointsEl.textContent = this.formatNumber(totalPoints);
      if (averageRankEl) averageRankEl.textContent = averageRank.toFixed(1);
      
    } catch (error) {
      console.error("Error calculating stats:", error);
    }
  }

  sortData() {
    this.membersData.sort((a, b) => {
      let valueA = a[this.sortField];
      let valueB = b[this.sortField];
      
      if (this.sortField === 'joinDate') {
        valueA = new Date(valueA);
        valueB = new Date(valueB);
      }
      
      if (typeof valueA === 'string') valueA = valueA.toLowerCase();
      if (typeof valueB === 'string') valueB = valueB.toLowerCase();
      
      if (valueA < valueB) return this.sortDirection === 'asc' ? -1 : 1;
      if (valueA > valueB) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  applyFilters() {
    // تطبيق البحث
    let filteredData = this.membersData;
    
    if (this.filters.search) {
      const searchTerm = this.filters.search.toLowerCase();
      filteredData = filteredData.filter(member => 
        (member.name && member.name.toLowerCase().includes(searchTerm)) || 
        (member.email && member.email.toLowerCase().includes(searchTerm))
      );
    }
    
    // تطبيق فلتر النوع
    if (this.filters.type === 'direct') {
      filteredData = filteredData.filter(member => member.level === 1);
    } else if (this.filters.type === 'indirect') {
      filteredData = filteredData.filter(member => member.level > 1);
    }
    
    // تطبيق فلتر المستوى
    if (this.filters.level) {
      const level = parseInt(this.filters.level);
      filteredData = filteredData.filter(member => member.rank === level);
    }
    
    this.filteredData = filteredData;
    this.renderMembersTable();
  }

  renderMembersTable() {
    const membersTable = document.getElementById('network-members');
    const membersInfo = document.getElementById('members-info');
    
    if (!membersTable) return;
    
    if (this.filteredData.length === 0) {
      membersTable.innerHTML = '<tr><td colspan="7" style="text-align: center;">لا توجد نتائج</td></tr>';
      if (membersInfo) membersInfo.textContent = 'عرض 0 إلى 0 من 0 إدخالات';
      this.renderPagination();
      return;
    }
    
    // حساب Pagination
    const totalPages = Math.ceil(this.filteredData.length / this.membersPerPage);
    const startIndex = (this.currentPage - 1) * this.membersPerPage;
    const endIndex = Math.min(startIndex + this.membersPerPage, this.filteredData.length);
    const pageData = this.filteredData.slice(startIndex, endIndex);
    
    membersTable.innerHTML = '';
    
    const rankTitles = [
      "مبتدئ", "عضو", "عضو متميز", "عضو نشيط", "عضو فعال",
      "عضو برونزي", "عضو فضي", "عضو ذهبي", "عضو بلاتيني", "عضو ماسي", "قائد"
    ];
    
    pageData.forEach((member) => {
      const row = membersTable.insertRow();
      const userRank = member.rank || 0;
      
      row.innerHTML = `
        <td>${member.name}</td>
        <td>${member.email}</td>
        <td><span class="user-badge level-${userRank}">${rankTitles[userRank]} (${userRank})</span></td>
        <td>${new Date(member.joinDate).toLocaleDateString('ar-SA')}</td>
        <td>${member.referralsCount}</td>
        <td>${this.formatNumber(member.points || 0)}</td>
        <td>
          <button class="action-btn" onclick="managementManager.sendMessage('${member.email}')">
            <i class="fas fa-envelope"></i>
          </button>
          <button class="action-btn" onclick="managementManager.viewDetails('${member.id}')">
            <i class="fas fa-eye"></i>
          </button>
        </td>
      `;
    });
    
    // تحديث معلومات الجدول
    if (membersInfo) {
      const start = this.filteredData.length > 0 ? startIndex + 1 : 0;
      const end = startIndex + pageData.length;
      membersInfo.textContent = `عرض ${start} إلى ${end} من ${this.filteredData.length} إدخالات`;
    }
    
    this.renderPagination(totalPages);
  }

  renderPagination(totalPages = 0) {
    const paginationContainer = document.getElementById('members-pagination');
    const pagesContainer = document.getElementById('members-pages');
    const prevBtn = document.getElementById('members-prev');
    const nextBtn = document.getElementById('members-next');
    
    if (!paginationContainer || !pagesContainer) return;
    
    // تحديث حالة أزرار التصفح
    if (prevBtn) prevBtn.disabled = this.currentPage <= 1;
    if (nextBtn) nextBtn.disabled = this.currentPage >= totalPages;
    
    // إنشاء أرقام الصفحات
    pagesContainer.innerHTML = '';
    
    if (totalPages <= 1) {
      paginationContainer.style.display = 'none';
      return;
    }
    
    paginationContainer.style.display = 'flex';
    
    // عرض عدد محدود من الصفحات حول الصفحة الحالية
    const startPage = Math.max(1, this.currentPage - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    
    for (let i = startPage; i <= endPage; i++) {
      const pageBtn = document.createElement('div');
      pageBtn.className = `pagination-page ${i === this.currentPage ? 'active' : ''}`;
      pageBtn.textContent = i;
      pageBtn.onclick = () => {
        this.currentPage = i;
        this.renderMembersTable();
      };
      pagesContainer.appendChild(pageBtn);
    }
  }

  formatNumber(num) {
    return new Intl.NumberFormat('ar-SA').format(num);
  }

  setupEventListeners() {
    // تسجيل الخروج
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        authManager.handleLogout();
      });
    }
    
    // تغيير عدد العناصر لكل صفحة
    const membersPerPageSelect = document.getElementById('members-per-page');
    if (membersPerPageSelect) {
      membersPerPageSelect.addEventListener('change', (e) => {
        this.membersPerPage = parseInt(e.target.value);
        this.currentPage = 1;
        this.renderMembersTable();
      });
    }
    
    // البحث في الجدول
    const membersSearch = document.getElementById('members-search');
    if (membersSearch) {
      membersSearch.addEventListener('input', () => {
        this.filters.search = membersSearch.value;
        this.currentPage = 1;
        this.applyFilters();
      });
    }
    
    // تطبيق الفلاتر
    const applyFiltersBtn = document.getElementById('apply-filters');
    if (applyFiltersBtn) {
      applyFiltersBtn.addEventListener('click', () => {
        this.filters.type = document.getElementById('filter-type').value;
        this.filters.level = document.getElementById('filter-level').value;
        this.currentPage = 1;
        this.applyFilters();
      });
    }
    
    // فرز الجداول عند النقر على العناوين
    const membersHeaders = document.querySelectorAll('#members-table th[data-sort]');
    
    membersHeaders.forEach(header => {
      header.addEventListener('click', () => {
        const field = header.getAttribute('data-sort');
        if (field) {
          if (this.sortField === field) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
          } else {
            this.sortField = field;
            this.sortDirection = 'desc';
          }
          
          this.sortData();
          this.applyFilters();
        }
      });
    });
  }

  // وظائف مساعدة للإدارة
  sendMessage(email) {
    alert(`سيتم إرسال رسالة إلى: ${email}`);
  }

  viewDetails(userId) {
    alert(`عرض تفاصيل المستخدم: ${userId}`);
  }
}

// تهيئة النظام عند تحميل الصفحة
const managementManager = new ManagementManager();
