// dashboard.js
import { auth, database, ref, get, onValue } from './firebase.js';
import { checkPromotions, setupRankChangeListener, checkAdminStatus } from './firebase.js';
import { authManager } from './auth.js';

class DashboardManager {
  constructor() {
    this.userData = null;
    this.init();
  }

  async init() {
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
  }

  async loadUserData(userId) {
    try {
      const snapshot = await get(ref(database, 'users/' + userId));
      this.userData = snapshot.val();
      
      if (this.userData) {
        this.updateUserUI();
        this.loadRecentReferrals(userId);
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  }

  updateUserUI() {
    const usernameEl = document.getElementById('username');
    const userAvatar = document.getElementById('user-avatar');
    const pointsCount = document.getElementById('points-count');
    const joinDate = document.getElementById('join-date');
    const referralLink = document.getElementById('referral-link');
    
    if (usernameEl) usernameEl.textContent = this.userData.name;
    if (userAvatar) userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(this.userData.name)}&background=random`;
    if (pointsCount) pointsCount.textContent = this.userData.points || '0';
    if (joinDate) joinDate.textContent = new Date(this.userData.joinDate).toLocaleDateString('ar-SA');
    if (referralLink) referralLink.value = `${window.location.origin}${window.location.pathname}?ref=${this.userData.referralCode}`;
    
    // تحميل عدد الإحالات
    this.loadReferralsCount(auth.currentUser.uid);
    // تحميل معلومات المرتبة
    this.loadRankInfo();
    // التحقق من صلاحية المشرف وتحديث الواجهة
    this.checkAdminStatus();
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
      document.getElementById('referrals-count').textContent = count;
    } catch (error) {
      console.error("Error loading referrals count:", error);
    }
  }

  async loadRecentReferrals(userId) {
    try {
      const referralsRef = ref(database, 'userReferrals/' + userId);
      onValue(referralsRef, (snapshot) => {
        const referralsTable = document.getElementById('recent-referrals');
        
        if (!snapshot.exists()) {
          referralsTable.innerHTML = '<tr><td colspan="4" style="text-align: center;">لا توجد إحالات حتى الآن</td></tr>';
          return;
        }
        
        const referrals = snapshot.val();
        referralsTable.innerHTML = '';
        
        // عرض أحدث 5 إحالات فقط
        const recentReferrals = Object.entries(referrals)
          .sort((a, b) => new Date(b[1].joinDate) - new Date(a[1].joinDate))
          .slice(0, 5);
        
        recentReferrals.forEach(([userId, referralData]) => {
          const row = referralsTable.insertRow();
          row.innerHTML = `
            <td>${referralData.name}</td>
            <td>${referralData.email}</td>
            <td>${new Date(referralData.joinDate).toLocaleDateString('ar-SA')}</td>
            <td><span class="user-badge level-0">نشط</span></td>
          `;
        });
      });
    } catch (error) {
      console.error("Error loading recent referrals:", error);
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
      
      rankInfoElement.innerHTML = `
        <div class="rank-card">
          <h3>مرتبتك الحالية</h3>
          <div class="current-rank">
            <span class="rank-title">${rankTitles[currentRank]}</span>
            <span class="rank-level">المرتبة ${currentRank}</span>
          </div>
          <div class="next-rank">
            <h4>الترقية القادمة: ${rankTitles[nextRank]}</h4>
            <p>${nextRankRequirements[currentRank]}</p>
            ${currentRank === 0 ? `<div class="progress-bar">
              <div class="progress" style="width: ${Math.min((this.userData.points || 0) / 100 * 100, 100)}%"></div>
              <span>${this.userData.points || 0} / 100 نقطة</span>
            </div>` : ''}
          </div>
        </div>
      `;
    } catch (error) {
      console.error("Error loading rank info:", error);
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

  setupEventListeners() {
    // نسخ رابط الإحالة
    const copyBtn = document.getElementById('copy-link-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const referralLink = document.getElementById('referral-link');
        referralLink.select();
        document.execCommand('copy');
        alert('تم نسخ رابط الإحالة!');
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
}

// دالة يدوية للتحقق من الترقيات (للاستخدام في التصحيح)
window.checkPromotionManually = async () => {
  if (!auth.currentUser) return;
  
  try {
    // إنشاء عنصر تنبيه إذا لم يكن موجوداً
    let alert = document.getElementById('login-alert');
    if (!alert) {
      alert = document.createElement('div');
      alert.id = 'promotion-alert';
      alert.style.position = 'fixed';
      alert.style.top = '20px';
      alert.style.right = '20px';
      alert.style.zIndex = '1000';
      document.body.appendChild(alert);
    }
    
    alert.className = 'alert alert-info';
    alert.style.display = 'block';
    alert.textContent = 'جاري التحقق من الترقيات...';
    
    const promoted = await checkPromotions(auth.currentUser.uid);
    
    if (promoted) {
      alert.className = 'alert alert-success';
      alert.textContent = 'تمت الترقية بنجاح!';
    } else {
      alert.className = 'alert alert-info';
      alert.textContent = 'لا توجد ترقية متاحة حالياً';
    }
    
    setTimeout(() => {
      alert.style.display = 'none';
      window.location.reload();
    }, 3000);
    
  } catch (error) {
    console.error("Error in manual promotion check:", error);
    
    // عرض رسالة الخطأ
    const alert = document.getElementById('promotion-alert') || document.createElement('div');
    alert.className = 'alert alert-error';
    alert.style.display = 'block';
    alert.textContent = 'حدث خطأ أثناء التحقق من الترقيات';
    document.body.appendChild(alert);
    
    setTimeout(() => {
      alert.style.display = 'none';
    }, 3000);
  }
};

// إضافة زر للتحقق اليدوي من الترقيات (للتdebug)
document.addEventListener('DOMContentLoaded', () => {
  const rankSection = document.querySelector('.rank-section');
  if (rankSection) {
    const manualCheckBtn = document.createElement('button');
    manualCheckBtn.textContent = 'تحقق من الترقيات يدوياً';
    manualCheckBtn.className = 'action-btn';
    manualCheckBtn.style.marginTop = '10px';
    manualCheckBtn.onclick = window.checkPromotionManually;
    rankSection.appendChild(manualCheckBtn);
  }
});

// تهيئة النظام عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  new DashboardManager();
});
