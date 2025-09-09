// management.js
import { auth, database, ref, get } from './firebase.js';
import { authManager } from './auth.js';

class ManagementManager {
  constructor() {
    this.init();
  }

  async init() {
    const user = await authManager.init();
    if (user) {
      await this.loadUserData(user.uid);
      this.loadManagementData();
      this.setupEventListeners();
    } else {
      window.location.href = 'index.html';
    }
  }

  async loadUserData(userId) {
    try {
      const snapshot = await get(ref(database, 'users/' + userId));
      const userData = snapshot.val();
      
      if (userData) {
        const usernameEl = document.getElementById('username');
        const userAvatar = document.getElementById('user-avatar');
        
        if (usernameEl) usernameEl.textContent = userData.name;
        if (userAvatar) userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name)}&background=random`;
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  }

  async loadManagementData() {
    if (!auth.currentUser) return;
    
    try {
      const snapshot = await get(ref(database, 'userReferrals/' + auth.currentUser.uid));
      const membersTable = document.getElementById('network-members');
      
      if (!snapshot.exists()) {
        membersTable.innerHTML = '<tr><td colspan="7" style="text-align: center;">لا توجد إحالات حتى الآن</td></tr>';
        return;
      }
      
      const referrals = snapshot.val();
      membersTable.innerHTML = '';
      
      // تحميل بيانات كل مستخدم مُحال
      for (const userId in referrals) {
        const userSnapshot = await get(ref(database, 'users/' + userId));
        const userData = userSnapshot.val();
        
        if (userData) {
          const referralsCount = await this.loadReferralsCount(userId);
          const rankTitles = ["مبتدئ", "عضو", "عضو متميز", "عضو نشيط", "عضو فعال", "عضو برونزي", "عضو فضي", "عضو ذهبي", "عضو بلاتيني", "عضو ماسي", "قائد"];
          const userRank = userData.rank || 0;
          
          const row = membersTable.insertRow();
          row.innerHTML = `
            <td>${userData.name}</td>
            <td>${userData.email}</td>
            <td><span class="user-badge level-${userRank}">${rankTitles[userRank]} (${userRank})</span></td>
            <td>${new Date(userData.joinDate).toLocaleDateString('ar-SA')}</td>
            <td>${referralsCount}</td>
            <td>${userData.points || 0}</td>
            <td>
              <button class="action-btn" onclick="managementManager.sendMessage('${userData.email}')"><i class="fas fa-envelope"></i></button>
              <button class="action-btn" onclick="managementManager.viewDetails('${userId}')"><i class="fas fa-eye"></i></button>
            </td>
          `;
        }
      }
    } catch (error) {
      console.error("Error loading management data:", error);
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

  setupEventListeners() {
    // تسجيل الخروج
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        authManager.handleLogout();
      });
    }
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
