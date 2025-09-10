// auth.js - نظام المصادقة الموحد لمنصة تسريع
import { 
  auth, database, ref, set, get, onValue, update,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut 
} from './firebase.js';

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.userData = null;
    this.isAdmin = false;
    
    this.init();
  }

  async init() {
    this.setupAuthStateListener();
    
    // إذا كانت الصفحة تحتوي على عناصر مصادقة، قم بإعدادها
    if (document.getElementById('login-form') || document.getElementById('register-form')) {
      this.setupEventListeners();
    }
  }

  setupEventListeners() {
    // إعداد مستمعي الأحداث للنماذج
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleLogin();
      });
    }
    
    if (registerForm) {
      registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleRegister();
      });
    }
    
    // إعداد علامات التبويب إذا وجدت
    const authTabs = document.querySelector('.auth-tabs');
    if (authTabs) {
      authTabs.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-btn')) {
          this.switchTab(e.target.dataset.tab);
        }
      });
    }
  }

  switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    if (tabName === 'login') {
      document.getElementById('login-form').classList.remove('hidden');
      document.getElementById('register-form').classList.add('hidden');
    } else {
      document.getElementById('login-form').classList.add('hidden');
      document.getElementById('register-form').classList.remove('hidden');
    }
    
    this.hideAlert();
  }

  async handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const alert = document.getElementById('login-alert') || document.getElementById('auth-message');
    
    if (!email || !password) {
      this.showAlert(alert, 'error', 'يرجى ملء جميع الحقول');
      return;
    }
    
    try {
      this.showAlert(alert, 'info', 'جاري تسجيل الدخول...');
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // الحصول على بيانات المستخدم
      const userSnapshot = await get(ref(database, 'users/' + user.uid));
      if (userSnapshot.exists()) {
        this.userData = userSnapshot.val();
        
        this.showAlert(alert, 'success', 'تم تسجيل الدخول بنجاح');
        
        // التوجيه إلى لوحة التحكم
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 1000);
      }
    } catch (error) {
      this.showAlert(alert, 'error', this.getAuthErrorMessage(error.code));
    }
  }

  async handleRegister() {
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const phone = document.getElementById('register-phone')?.value;
    const address = document.getElementById('register-address')?.value;
    const referralCode = document.getElementById('referral-code')?.value;
    
    const alert = document.getElementById('register-alert') || document.getElementById('auth-message');
    
    if (!name || !email || !password) {
      this.showAlert(alert, 'error', 'يرجى ملء جميع الحقول الإلزامية');
      return;
    }
    
    try {
      this.showAlert(alert, 'info', 'جاري إنشاء الحساب...');
      const userCredential = await createUserWithEmailAndPassword(aauth, email, password);
      const user = userCredential.user;
      
      // بيانات المستخدم الأساسية
      const userData = {
        name: name,
        email: email,
        phone: phone || '',
        address: address || '',
        createdAt: new Date().toISOString(),
        isAdmin: false,
        points: 0,
        rank: 0
      };
      
      // إنشاء رمز إحالة فريد
      userData.referralCode = this.generateReferralCode();
      userData.referredBy = referralCode || null;
      
      // حفظ رمز الإحالة للبحث السريع
      await set(ref(database, 'referralCodes/' + userData.referralCode), user.uid);
      
      // حفظ بيانات المستخدم
      await set(ref(database, 'users/' + user.uid), userData);
      
      // معالجة الإحالة إذا وجدت
      if (referralCode) {
        await this.processReferral(referralCode, user.uid, name, email);
      }
      
      this.showAlert(alert, 'success', 'تم إنشاء الحساب بنجاح');
      
      // التوجيه إلى لوحة التحكم
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1000);
      
    } catch (error) {
      this.showAlert(alert, 'error', this.getAuthErrorMessage(error.code));
    }
  }

  generateReferralCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  }

  async processReferral(referralCode, newUserId, name, email) {
    try {
      const snapshot = await get(ref(database, 'referralCodes/' + referralCode));
      if (!snapshot.exists()) return;
      
      const referrerId = snapshot.val();
      
      await set(ref(database, `userReferrals/${referrerId}/${newUserId}`), {
        name: name,
        email: email,
        joinDate: new Date().toISOString(),
        level: 1
      });
      
      // إضافة النقاط للمُحيل
      await this.addPoints(referrerId, 10);
      
    } catch (error) {
      console.error("Error processing referral:", error);
    }
  }

  async addPoints(userId, points) {
    try {
      const userRef = ref(database, 'users/' + userId);
      const snapshot = await get(userRef);
      
      if (snapshot.exists()) {
        const userData = snapshot.val();
        const currentPoints = userData.points || 0;
        
        await update(userRef, {
          points: currentPoints + points
        });
        
        // التحقق من الترقيات
        await this.checkPromotions(userId);
      }
    } catch (error) {
      console.error("Error adding points:", error);
    }
  }

  async checkPromotions(userId) {
    try {
      const userRef = ref(database, 'users/' + userId);
      const userSnapshot = await get(userRef);
      const userData = userSnapshot.val();
      
      if (!userData) return false;
      
      const currentRank = userData.rank || 0;
      const userPoints = userData.points || 0;
      
      let newRank = currentRank;
      
      // نظام الترقيات
      if (currentRank === 0 && userPoints >= 100) {
        newRank = 1;
      } else if (currentRank === 1 && userPoints >= 300) {
        newRank = 2;
      } else if (currentRank === 2 && userPoints >= 600) {
        newRank = 3;
      }
      // يمكن إضافة المزيد من مستويات الترقية هنا
      
      if (newRank !== currentRank) {
        await update(userRef, {
          rank: newRank,
          lastPromotion: new Date().toISOString()
        });
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error("Error checking promotions:", error);
      return false;
    }
  }

  setupAuthStateListener() {
    onAuthStateChanged(auth, async (user) => {
      this.currentUser = user;
      
      if (user && (window.location.pathname.includes('login') || 
                   window.location.pathname.includes('register') ||
                   window.location.pathname.includes('auth'))) {
        // إذا كان المستخدم مسجلاً بالفعل، انتقل إلى لوحة التحكم
        window.location.href = 'dashboard.html';
      }
    });
  }

  showAlert(element, type, message) {
    if (!element) return;
    
    element.textContent = message;
    element.className = `alert alert-${type}`;
    element.style.display = 'block';
    
    setTimeout(() => {
      element.style.display = 'none';
    }, 3000);
  }

  hideAlert() {
    const alert = document.getElementById('login-alert') || 
                  document.getElementById('register-alert') || 
                  document.getElementById('auth-message');
    if (alert) {
      alert.style.display = 'none';
    }
  }

  getAuthErrorMessage(code) {
    switch(code) {
      case 'auth/invalid-email': return 'البريد الإلكتروني غير صالح';
      case 'auth/user-disabled': return 'هذا الحساب معطل';
      case 'auth/user-not-found': return 'لا يوجد حساب مرتبط بهذا البريد الإلكتروني';
      case 'auth/wrong-password': return 'كلمة المرور غير صحيحة';
      case 'auth/email-already-in-use': return 'هذا البريد الإلكتروني مستخدم بالفعل';
      case 'auth/weak-password': return 'كلمة المرور ضعيفة (يجب أن تحتوي على 6 أحرف على الأقل)';
      default: return 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى';
    }
  }

  async handleLogout() {
    try {
      await signOut(auth);
      window.location.href = 'index.html';
    } catch (error) {
      console.error("Error signing out:", error);
    }
  }
}

// تهيئة النظام عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  window.authManager = new AuthManager();
});