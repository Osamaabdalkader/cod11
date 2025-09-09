// login.js
import { auth, signInWithEmailAndPassword } from './firebase.js';
import { authManager } from './auth.js';

class LoginManager {
  constructor() {
    this.setupEventListeners();
  }

  setupEventListeners() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleLogin();
      });
    }
  }

  async handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const alert = document.getElementById('login-alert');
    
    if (!email || !password) {
      authManager.showAlert(alert, 'error', 'يرجى ملء جميع الحقول');
      return;
    }
    
    try {
      authManager.showAlert(alert, 'info', 'جاري تسجيل الدخول...');
      await signInWithEmailAndPassword(auth, email, password);
      authManager.showAlert(alert, 'success', 'تم تسجيل الدخول بنجاح');
      
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
  new LoginManager();
});