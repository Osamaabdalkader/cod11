// network.js - الإصدار المحدث مع دعم التصميم الجديد
import { auth, database, ref, get } from './firebase.js';
import { authManager } from './auth.js';

class NetworkManager {
  constructor() {
    this.userDataCache = {};
    this.networkData = {};
    this.currentUser = null;
    this.maxDepth = 5;
    this.init();
  }

  async init() {
    try {
      const user = await authManager.init();
      if (user) {
        this.currentUser = user;
        await this.loadUserData(user.uid);
        this.setupEventListeners();
        this.loadNetwork();
      } else {
        window.location.href = 'index.html';
      }
    } catch (error) {
      console.error("Error initializing network:", error);
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

  async loadNetwork() {
    const networkContainer = document.getElementById('network-container');
    if (!networkContainer || !this.currentUser) return;
    
    networkContainer.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> جاري تحميل الشبكة...</div>';
    
    try {
      // الحصول على العمق المحدد من القائمة المنسدلة
      const depthSelect = document.getElementById('network-depth');
      this.maxDepth = depthSelect ? parseInt(depthSelect.value) : 5;
      
      this.networkData = {};
      await this.loadNetworkRecursive(this.currentUser.uid, this.networkData, 0, this.maxDepth);
      
      this.renderNetwork(this.networkData, networkContainer);
      await this.calculateNetworkStats();
      
    } catch (error) {
      console.error("Error loading network:", error);
      networkContainer.innerHTML = '<div class="error">فشل في تحميل الشبكة</div>';
    }
  }

  async loadNetworkRecursive(userId, network, currentLevel, maxLevel) {
    if (currentLevel > maxLevel) return;
    
    try {
      const snapshot = await get(ref(database, 'userReferrals/' + userId));
      if (!snapshot.exists()) return;
      
      const referrals = snapshot.val();
      network[userId] = {
        level: currentLevel,
        referrals: {}
      };
      
      // تحميل بيانات المستخدم إذا لم تكن موجودة مسبقًا
      if (!this.userDataCache[userId]) {
        const userSnapshot = await get(ref(database, 'users/' + userId));
        this.userDataCache[userId] = userSnapshot.val();
      }
      
      network[userId].data = this.userDataCache[userId];
      
      // تحميل الإحالات بشكل متكرر
      for (const referredUserId in referrals) {
        network[userId].referrals[referredUserId] = {
          data: referrals[referredUserId],
          level: currentLevel + 1
        };
        
        await this.loadNetworkRecursive(
          referredUserId, 
          network[userId].referrals, 
          currentLevel + 1, 
          maxLevel
        );
      }
    } catch (error) {
      console.error("Error loading network recursively:", error);
    }
  }

  renderNetwork(network, container) {
    container.innerHTML = '';
    
    if (!network || Object.keys(network).length === 0) {
      container.innerHTML = '<div class="empty-state">لا توجد إحالات حتى الآن</div>';
      return;
    }
    
    this.renderNetworkNode(this.currentUser.uid, network, container, 0);
  }

  renderNetworkNode(userId, network, container, level) {
    if (!network[userId]) return;
    
    const nodeData = network[userId].data;
    const referrals = network[userId].referrals;
    
    const nodeElement = document.createElement('div');
    nodeElement.className = `network-node level-${level}`;
    
    nodeElement.innerHTML = `
      <div class="node-header">
        <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(nodeData.name)}&background=random" alt="صورة المستخدم">
        <div class="node-info">
          <h4>${nodeData.name}</h4>
          <p>${nodeData.email}</p>
          <span class="user-level">المستوى: ${level}</span>
        </div>
        <div class="node-stats">
          <span class="points">${nodeData.points || 0} نقطة</span>
        </div>
      </div>
    `;
    
    // إذا كان هناك إحالات، إضافة زر للتوسيع
    if (referrals && Object.keys(referrals).length > 0) {
      const expandBtn = document.createElement('button');
      expandBtn.className = 'expand-btn';
      expandBtn.innerHTML = `<i class="fas fa-chevron-down"></i> ${Object.keys(referrals).length} إحالة`;
      expandBtn.onclick = () => this.toggleNodeExpansion(nodeElement, referrals, level + 1);
      nodeElement.appendChild(expandBtn);
    }
    
    container.appendChild(nodeElement);
  }

  toggleNodeExpansion(node, referrals, level) {
    const childrenContainer = node.querySelector('.node-children');
    
    if (childrenContainer) {
      childrenContainer.style.display = childrenContainer.style.display === 'none' ? 'block' : 'none';
      
      // تحديث أيقونة الزر
      const icon = node.querySelector('.expand-btn i');
      if (childrenContainer.style.display === 'none') {
        icon.className = 'fas fa-chevron-down';
      } else {
        icon.className = 'fas fa-chevron-up';
      }
    } else {
      const newChildrenContainer = document.createElement('div');
      newChildrenContainer.className = 'node-children';
      
      for (const referredUserId in referrals) {
        this.renderNetworkNode(referredUserId, referrals, newChildrenContainer, level);
      }
      
      node.appendChild(newChildrenContainer);
      
      // تحديث أيقونة الزر
      const icon = node.querySelector('.expand-btn i');
      icon.className = 'fas fa-chevron-up';
    }
  }

  async calculateNetworkStats() {
    try {
      let totalMembers = 0;
      let totalPoints = 0;
      let highestRank = 0;
      
      // حساب الإحصائيات من البيانات المحملة
      const calculateStats = (network) => {
        for (const userId in network) {
          totalMembers++;
          
          const userData = network[userId].data;
          if (userData) {
            totalPoints += userData.points || 0;
            highestRank = Math.max(highestRank, userData.rank || 0);
          }
          
          // حساب الإحصائيات للإحالات
          if (network[userId].referrals) {
            calculateStats(network[userId].referrals);
          }
        }
      };
      
      calculateStats(this.networkData);
      
      // تحديث واجهة المستخدم بالإحصائيات
      const totalMembersEl = document.getElementById('total-members');
      const totalLevelsEl = document.getElementById('total-levels');
      const networkPointsEl = document.getElementById('network-points');
      const highestRankEl = document.getElementById('highest-rank');
      
      if (totalMembersEl) totalMembersEl.textContent = this.formatNumber(totalMembers);
      if (totalLevelsEl) totalLevelsEl.textContent = this.maxDepth;
      if (networkPointsEl) networkPointsEl.textContent = this.formatNumber(totalPoints);
      
      // تحويل الرقم إلى اسم المرتبة
      const rankTitles = [
        "مبتدئ", "عضو", "عضو متميز", "عضو نشيط", "عضو فعال",
        "عضو برونزي", "عضو فضي", "عضو ذهبي", "عضو بلاتيني", "عضو ماسي", "قائد"
      ];
      if (highestRankEl) highestRankEl.textContent = rankTitles[highestRank] || "غير معروف";
      
    } catch (error) {
      console.error("Error calculating network stats:", error);
    }
  }

  formatNumber(num) {
    return new Intl.NumberFormat('ar-SA').format(num);
  }

  setupEventListeners() {
    // تغيير عمق الشبكة
    const networkDepthSelect = document.getElementById('network-depth');
    if (networkDepthSelect) {
      networkDepthSelect.addEventListener('change', () => {
        this.loadNetwork();
      });
    }
    
    // البحث في الشبكة
    const networkSearch = document.getElementById('network-search');
    if (networkSearch) {
      networkSearch.addEventListener('input', () => {
        this.filterNetwork(networkSearch.value.toLowerCase());
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

  filterNetwork(searchTerm) {
    if (!searchTerm) {
      // إذا كان البحث فارغًا، عرض الشبكة كاملة
      this.renderNetwork(this.networkData, document.getElementById('network-container'));
      return;
    }
    
    // تصفية الشبكة بناءً على مصطلح البحث
    const filteredNetwork = {};
    this.filterNetworkRecursive(this.currentUser.uid, this.networkData, filteredNetwork, searchTerm);
    
    this.renderNetwork(filteredNetwork, document.getElementById('network-container'));
  }

  filterNetworkRecursive(userId, originalNetwork, filteredNetwork, searchTerm) {
    if (!originalNetwork[userId]) return;
    
    const nodeData = originalNetwork[userId].data;
    const referrals = originalNetwork[userId].referrals;
    
    // التحقق مما إذا كان العقدة تطابق مصطلح البحث
    const nameMatch = nodeData.name && nodeData.name.toLowerCase().includes(searchTerm);
    const emailMatch = nodeData.email && nodeData.email.toLowerCase().includes(searchTerm);
    
    if (nameMatch || emailMatch) {
      filteredNetwork[userId] = {
        level: originalNetwork[userId].level,
        data: nodeData,
        referrals: {}
      };
      
      // إضافة جميع الإحالات حتى لو لم تطابق البحث
      for (const referredUserId in referrals) {
        filteredNetwork[userId].referrals[referredUserId] = {
          level: referrals[referredUserId].level,
          data: referrals[referredUserId].data
        };
        
        this.filterNetworkRecursive(referredUserId, referrals, filteredNetwork[userId].referrals, searchTerm);
      }
    } else {
      // إذا لم تطابق العقدة البحث، تحقق من الإحالات
      for (const referredUserId in referrals) {
        this.filterNetworkRecursive(referredUserId, referrals, filteredNetwork, searchTerm);
      }
    }
  }
}

// تهيئة النظام عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  new NetworkManager();
});
