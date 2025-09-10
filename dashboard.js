// dashboard.js - الإصدار المعدل لمنصة تسريع
import { auth, database, ref, get, onValue, query, orderByChild, equalTo } from './firebase.js';
import { checkPromotions, setupRankChangeListener, checkAdminStatus } from './firebase.js';
import { authManager } from './auth.js';

class DashboardManager {
  constructor() {
    this.userData = null;
    this.referralsData = [];
    this.distributionData = [];
    this.currentReferralsPage = 1;
    this.referralsPerPage = 10;
    this.currentDistributionPage = 1;
    this.distributionPerPage = 10;
    this.referralsSortField = 'joinDate';
    this.referralsSortDirection = 'desc';
    this.distributionSortField = 'timestamp';
    this.distributionSortDirection = 'desc';
    this.init();
  }

  async init() {
    try {
      const user = await authManager.init();
      if (user) {
        await this.loadUserData(user.uid);
        this.setupEventListeners();
        this.setupSocialShare();
        
        // بدء الاستماع لتغيرات المرتبة
        await this.setupRankListener(user.uid);
      } else {
        window.location.href = 'index.html';
      }
    } catch (error) {
      console.error("Error initializing dashboard:", error);
    }
  }

  async loadUserData(userId) {
    try {
      const snapshot = await get(ref(database, 'users/' + userId));
      this.userData = snapshot.val();
      
      if (this.userData) {
        this.updateUserUI();
        this.applyRankTheme(this.userData.rank || 0);
        this.loadReferralsData(userId);
        this.loadDistributionData(userId);
        // تحميل الإحصائيات الإضافية
        await this.calculateEarnedPoints(userId);
        await this.countBenefitedMembers(userId);
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  }

  updateUserUI() {
    try {
      const usernameEl = document.getElementById('username');
      const userAvatar = document.getElementById('user-avatar');
      const pointsCount = document.getElementById('points-count');
      const userEmail = document.getElementById('user-email');
      const userPhone = document.getElementById('user-phone');
      const userAddress = document.getElementById('user-address');
      const referralLink = document.getElementById('referral-link');
      const referralCodeDisplay = document.getElementById('referral-code-display');
      const bannerUsername = document.getElementById('banner-username');
      const userRankDisplay = document.getElementById('user-rank-display');
      
      if (usernameEl) usernameEl.textContent = this.userData.name;
      if (bannerUsername) bannerUsername.textContent = this.userData.name;
      if (userAvatar) userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(this.userData.name)}&background=random`;
      if (pointsCount) pointsCount.textContent = this.formatNumber(this.userData.points || 0);
      if (userEmail) userEmail.textContent = this.userData.email || 'غير محدد';
      if (userPhone) userPhone.textContent = this.userData.phone || 'غير محدد';
      if (userAddress) userAddress.textContent = this.userData.address || 'غير محدد';
      if (referralLink) referralLink.value = `${window.location.origin}${window.location.pathname}?ref=${this.userData.referralCode}`;
      if (referralCodeDisplay) referralCodeDisplay.textContent = this.userData.referralCode || 'N/A';
      
      // تحديث عرض المرتبة
      const rankTitles = [
        "مبتدئ", "عضو", "عضو متميز", "عضو نشيط", "عضو فعال",
        "عضو برونزي", "عضو فضي", "عضو ذهبي", "عضو بلاتيني", "عضو ماسي", "قائد"
      ];
      const currentRank = this.userData.rank || 0;
      if (userRankDisplay) userRankDisplay.textContent = `مرتبة: ${rankTitles[currentRank]}`;
      
      // تحميل عدد الإحالات
      this.loadReferralsCount(auth.currentUser.uid);
      // تحميل معلومات المرتبة
      this.loadRankInfo();
      // التحقق من صلاحية المشرف وتحديث الواجهة
      this.checkAdminStatus();
    } catch (error) {
      console.error("Error updating user UI:", error);
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

  async checkAdminStatus() {
    try {
      const isAdmin = await checkAdminStatus(auth.currentUser.uid);
      if (isAdmin) {
        // إظهار عناصر المشرفين
        document.querySelectorAll('.admin-only').forEach(el => {
          el.style.display = 'flex';
        });
      } else {
        // إخفاء عناصر المشرفين
        document.querySelectorAll('.admin-only').forEach(el => {
          el.style.display = 'none';
        });
      }
    } catch (error) {
      console.error("Error checking admin status:", error);
    }
  }

  async loadReferralsCount(userId) {
    try {
      const snapshot = await get(ref(database, 'userReferrals/' + userId));
      const count = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
      const referralsCountEl = document.getElementById('referrals-count');
      if (referralsCountEl) referralsCountEl.textContent = this.formatNumber(count);
    } catch (error) {
      console.error("Error loading referrals count:", error);
    }
  }

  async calculateEarnedPoints(userId) {
    try {
      const logsRef = ref(database, 'pointDistributionLogs');
      const snapshot = await get(logsRef);
      
      if (!snapshot.exists()) {
        const earnedPointsEl = document.getElementById('earned-points');
        if (earnedPointsEl) earnedPointsEl.textContent = '0';
        return 0;
      }
      
      const logs = snapshot.val();
      let totalPoints = 0;
      
      // البحث في جميع السجلات عن تلك التي يكون targetUserId هو المستخدم الحالي
      for (const logId in logs) {
        const log = logs[logId];
        if (log.targetUserId === userId) {
          totalPoints += log.points || 0;
        }
      }
      
      const earnedPointsEl = document.getElementById('earned-points');
      if (earnedPointsEl) earnedPointsEl.textContent = this.formatNumber(totalPoints);
      
      return totalPoints;
    } catch (error) {
      console.error("Error calculating earned points:", error);
      const earnedPointsEl = document.getElementById('earned-points');
      if (earnedPointsEl) earnedPointsEl.textContent = '0';
      return 0;
    }
  }

  async countBenefitedMembers(userId) {
    try {
      const logsRef = ref(database, 'pointDistributionLogs');
      const snapshot = await get(logsRef);
      
      if (!snapshot.exists()) {
        const benefitedMembersEl = document.getElementById('benefited-members');
        if (benefitedMembersEl) benefitedMembersEl.textContent = '0';
        return 0;
      }
      
      const logs = snapshot.val();
      const uniqueMembers = new Set();
      
      // البحث في جميع السجلات عن تلك التي يكون targetUserId هو المستخدم الحالي
      for (const logId in logs) {
        const log = logs[logId];
        if (log.targetUserId === userId) {
          uniqueMembers.add(log.sourceUserId);
        }
      }
      
      const benefitedMembersEl = document.getElementById('benefited-members');
      if (benefitedMembersEl) benefitedMembersEl.textContent = this.formatNumber(uniqueMembers.size);
      
      return uniqueMembers.size;
    } catch (error) {
      console.error("Error counting benefited members:", error);
      const benefitedMembersEl = document.getElementById('benefited-members');
      if (benefitedMembersEl) benefitedMembersEl.textContent = '0';
      return 0;
    }
  }

  async loadReferralsData(userId) {
    try {
      const referralsRef = ref(database, 'userReferrals/' + userId);
      onValue(referralsRef, (snapshot) => {
        if (!snapshot.exists()) {
          this.referralsData = [];
          this.renderReferralsTable();
          return;
        }
        
        const referrals = snapshot.val();
        this.referralsData = Object.entries(referrals).map(([id, data]) => ({
          id,
          ...data
        }));
        
        this.renderReferralsTable();
      });
    } catch (error) {
      console.error("Error loading referrals data:", error);
    }
  }

  sortReferralsData(field) {
    if (this.referralsSortField === field) {
      this.referralsSortDirection = this.referralsSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.referralsSortField = field;
      this.referralsSortDirection = 'desc';
    }
    
    this.referralsData.sort((a, b) => {
      let valueA = a[this.referralsSortField];
      let valueB = b[this.referralsSortField];
      
      if (this.referralsSortField === 'joinDate') {
        valueA = new Date(valueA);
        valueB = new Date(valueB);
      }
      
      if (typeof valueA === 'string') valueA = valueA.toLowerCase();
      if (typeof valueB === 'string') valueB = valueB.toLowerCase();
      
      if (valueA < valueB) return this.referralsSortDirection === 'asc' ? -1 : 1;
      if (valueA > valueB) return this.referralsSortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    
    this.renderReferralsTable();
  }

  renderReferralsTable() {
    const referralsTable = document.getElementById('recent-referrals');
    const referralsInfo = document.getElementById('referrals-info');
    if (!referralsTable) return;
    
    if (this.referralsData.length === 0) {
      referralsTable.innerHTML = '<tr><td colspan="5" style="text-align: center;">لا توجد أعضاء حتى الآن</td></tr>';
      if (referralsInfo) referralsInfo.textContent = 'عرض 0 إلى 0 من 0 إدخالات';
      this.renderReferralsPagination();
      return;
    }
    
    // تطبيق البحث إذا كان موجوداً
    const searchTerm = document.getElementById('referrals-search')?.value.toLowerCase() || '';
    let filteredData = this.referralsData;
    
    if (searchTerm) {
      filteredData = this.referralsData.filter(item => 
        (item.name && item.name.toLowerCase().includes(searchTerm)) || 
        (item.email && item.email.toLowerCase().includes(searchTerm)) ||
        (item.phone && item.phone.toLowerCase().includes(searchTerm))
      );
    }
    
    // حساب Pagination
    const totalPages = Math.ceil(filteredData.length / this.referralsPerPage);
    const startIndex = (this.currentReferralsPage - 1) * this.referralsPerPage;
    const endIndex = Math.min(startIndex + this.referralsPerPage, filteredData.length);
    const pageData = filteredData.slice(startIndex, endIndex);
    
    referralsTable.innerHTML = '';
    
    if (pageData.length === 0) {
      referralsTable.innerHTML = '<tr><td colspan="5" style="text-align: center;">لا توجد نتائج</td></tr>';
    } else {
      pageData.forEach((referral) => {
        const row = referralsTable.insertRow();
        row.innerHTML = `
          <td>${referral.name || 'غير معروف'}</td>
          <td>${referral.email || 'غير معروف'}</td>
          <td>${referral.phone || 'غير معروف'}</td>
          <td>${new Date(referral.joinDate).toLocaleDateString('ar-SA')}</td>
          <td><span class="user-badge">نشط</span></td>
        `;
      });
    }
    
    // تحديث معلومات الجدول
    if (referralsInfo) {
      const start = filteredData.length > 0 ? startIndex + 1 : 0;
      const end = startIndex + pageData.length;
      referralsInfo.textContent = `عرض ${start} إلى ${end} من ${filteredData.length} إدخالات`;
    }
    
    this.renderReferralsPagination(totalPages, filteredData.length);
  }

  renderReferralsPagination(totalPages = 0, totalItems = 0) {
    const paginationContainer = document.getElementById('referrals-pagination');
    const pagesContainer = document.getElementById('referrals-pages');
    const prevBtn = document.getElementById('referrals-prev');
    const nextBtn = document.getElementById('referrals-next');
    
    if (!paginationContainer || !pagesContainer) return;
    
    // تحديث حالة أزرار التصفح
    if (prevBtn) prevBtn.disabled = this.currentReferralsPage <= 1;
    if (nextBtn) nextBtn.disabled = this.currentReferralsPage >= totalPages;
    
    // إنشاء أرقام الصفحات
    pagesContainer.innerHTML = '';
    
    if (totalPages <= 1) {
      paginationContainer.style.display = 'none';
      return;
    }
    
    paginationContainer.style.display = 'flex';
    
    // عرض عدد محدود من الصفحات حول الصفحة الحالية
    const startPage = Math.max(1, this.currentReferralsPage - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    
    for (let i = startPage; i <= endPage; i++) {
      const pageBtn = document.createElement('div');
      pageBtn.className = `pagination-page ${i === this.currentReferralsPage ? 'active' : ''}`;
      pageBtn.textContent = i;
      pageBtn.onclick = () => {
        this.currentReferralsPage = i;
        this.renderReferralsTable();
      };
      pagesContainer.appendChild(pageBtn);
    }
  }

  async loadDistributionData(userId) {
    try {
      const logsRef = ref(database, 'pointDistributionLogs');
      const snapshot = await get(logsRef);
      
      if (!snapshot.exists()) {
        this.distributionData = [];
        this.renderDistributionTable();
        return;
      }
      
      const logs = snapshot.val();
      this.distributionData = [];
      
      // جمع السجلات الخاصة بالمستخدم الحالي فقط
      for (const logId in logs) {
        const log = logs[logId];
        if (log.targetUserId === userId) {
          this.distributionData.push({ id: logId, ...log });
        }
      }
      
      this.renderDistributionTable();
    } catch (error) {
      console.error("Error loading distribution data:", error);
    }
  }

  sortDistributionData(field) {
    if (this.distributionSortField === field) {
      this.distributionSortDirection = this.distributionSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.distributionSortField = field;
      this.distributionSortDirection = 'desc';
    }
    
    this.distributionData.sort((a, b) => {
      let valueA = a[this.distributionSortField];
      let valueB = b[this.distributionSortField];
      
      if (this.distributionSortField === 'timestamp') {
        valueA = new Date(valueA);
        valueB = new Date(valueB);
      }
      
      if (valueA < valueB) return this.distributionSortDirection === 'asc' ? -1 : 1;
      if (valueA > valueB) return this.distributionSortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    
    this.renderDistributionTable();
  }

  async renderDistributionTable() {
    const distributionsTable = document.getElementById('recent-distributions');
    const distributionInfo = document.getElementById('distribution-info');
    if (!distributionsTable) return;
    
    if (this.distributionData.length === 0) {
      distributionsTable.innerHTML = '<tr><td colspan="4" style="text-align: center;">لا توجد توزيعات حتى الآن</td></tr>';
      if (distributionInfo) distributionInfo.textContent = 'عرض 0 إلى 0 من 0 إدخالات';
      this.renderDistributionPagination();
      return;
    }
    
    // تطبيق البحث إذا كان موجوداً
    const searchTerm = document.getElementById('distribution-search')?.value.toLowerCase() || '';
    let filteredData = this.distributionData;
    
    if (searchTerm) {
      // سنحتاج إلى جلب أسماء المستخدمين للبحث
      const searchedData = [];
      for (const item of filteredData) {
        try {
          const userSnapshot = await get(ref(database, 'users/' + item.sourceUserId));
          if (userSnapshot.exists()) {
            const userData = userSnapshot.val();
            if (userData.name?.toLowerCase().includes(searchTerm) || 
                userData.email?.toLowerCase().includes(searchTerm)) {
              searchedData.push(item);
            }
          }
        } catch (error) {
          console.error("Error searching distribution data:", error);
        }
      }
      filteredData = searchedData;
    }
    
    // حساب Pagination
    const totalPages = Math.ceil(filteredData.length / this.distributionPerPage);
    const startIndex = (this.currentDistributionPage - 1) * this.distributionPerPage;
    const endIndex = Math.min(startIndex + this.distributionPerPage, filteredData.length);
    const pageData = filteredData.slice(startIndex, endIndex);
    
    distributionsTable.innerHTML = '';
    
    if (pageData.length === 0) {
      distributionsTable.innerHTML = '<tr><td colspan="4" style="text-align: center;">لا توجد نتائج</td></tr>';
    } else {
      for (const log of pageData) {
        // الحصول على اسم العضو المصدر
        try {
          const userSnapshot = await get(ref(database, 'users/' + log.sourceUserId));
          const userName = userSnapshot.exists() ? userSnapshot.val().name : 'مستخدم غير معروف';
          
          const row = distributionsTable.insertRow();
          row.innerHTML = `
            <td>${userName}</td>
            <td>${this.formatNumber(log.points)}</td>
            <td>${log.level}</td>
            <td>${new Date(log.timestamp).toLocaleDateString('ar-SA')}</td>
          `;
        } catch (error) {
          console.error("Error rendering distribution row:", error);
        }
      }
    }
    
    // تحديث معلومات الجدول
    if (distributionInfo) {
      const start = filteredData.length > 0 ? startIndex + 1 : 0;
      const end = startIndex + pageData.length;
      distributionInfo.textContent = `عرض ${start} إلى ${end} من ${filteredData.length} إدخالات`;
    }
    
    this.renderDistributionPagination(totalPages, filteredData.length);
  }

  renderDistributionPagination(totalPages = 0, totalItems = 0) {
    const paginationContainer = document.getElementById('distribution-pagination');
    const pagesContainer = document.getElementById('distribution-pages');
    const prevBtn = document.getElementById('distribution-prev');
    const nextBtn = document.getElementById('distribution-next');
    
    if (!paginationContainer || !pagesContainer) return;
    
    // تحديث حالة أزرار التصفح
    if (prevBtn) prevBtn.disabled = this.currentDistributionPage <= 1;
    if (nextBtn) nextBtn.disabled = this.currentDistributionPage >= totalPages;
    
    // إنشاء أرقام الصفحات
    pagesContainer.innerHTML = '';
    
    if (totalPages <= 1) {
      paginationContainer.style.display = 'none';
      return;
    }
    
    paginationContainer.style.display = 'flex';
    
    // عرض عدد محدود من الصفحات حول الصفحة الحالية
    const startPage = Math.max(1, this.currentDistributionPage - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    
    for (let i = startPage; i <= endPage; i++) {
      const pageBtn = document.createElement('div');
      pageBtn.className = `pagination-page ${i === this.currentDistributionPage ? 'active' : ''}`;
      pageBtn.textContent = i;
      pageBtn.onclick = () => {
        this.currentDistributionPage = i;
        this.renderDistributionTable();
      };
      pagesContainer.appendChild(pageBtn);
    }
  }

  // تحميل معلومات المرتبة
  async loadRankInfo() {
    try {
      const rankInfoElement = document.getElementById('rank-info');
      if (!rankInfoElement) return;
      
      const rankTitles = [
        "مبتدئ", "عضو", "عضو متميز", "عضو نشيط", "عضو فعال",
        "عضو برونزي", "عضو فضي", "عضو ذهبي", "عضو بلاتيني", "عضو ماسي", "قائد"
      ];
      
      const rankIcons = [
        "fas fa-seedling", "fas fa-user", "fas fa-user-plus", "fas fa-user-check", 
        "fas fa-user-edit", "fas fa-medal", "fas fa-award", "fas fa-trophy", 
        "fas fa-crown", "fas fa-gem", "fas fa-star"
      ];
      
      const nextRankRequirements = [
        "تجميع 100 نقطة للترقية إلى العضو",
        "3 أعضاء من فريقك يجب أن يصلوا إلى مرتبة عضو",
        "3 أعضاء من فريقك يجب أن يصلوا إلى مرتبة عضو متميز",
        "3 أعضاء من فريقك يجب أن يصلوا إلى مرتبة عضو نشيط",
        "3 أعضاء من فريقك يجب أن يصلوا إلى مرتبة عضو فعال",
        "3 أعضاء من فريقك يجب أن يصلوا إلى مرتبة عضو برونزي",
        "3 أعضاء من فريقك يجب أن يصلوا إلى مرتبة عضو فضي",
        "3 أعضاء من فريقك يجب أن يصلوا إلى مرتبة عضو ذهبي",
        "3 أعضاء من فريقك يجب أن يصلوا إلى مرتبة عضو بلاتيني",
        "3 أعضاء من فريقك يجب أن يصلوا إلى مرتبة عضو ماسي",
        "أنت في أعلى مرتبة!"
      ];
      
      const currentRank = this.userData.rank || 0;
      const nextRank = currentRank < 10 ? currentRank + 1 : 10;
      const progressPercentage = currentRank === 0 ? Math.min((this.userData.points || 0) / 100 * 100, 100) : 0;
      
      rankInfoElement.innerHTML = `
        <div class="rank-display">
          <div class="rank-icon">
            <i class="${rankIcons[currentRank]}"></i>
          </div>
          <div class="rank-title">${rankTitles[currentRank]}</div>
          <div class="rank-level">المرتبة ${currentRank}</div>
          
          ${currentRank < 10 ? `
          <div class="rank-progress">
            <h4>الترقية القادمة: ${rankTitles[nextRank]}</h4>
            <p>${nextRankRequirements[currentRank]}</p>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${progressPercentage}%"></div>
            </div>
            ${currentRank === 0 ? `<p>${this.userData.points || 0} / 100 نقطة</p>` : ''}
          </div>
          ` : ''}
        </div>
      `;
    } catch (error) {
      console.error("Error loading rank info:", error);
    }
  }

  formatNumber(num) {
    return new Intl.NumberFormat('ar-SA').format(num);
  }

  setupEventListeners() {
    // نسخ رابط الإحالة
    const copyLinkBtn = document.getElementById('copy-link-btn');
    if (copyLinkBtn) {
      copyLinkBtn.addEventListener('click', () => {
        const referralLink = document.getElementById('referral-link');
        referralLink.select();
        document.execCommand('copy');
        
        // تأثير عند النسخ
        const originalText = copyLinkBtn.innerHTML;
        copyLinkBtn.innerHTML = '<i class="fas fa-check"></i> تم النسخ!';
        setTimeout(() => {
          copyLinkBtn.innerHTML = originalText;
        }, 2000);
      });
    }
    
    // نسخ كود الإحالة
    const copyCodeBtn = document.getElementById('copy-code-btn');
    if (copyCodeBtn) {
      copyCodeBtn.addEventListener('click', () => {
        const referralCodeDisplay = document.getElementById('referral-code-display');
        const tempTextArea = document.createElement('textarea');
        tempTextArea.value = referralCodeDisplay.textContent;
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        document.execCommand('copy');
        document.body.removeChild(tempTextArea);
        
        // تأثير عند النسخ
        const originalHtml = copyCodeBtn.innerHTML;
        copyCodeBtn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => {
          copyCodeBtn.innerHTML = originalHtml;
        }, 2000);
      });
    }
    
    // تحديث الرابط
    const refreshLinkBtn = document.getElementById('refresh-link');
    if (refreshLinkBtn) {
      refreshLinkBtn.addEventListener('click', () => {
        refreshLinkBtn.classList.add('rotating');
        setTimeout(() => {
          refreshLinkBtn.classList.remove('rotating');
        }, 1000);
      });
    }
    
    // Pagination for referrals
    const referralsPrevBtn = document.getElementById('referrals-prev');
    const referralsNextBtn = document.getElementById('referrals-next');
    
    if (referralsPrevBtn) {
      referralsPrevBtn.addEventListener('click', () => {
        if (this.currentReferralsPage > 1) {
          this.currentReferralsPage--;
          this.renderReferralsTable();
        }
      });
    }
    
    if (referralsNextBtn) {
      referralsNextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(this.referralsData.length / this.referralsPerPage);
        if (this.currentReferralsPage < totalPages) {
          this.currentReferralsPage++;
          this.renderReferralsTable();
        }
      });
    }
    
    // Pagination for distribution
    const distributionPrevBtn = document.getElementById('distribution-prev');
    const distributionNextBtn = document.getElementById('distribution-next');
    
    if (distributionPrevBtn) {
      distributionPrevBtn.addEventListener('click', () => {
        if (this.currentDistributionPage > 1) {
          this.currentDistributionPage--;
          this.renderDistributionTable();
        }
      });
    }
    
    if (distributionNextBtn) {
      distributionNextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(this.distributionData.length / this.distributionPerPage);
        if (this.currentDistributionPage < totalPages) {
          this.currentDistributionPage++;
          this.renderDistributionTable();
        }
      });
    }
    
    // تغيير عدد العناصر لكل صفحة
    const referralsPerPageSelect = document.getElementById('referrals-per-page');
    const distributionPerPageSelect = document.getElementById('distribution-per-page');
    
    if (referralsPerPageSelect) {
      referralsPerPageSelect.addEventListener('change', (e) => {
        this.referralsPerPage = parseInt(e.target.value);
        this.currentReferralsPage = 1;
        this.renderReferralsTable();
      });
    }
    
    if (distributionPerPageSelect) {
      distributionPerPageSelect.addEventListener('change', (e) => {
        this.distributionPerPage = parseInt(e.target.value);
        this.currentDistributionPage = 1;
        this.renderDistributionTable();
      });
    }
    
    // البحث في الجداول
    const referralsSearch = document.getElementById('referrals-search');
    const distributionSearch = document.getElementById('distribution-search');
    
    if (referralsSearch) {
      referralsSearch.addEventListener('input', () => {
        this.currentReferralsPage = 1;
        this.renderReferralsTable();
      });
    }
    
    if (distributionSearch) {
      distributionSearch.addEventListener('input', () => {
        this.currentDistributionPage = 1;
        this.renderDistributionTable();
      });
    }
    
    // فرز الجداول عند النقر على العناوين
    const referralsHeaders = document.querySelectorAll('#referrals-table th[data-sort]');
    const distributionHeaders = document.querySelectorAll('#distribution-table th[data-sort]');
    
    referralsHeaders.forEach(header => {
      header.addEventListener('click', () => {
        const field = header.getAttribute('data-sort');
        if (field) {
          this.sortReferralsData(field);
        }
      });
    });
    
    distributionHeaders.forEach(header => {
      header.addEventListener('click', () => {
        const field = header.getAttribute('data-sort');
        if (field) {
          this.sortDistributionData(field);
        }
      });
    });
    
    // تسجيل الخروج
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        authManager.handleLogout();
      });
    }
  }

  setupSocialShare() {
    // مشاركة على فيسبوك
    const shareFb = document.getElementById('share-fb');
    if (shareFb) {
      shareFb.addEventListener('click', () => {
        const url = encodeURIComponent(document.getElementById('referral-link').value);
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
      });
    }
    
    // مشاركة على تويتر
    const shareTwitter = document.getElementById('share-twitter');
    if (shareTwitter) {
      shareTwitter.addEventListener('click', () => {
        const text = encodeURIComponent('انضم إلى منصة تسريع للتسويق الإلكتروني عبر رابط التسريع الخاص بي!');
        const url = encodeURIComponent(document.getElementById('referral-link').value);
        window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
      });
    }
    
    // مشاركة على واتساب
    const shareWhatsapp = document.getElementById('share-whatsapp');
    if (shareWhatsapp) {
      shareWhatsapp.addEventListener('click', () => {
        const text = encodeURIComponent('انضم إلى منصة تسريع للتسويق الإلكتروني عبر رابط التسريع الخاص بي: ');
        const url = encodeURIComponent(document.getElementById('referral-link').value);
        window.open(`https://wa.me/?text=${text}${url}`, '_blank');
      });
    }
  }

  // إعداد المستمع لتغيرات المرتبة
  async setupRankListener(userId) {
    try {
      // الاستماع لتغيرات المرتبة الخاصة بالمستخدم
      const rankRef = ref(database, 'users/' + userId + '/rank');
      
      onValue(rankRef, (snapshot) => {
        if (snapshot.exists()) {
          const newRank = snapshot.val();
          console.log(`تم تغيير مرتبتك إلى: ${newRank}`);
          
          // تطبيق سمة المرتبة الجديدة
          this.applyRankTheme(newRank);
          
          // عند تغيير المرتبة، أعد تحميل واجهة المستخدم
          this.loadUserData(userId);
        }
      });
      
      // بدء الاستماع لتغيرات مراتب أعضاء الفريق
      await setupRankChangeListener(userId);
      
    } catch (error) {
      console.error("Error setting up rank listener:", error);
    }
  }
}

// تهيئة النظام عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  new DashboardManager();
});
