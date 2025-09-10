// auth.js - الملف المشترك للمصادقة
import { auth, onAuthStateChanged, signOut } from './firebase.js';
import { checkAdminStatus, onValue, ref, database } from './firebase.js';

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.userData = null;
    this.isAdmin = false;
    this.adminListeners = [];
  }

  async init() {
    return new Promise((resolve) => {
      onAuthStateChanged(auth, async (user) => {
        this.currentUser = user;
        if (user) {
          console.log("تم تسجيل دخول المستخدم:", user.uid);
          // التحقق من صلاحية المشرف
          await this.checkAndUpdateAdminStatus(user.uid);
          
          // إعداد مستمع لتغيرات حالة المشرف
          this.setupAdminStatusListener(user.uid);
          
          resolve(user);
        } else {
          console.log("لا يوجد مستخدم مسجل دخول");
          this.isAdmin = false;
          this.updateAuthUI(false);
          resolve(null);
        }
      });
    });
  }

  async checkAndUpdateAdminStatus(userId) {
    try {
      console.log("جاري التحقق من صلاحية المشرف للمستخدم:", userId);
      this.isAdmin = await checkAdminStatus(userId);
      console.log("صلاحية المشرف:", this.isAdmin);
      this.updateAuthUI(true);
      return this.isAdmin;
    } catch (error) {
      console.error("Error checking admin status:", error);
      this.isAdmin = false;
      this.updateAuthUI(true);
      return false;
    }
  }

  setupAdminStatusListener(userId) {
    // التوقف عن أي مستمعين سابقين
    this.removeAdminListeners();
    
    // الاستماع لتغيرات حالة المشرف في الوقت الحقيقي
    const adminStatusRef = ref(database, 'users/' + userId + '/isAdmin');
    
    const unsubscribe = onValue(adminStatusRef, (snapshot) => {
      if (snapshot.exists()) {
        this.isAdmin = snapshot.val();
        console.log("تم تحديث حالة المشرف:", this.isAdmin);
        this.updateAuthUI(true);
        
        // إشعار جميع المستمعين بالتغيير
        this.notifyAdminStatusChange(this.isAdmin);
      }
    });
    
    this.adminListeners.push(unsubscribe);
  }

  removeAdminListeners() {
    // إزالة جميع المستمعين السابقين
    this.adminListeners.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this.adminListeners = [];
  }

  addAdminStatusListener(callback) {
    this.adminListeners.push(callback);
  }

  notifyAdminStatusChange(isAdmin) {
    this.adminListeners.forEach(callback => {
      if (typeof callback === 'function') {
        callback(isAdmin);
      }
    });
  }

  async handleLogout() {
    try {
      this.removeAdminListeners();
      await signOut(auth);
      window.location.href = 'index.html';
    } catch (error) {
      console.error("Error signing out:", error);
    }
  }

  updateAuthUI(isLoggedIn) {
    const authElements = document.querySelectorAll('.auth-only');
    const unauthElements = document.querySelectorAll('.unauth-only');
    const adminElements = document.querySelectorAll('.admin-only');
    
    if (isLoggedIn) {
      authElements.forEach(el => el.style.display = 'block');
      unauthElements.forEach(el => el.style.display = 'none');
      
      // إظهار عناصر المشرفين فقط إذا كان المستخدم مشرفاً
      if (this.isAdmin) {
        adminElements.forEach(el => {
          el.style.display = 'block';
          console.log("تم عرض عنصر المشرفين:", el);
        });
      } else {
        adminElements.forEach(el => {
          el.style.display = 'none';
          console.log("تم إخفاء عنصر المشرفين:", el);
        });
      }
    } else {
      authElements.forEach(el => el.style.display = 'none');
      adminElements.forEach(el => el.style.display = 'none');
      unauthElements.forEach(el => el.style.display = 'block');
    }
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

  // التحقق من صلاحية المشرف - الإصدار المعدل
  async checkAdminAccess() {
    try {
      if (!this.currentUser) {
        console.log("لا يوجد مستخدم حالي");
        return false;
      }
      
      console.log("التحقق من صلاحية المشرف للمستخدم:", this.currentUser.uid);
      
      // التحقق مباشرة من قاعدة البيانات
      const isAdmin = await checkAdminStatus(this.currentUser.uid);
      console.log("نتيجة التحقق من الصلاحية:", isAdmin);
      
      if (!isAdmin) {
        console.log("ليست لديك صلاحية الوصول إلى هذه الصفحة");
        return false;
      }
      
      console.log("تم التحقق من الصلاحية بنجاح");
      return true;
    } catch (error) {
      console.error("خطأ في التحقق من صلاحية المشرف:", error);
      return false;
    }
  }
}

export const authManager = new AuthManager();
