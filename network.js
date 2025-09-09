// network.js
import { auth, database, ref, get } from './firebase.js';
import { authManager } from './auth.js';

class NetworkManager {
  constructor() {
    this.userDataCache = {};
    this.init();
  }

  async init() {
    const user = await authManager.init();
    if (user) {
      await this.loadUserData(user.uid);
      this.loadNetwork();
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

  async loadNetwork() {
    const networkContainer = document.getElementById('network-container');
    if (!networkContainer || !auth.currentUser) return;
    
    networkContainer.innerHTML = '<div class="loading">جاري تحميل الشبكة...</div>';
    
    try {
      const network = {};
      await this.loadNetworkRecursive(auth.currentUser.uid, network, 0, 5);
      
      this.renderNetwork(network, networkContainer);
      
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
    
    this.renderNetworkNode(auth.currentUser.uid, network, container, 0);
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
    } else {
      const newChildrenContainer = document.createElement('div');
      newChildrenContainer.className = 'node-children';
      
      for (const referredUserId in referrals) {
        this.renderNetworkNode(referredUserId, referrals, newChildrenContainer, level);
      }
      
      node.appendChild(newChildrenContainer);
    }
  }
}

// تهيئة النظام عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  new NetworkManager();
});