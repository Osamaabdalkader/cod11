// dashboard.js
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
        this.loadReferralsData(userId);
        this.loadDistributionData(userId);
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
      const joinDate = document.getElementById('join-date');
      const referralLink = document.getElementById('referral-link');
      const referralCodeDisplay = document.getElementById('referral-code-display');
      
      if (usernameEl) usernameEl.textContent = this.userData.name;
      if (userAvatar) userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(this.userData.name)}&background=random`;
      if (pointsCount) pointsCount.textContent = this.userData.points || '0';
      if (joinDate) joinDate.textContent = new Date(this.userData.joinDate).toLocaleDateString('ar-SA');
      if (referralLink) referralLink.value = `${window.location.origin}${window.location.pathname}?ref=${this.userData.referralCode}`;
      if (referralCodeDisplay) referralCodeDisplay.textContent = this.userData.referralCode || 'N/A';
      
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

  async checkAdminStatus() {
    try {
      const isAdmin = await checkAdminStatus(auth.currentUser.uid);
      if (isAdmin) {
        // إظهار عناصر المشرفين
        document.querySelectorAll('.admin-only').forEach(el => {
          el.style.display = 'block';
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
      if (referralsCountEl) referralsCountEl.textContent = count;
    } catch (error) {
      console.error("Error loading referrals count:", error);
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
      
      if (valueA < valueB) return this.referralsSortDirection === 'asc' ? -1 : 1;
      if (valueA > valueB) return this.referralsSortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    
    this.renderReferralsTable();
  }

  renderReferralsTable() {
    const referralsTable = document.getElementById('recent-referrals');
    if (!referralsTable) return;
    
    if (this.referralsData.length === 0) {
      referralsTable.innerHTML = '<tr><td colspan="4" style="text-align: center;">لا توجد إحالات حتى الآن</td></tr>';
      this.renderReferralsPagination();
      return;
    }
    
    // تطبيق البحث إذا كان موجوداً
    const searchTerm = document.getElementById('referrals-search')?.value.toLowerCase() || '';
    let filteredData = this.referralsData;
    
    if (searchTerm) {
      filteredData = this.referralsData.filter(item => 
        item.name?.toLowerCase().includes(searchTerm) || 
        item.email?.toLowerCase().includes(searchTerm)
      );
    }
    
    // حساب Pagination
    const totalPages = Math.ceil(filteredData.length / this.referralsPerPage);
    const startIndex = (this.currentReferralsPage - 1) * this.referralsPerPage;
    const endIndex = Math.min(startIndex + this.referralsPerPage, filteredData.length);
    const pageData = filteredData.slice(startIndex, endIndex);
    
    referralsTable.innerHTML = '';
    
    pageData.forEach((referral) => {
      const row = referralsTable.insertRow();
      row.innerHTML = `
        <td>${referral.name || 'غير معروف'}</td>
        <td>${referral.email || 'غير معروف'}</td>
        <td>${new Date(referral.joinDate).toLocaleDateString('ar-SA')}</td>
        <td><span class="user-badge level-0">نشط</span></td>
      `;
    });
    
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
    if (!distributionsTable) return;
    
    if (this.distributionData.length === 0) {
      distributionsTable.innerHTML = '<tr><td colspan="4" style="text-align: center;">لا توجد توزيعات حتى الآن</td></tr>';
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
      this.renderDistributionPagination(totalPages, filteredData.length);
      return;
    }
    
    for (const log of pageData) {
      // الحصول على اسم العضو المصدر
      try {
        const userSnapshot = await get(ref(database, 'users/' + log.sourceUserId));
        const userName = userSnapshot.exists() ? userSnapshot.val().name : 'مستخدم غير معروف';
        
        const row = distributionsTable.insertRow();
        row.innerHTML = `
          <td>${userName}</td>
          <td>${log.points}</td>
          <td>${log.level}</td>
          <td>${new Date(log.timestamp).toLocaleDateString('ar-SA')}</td>
        `;
      } catch (error) {
        console.error("Error rendering distribution row:", error);
      }
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
        <div class="rank-card">
          <h3>مرتبتك الحالية</h3>
          <div class="current-rank">
            <i class="${rankIcons[currentRank]} fa-3x" style="color: var(--primary); margin-bottom: 15px;"></i>
            <span class="rank-title">${rankTitles[currentRank]}</span>
            <span class="rank-level">المرتبة ${currentRank}</span>
          </div>
          <div class="next-rank">
            <h4>الترقية القادمة: ${rankTitles[nextRank]}</h4>
            <p>${nextRankRequirements[currentRank]}</p>
            ${currentRank < 10 ? `
            <div class="progress-bar">
              <div class="progress" style="width: ${progressPercentage}%"></div>
              <span>${Math.round(progressPercentage)}%</span>
            </div>
            ` : ''}
          </div>
        </div>
      `;
    } catch (error) {
      console.error("Error loading rank info:", error);
    }
  }

  async calculateEarnedPoints(userId) {
    try {
      const logsRef = ref(database, 'pointDistributionLogs');
      const snapshot = await get(logsRef);
      
      if (!snapshot.exists()) return 0;
      
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
      if (earnedPointsEl) earnedPointsEl.textContent = totalPoints;
      
      return totalPoints;
    } catch (error) {
      console.error("Error calculating earned points:", error);
      return 0;
    }
  }

  async countBenefitedMembers(userId) {
    try {
      const logsRef = ref(database, 'pointDistributionLogs');
      const snapshot = await get(logsRef);
      
      if (!snapshot.exists()) return 0;
      
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
      if (benefitedMembersEl) benefitedMembersEl.textContent = uniqueMembers.size;
      
      return uniqueMembers.size;
    } catch (error) {
      console.error("Error counting benefited members:", error);
      return 0;
    }
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
        copyLinkBtn.innerHTML = '<i class="fas fa-check"></i> تم النسخ!';
        setTimeout(() => {
          copyLinkBtn.innerHTML = '<i class="fas fa-copy"></i> نسخ الرابط';
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
        copyCodeBtn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => {
          copyCodeBtn.innerHTML = '<i class="fas fa-copy"></i>';
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
    const referralsHeaders = document.querySelectorAll('#referrals-table th');
    const distributionHeaders = document.querySelectorAll('#distribution-table th');
    
    referralsHeaders.forEach((header, index) => {
      header.addEventListener('click', () => {
        const fields = ['name', 'email', 'joinDate', 'status'];
        if (fields[index]) {
          this.sortReferralsData(fields[index]);
        }
      });
    });
    
    distributionHeaders.forEach((header, index) => {
      header.addEventListener('click', () => {
        const fields = ['sourceUserId', 'points', 'level', 'timestamp'];
        if (fields[index]) {
          this.sortDistributionData(fields[index]);
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
        const text = encodeURIComponent('انضم إلى هذا الموقع الرائع عبر رابط الإحالة الخاص بي!');
        const url = encodeURIComponent(document.getElementById('referral-link').value);
        window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
      });
    }
    
    // مشاركة على واتساب
    const shareWhatsapp = document.getElementById('share-whatsapp');
    if (shareWhatsapp) {
      shareWhatsapp.addEventListener('click', () => {
        const text = encodeURIComponent('انضم إلى هذا الموقع الرائع عبر رابط الإحالة الخاص بي: ');
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
