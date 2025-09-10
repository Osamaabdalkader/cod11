// firebase.js - الملف المحدث لمنصة تسريع
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-analytics.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut,
  setPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { 
  getDatabase, 
  ref, 
  set, 
  push, 
  onValue, 
  serverTimestamp, 
  update, 
  remove, 
  query, 
  orderByChild, 
  equalTo,
  get,
  child
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js";
import { 
  getStorage, 
  ref as storageRef, 
  uploadBytesResumable, 
  getDownloadURL 
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAzYZMxqNmnLMGYnCyiJYPg2MbxZMt0co0",
  authDomain: "osama-91b95.firebaseapp.com",
  databaseURL: "https://osama-91b95-default-rtdb.firebaseio.com",
  projectId: "osama-91b95",
  storageBucket: "osama-91b95.appspot.com",
  messagingSenderId: "118875905722",
  appId: "1:118875905722:web:200bff1bd99db2c1caac83",
  measurementId: "G-LEM5PVPJZC"
};

// Initialize Firebase
let app;
let analytics;
let auth;
let database;
let storage;

try {
  app = initializeApp(firebaseConfig);
  analytics = getAnalytics(app);
  auth = getAuth(app);
  database = getDatabase(app);
  storage = getStorage(app);
  
  // جعل حالة تسجيل الدخول تستمر خلال الجلسة
  setPersistence(auth, browserSessionPersistence)
    .catch((error) => {
      console.error("Error setting persistence:", error);
    });
  
  console.log("Firebase initialized successfully");
} catch (error) {
  console.error("Firebase initialization error:", error);
}

// دالة للتحقق من الترقيات
const checkPromotions = async (userId) => {
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
    } else if (currentRank === 3 && userPoints >= 1000) {
      newRank = 4;
    } else if (currentRank === 4 && userPoints >= 1500) {
      newRank = 5;
    }
    
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
};

// دالة لزيادة النقاط والتحقق من الترقية
const addPointsAndCheckPromotion = async (userId, pointsToAdd) => {
  try {
    const userRef = ref(database, 'users/' + userId);
    const userSnapshot = await get(userRef);
    
    if (!userSnapshot.exists()) return;
    
    const userData = userSnapshot.val();
    const currentPoints = userData.points || 0;
    const newPoints = currentPoints + pointsToAdd;
    
    await update(userRef, {
      points: newPoints
    });
    
    await checkPromotions(userId);
    
  } catch (error) {
    console.error("Error adding points:", error);
  }
};

// دالة للتحقق إذا كان المستخدم مشرفاً
const checkAdminStatus = async (userId) => {
  try {
    const userRef = ref(database, 'users/' + userId);
    const userSnapshot = await get(userRef);
    
    if (!userSnapshot.exists()) {
      return false;
    }
    
    const userData = userSnapshot.val();
    return userData.isAdmin === true;
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
};

// دالة للحصول على جميع المستخدمين
const getAllUsers = async () => {
  try {
    const usersRef = ref(database, 'users');
    const snapshot = await get(usersRef);
    
    if (!snapshot.exists()) return [];
    
    return snapshot.val();
  } catch (error) {
    console.error("Error getting all users:", error);
    return [];
  }
};

// دالة للبحث عن المستخدمين
const searchUsers = async (searchTerm, rankFilter = null) => {
  try {
    const usersRef = ref(database, 'users');
    const snapshot = await get(usersRef);
    
    if (!snapshot.exists()) return [];
    
    const allUsers = snapshot.val();
    const results = [];
    
    for (const userId in allUsers) {
      const user = allUsers[userId];
      
      if (rankFilter !== null && rankFilter !== '' && user.rank !== parseInt(rankFilter)) {
        continue;
      }
      
      if (searchTerm && searchTerm.trim() !== '') {
        const searchTermLower = searchTerm.toLowerCase();
        const nameMatch = user.name && user.name.toLowerCase().includes(searchTermLower);
        const emailMatch = user.email && user.email.toLowerCase().includes(searchTermLower);
        
        if (!nameMatch && !emailMatch) {
          continue;
        }
      }
      
      results.push({ id: userId, ...user });
    }
    
    return results;
  } catch (error) {
    console.error("Error searching users:", error);
    return [];
  }
};

// دالة مساعدة للحصول على معرف المستخدم من رمز الإحالة
const getUserIdFromReferralCode = async (referralCode) => {
  try {
    const snapshot = await get(child(ref(database), `referralCodes/${referralCode}`));
    return snapshot.exists() ? snapshot.val() : null;
  } catch (error) {
    console.error("Error getting user ID from referral code:", error);
    return null;
  }
};

// دالة لتحديد حالة المشرف للمستخدم
const updateAdminStatus = async (userId, isAdmin, currentAdminId) => {
  try {
    const currentUserIsAdmin = await checkAdminStatus(currentAdminId);
    if (!currentUserIsAdmin) {
      throw new Error("ليست لديك صلاحية تعديل صلاحيات المشرفين");
    }
    
    const userRef = ref(database, 'users/' + userId);
    await update(userRef, {
      isAdmin: isAdmin
    });
    
    return true;
  } catch (error) {
    console.error("Error updating admin status:", error);
    throw error;
  }
};

// تصدير الكائنات لاستخدامها في ملفات أخرى
export { 
  app, analytics, auth, database, storage,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut,
  ref, set, push, onValue, serverTimestamp, update, remove, query, orderByChild, equalTo, get, child,
  storageRef, uploadBytesResumable, getDownloadURL,
  checkPromotions, addPointsAndCheckPromotion,
  checkAdminStatus, getAllUsers, searchUsers, updateAdminStatus,
  getUserIdFromReferralCode
};