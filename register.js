// register.js
import { auth, createUserWithEmailAndPassword } from './firebase.js';
import { database, ref, set, get, child, update } from './firebase.js';
import { addPointsAndCheckPromotion, setupRankChangeListener } from './firebase.js';
import { authManager } from './auth.js';

class RegisterManager {
  constructor() {
    this.setupEventListeners();
    this.checkReferralCode();
  }

  setupEventListeners() {
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
      registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleRegister();
      });
    }
  }

  checkReferralCode() {
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    if (refCode) {
      document.getElementById('referral-code').value = refCode;
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

  async getUserIdFromReferralCode(referralCode) {
    try {
      const snapshot = await get(child(ref(database), `referralCodes/${referralCode}`));
      return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
      console.error("Error getting user ID from referral code:", error);
      return null;
    }
  }

  async processReferral(referralCode, newUserId, name, email, phone, address) {
    try {
      const referrerId = await this.getUserIdFromReferralCode(referralCode);
      if (!referrerId) return;
      
      await set(ref(database, `userReferrals/${referrerId}/${newUserId}`), {
        name: name,
        email: email,
        phone: phone,
        address: address,
        joinDate: new Date().toISOString(),
        level: 1
      });
      
      // استخدام الدالة الجديدة لإضافة النقاط والتحقق من الترقية
      await addPointsAndCheckPromotion(referrerId, 10);
      
      // بدء الاستماع لتغيرات مرتبة العضو الجديد
      await setupRankChangeListener(referrerId);
      
    } catch (error) {
      console.error("Error processing referral:", error);
    }
  }

  async handleRegister() {
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const phone = document.getElementById('register-phone').value;
    const address = document.getElementById('register-address').value;
    const password = document.getElementById('register-password').value;
    const referralCode = document.getElementById('referral-code').value;
    const alert = document.getElementById('register-alert');
    
    if (!name || !email || !password || !phone || !address) {
      authManager.showAlert(alert, 'error', 'يرجى ملء جميع الحقول الإلزامية');
      return;
    }
    
    try {
      authManager.showAlert(alert, 'info', 'جاري إنشاء الحساب...');
      
      // إنشاء المستخدم في Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const userId = userCredential.user.uid;
      
      // إنشاء رمز إحالة فريد
      const userReferralCode = this.generateReferralCode();
      
      // حفظ بيانات المستخدم في Realtime Database
      await set(ref(database, 'users/' + userId), {
        name: name,
        email: email,
        phone: phone,
        address: address,
        referralCode: userReferralCode,
        points: 0,
        rank: 0,
        joinDate: new Date().toISOString(),
        referredBy: referralCode || null
      });
      
      // حفظ رمز الإحالة للبحث السريع
      await set(ref(database, 'referralCodes/' + userReferralCode), userId);
      
      // إذا كان هناك رمز إحالة، إضافة العلاقة
      if (referralCode) {
        await this.processReferral(referralCode, userId, name, email, phone, address);
      }
      
      authManager.showAlert(alert, 'success', 'تم إنشاء الحساب بنجاح');
      
      // الانتقال إلى لوحة التحكم بعد ثانية
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1000);
      
    } catch (error) {
      authManager.showAlert(alert, 'error', error.message);
    }
  }
}

// تهيئة النظام عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  new RegisterManager();
});
