// firebase.js
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
    
    console.log(`التحقق من ترقيات المستخدم: ${userId}, النقاط: ${userPoints}, المرتبة الحالية: ${currentRank}`);
    
    // التحقق من متطلبات كل مرتبة
    let newRank = currentRank;
    
    // المرتبة 1: 100 نقطة
    if (currentRank === 0 && userPoints >= 100) {
      newRank = 1;
      console.log(`المستخدم مؤهل للترقية إلى المرتبة 1`);
    }
    
    // إذا تمت ترقية المستخدم، تحديث البيانات
    if (newRank !== currentRank) {
      console.log(`ترقية المستخدم من المرتبة ${currentRank} إلى ${newRank}`);
      await update(userRef, {
        rank: newRank,
        lastPromotion: new Date().toISOString()
      });
      
      // بعد الترقية، تحقق من ترقية المُحيل إذا لزم الأمر
      if (userData.referredBy) {
        console.log(`المستخدم تمت إحالته بواسطة ${userData.referredBy}. التحقق من ترقيات الفريق...`);
        await checkTeamPromotions(userData.referredBy, newRank);
      }
      
      return true; // تمت ترقية
    }
    
    return false; // لم يتم ترقية
  } catch (error) {
    console.error("Error checking promotions:", error);
    return false;
  }
};

// التحقق من ترقية المُحيل بناءً على ترقية أحد أفراد الفريق
const checkTeamPromotions = async (referrerId, triggeredRank = null) => {
  try {
    console.log(`التحقق من ترقيات فريق المستخدم: ${referrerId}, المرتبة المحفزة: ${triggeredRank}`);
    
    const referrerRef = ref(database, 'users/' + referrerId);
    const referrerSnapshot = await get(referrerRef);
    const referrerData = referrerSnapshot.val();
    
    if (!referrerData) return;
    
    const currentRank = referrerData.rank || 0;
    
    // إذا كانت المرتبة الحالية هي الأعلى، لا داعي للتحقق
    if (currentRank >= 10) return;
    
    console.log(`مرتبة المحيل الحالية: ${currentRank}`);
    
    // التحقق من جميع المراتب الممكنة للترقية
    for (let targetRank = currentRank + 1; targetRank <= 10; targetRank++) {
      // المرتبة المطلوبة للفريق هي targetRank - 1
      const requiredTeamRank = targetRank - 1;
      
      // إذا كانت هناك مرتبة محفزة والمرتبة المطلوبة أعلى من المحفزة، تخطى
      if (triggeredRank && requiredTeamRank > triggeredRank) {
        continue;
      }
      
      // الحصول على جميع أفراد الفريق
      const teamRef = ref(database, 'userReferrals/' + referrerId);
      const teamSnapshot = await get(teamRef);
      
      if (!teamSnapshot.exists()) {
        console.log("لا يوجد أعضاء في الفريق");
        continue;
      }
      
      const teamMembers = teamSnapshot.val();
      let qualifiedMembers = 0;
      const qualifiedMembersList = [];
      
      console.log(`التحقق من ترقية إلى المرتبة ${targetRank}, يتطلب فريقًا بمرتبة ${requiredTeamRank} على الأقل`);
      
      // التحقق من عدد أفراد الفريق الذين حققوا المرتبة المطلوبة
      for (const memberId in teamMembers) {
        const memberRef = ref(database, 'users/' + memberId);
        const memberSnapshot = await get(memberRef);
        
        if (memberSnapshot.exists()) {
          const memberData = memberSnapshot.val();
          const memberRank = memberData.rank || 0;
          
          if (memberRank >= requiredTeamRank) {
            qualifiedMembers++;
            qualifiedMembersList.push({id: memberId, rank: memberRank});
            console.log(`عضو مؤهل: ${memberId} (المرتبة ${memberRank})`);
          }
        }
      }
      
      // إذا كان هناك 3 أفراد مؤهلين، ترقية المُحيل
      if (qualifiedMembers >= 3) {
        console.log(`تم العثور على ${qualifiedMembers} أعضاء مؤهلين للترقية إلى المرتبة ${targetRank}`);
        console.log('الأعضاء المؤهلون:', qualifiedMembersList);
        
        await update(referrerRef, {
          rank: targetRank,
          lastPromotion: new Date().toISOString()
        });
        
        console.log(`تم ترقية المحيل ${referrerId} إلى المرتبة ${targetRank}`);
        
        // تحقق من ترقية المُحيل الأعلى إذا لزم الأمر
        if (referrerData.referredBy) {
          console.log(`التحقق من ترقية المحيل الأعلى: ${referrerData.referredBy}`);
          await checkTeamPromotions(referrerData.referredBy, targetRank);
        }
        
        break; // توقف بعد أول ترقية ناجحة
      } else {
        console.log(`أعضاء مؤهلون: ${qualifiedMembers}/3 - لا توجد ترقية إلى المرتبة ${targetRank}`);
      }
    }
  } catch (error) {
    console.error("Error checking team promotions:", error);
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
    
    // تحديث النقاط
    await update(userRef, {
      points: newPoints
    });
    
    console.log(`تمت إضافة ${pointsToAdd} نقطة للمستخدم ${userId}. النقاط الجديدة: ${newPoints}`);
    
    // التحقق من الترقية بعد إضافة النقاط
    await checkPromotions(userId);
    
  } catch (error) {
    console.error("Error adding points:", error);
  }
};

// دالة للاستماع لتغيرات مراتب أعضاء الفريق والتحقق من الترقيات
const setupRankChangeListener = async (userId) => {
  try {
    // الحصول على فريق المستخدم
    const teamRef = ref(database, 'userReferrals/' + userId);
    const teamSnapshot = await get(teamRef);
    
    if (!teamSnapshot.exists()) return;
    
    const teamMembers = teamSnapshot.val();
    
    // الاستماع لتغيرات المرتبة لكل عضو في الفريق
    for (const memberId in teamMembers) {
      const memberRankRef = ref(database, 'users/' + memberId + '/rank');
      
      onValue(memberRankRef, async (snapshot) => {
        if (snapshot.exists()) {
          const newRank = snapshot.val();
          console.log(`تغيرت مرتبة العضو ${memberId} إلى ${newRank}`);
          
          // التحقق من إمكانية ترقية المستخدم
          await checkTeamPromotions(userId, newRank);
        }
      });
    }
  } catch (error) {
    console.error("Error setting up rank change listener:", error);
  }
};

// دالة للتحقق إذا كان المستخدم مشرفاً
const checkAdminStatus = async (userId) => {
  try {
    console.log("التحقق من صلاحية المشرف للمستخدم:", userId);
    const userRef = ref(database, 'users/' + userId);
    const userSnapshot = await get(userRef);
    
    if (!userSnapshot.exists()) {
      console.log("المستخدم غير موجود في قاعدة البيانات");
      return false;
    }
    
    const userData = userSnapshot.val();
    const isAdmin = userData.isAdmin === true;
    console.log("حالة المشرف للمستخدم", userId, "هي:", isAdmin);
    
    return isAdmin;
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
      
      // تطبيق فلتر الرتبة إذا كان محدداً
      if (rankFilter !== null && rankFilter !== '' && user.rank !== parseInt(rankFilter)) {
        continue;
      }
      
      // إذا كان هناك مصطلح البحث، تطبيق البحث
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

// دالة جديدة لتوزيع النقاط على مستويات الإحالة
const distributePointsToUplines = async (userId, pointsToAdd, adminId) => {
  try {
    // النسب للمستويات من 1 إلى 10
    const percentages = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]; // 10% للجيل الأول، 9% للثاني، ...، 1% للعاشر
    
    let currentUserId = userId;
    let distributedPoints = 0;
    
    // التوزيع عبر 10 مستويات
    for (let level = 0; level < 10; level++) {
      // الحصول على بيانات المستخدم الحالي
      const userRef = ref(database, 'users/' + currentUserId);
      const userSnapshot = await get(userRef);
      
      if (!userSnapshot.exists()) break;
      
      const userData = userSnapshot.val();
      
      // إذا لم يكن هناك محيل، توقف
      if (!userData.referredBy) break;
      
      // العثور على المحيل (المستخدم في المستوى الأعلى)
      const referrerId = await getUserIdFromReferralCode(userData.referredBy);
      if (!referrerId) break;
      
      const referrerRef = ref(database, 'users/' + referrerId);
      const referrerSnapshot = await get(referrerRef);
      
      if (!referrerSnapshot.exists()) break;
      
      const referrerData = referrerSnapshot.val();
      const currentReferrerPoints = referrerData.points || 0;
      
      // حساب النقاط التي سيتم إضافتها للمحيل
      const pointsForUpline = Math.round(pointsToAdd * (percentages[level] / 100));
      
      if (pointsForUpline > 0) {
        // تحديث نقاط المحيل
        await update(referrerRef, {
          points: currentReferrerPoints + pointsForUpline
        });
        
        distributedPoints += pointsForUpline;
        
        console.log(`تم إضافة ${pointsForUpline} نقطة للمحيل ${referrerId} في المستوى ${level + 1}`);
        
        // تسجيل عملية التوزيع
        const distributionLogRef = ref(database, 'pointDistributionLogs/' + Date.now());
        await set(distributionLogRef, {
          sourceUserId: userId,
          targetUserId: referrerId,
          points: pointsForUpline,
          level: level + 1,
          percentage: percentages[level],
          distributedBy: adminId,
          timestamp: new Date().toISOString()
        });
        
        // التحقق من ترقية المحيل
        await checkPromotions(referrerId);
      }
      
      // الانتقال إلى المحيل في المستوى الأعلى
      currentUserId = referrerId;
    }
    
    // تسجيل إجمالي النقاط الموزعة
    if (distributedPoints > 0) {
      const totalDistributionRef = ref(database, 'totalDistributions/' + Date.now());
      await set(totalDistributionRef, {
        sourceUserId: userId,
        totalDistributed: distributedPoints,
        originalPoints: pointsToAdd,
        distributedBy: adminId,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error("Error distributing points to uplines:", error);
  }
};

// دالة معدلة لإضافة النقاط مع التوزيع التلقائي
const addPointsToUser = async (userId, pointsToAdd, adminId) => {
  try {
    // التحقق من أن المستخدم الذي يضيف النقاط هو مشرف
    const isAdmin = await checkAdminStatus(adminId);
    if (!isAdmin) {
      throw new Error("ليست لديك صلاحية إضافة النقاط");
    }
    
    const userRef = ref(database, 'users/' + userId);
    const userSnapshot = await get(userRef);
    
    if (!userSnapshot.exists()) {
      throw new Error("المستخدم غير موجود");
    }
    
    const userData = userSnapshot.val();
    const currentPoints = userData.points || 0;
    const newPoints = currentPoints + pointsToAdd;
    
    // تحديث النقاط
    await update(userRef, {
      points: newPoints
    });
    
    // تسجيل العملية في سجل المشرفين
    const adminLogRef = ref(database, 'adminLogs/' + Date.now());
    await set(adminLogRef, {
      adminId: adminId,
      userId: userId,
      action: 'add_points',
      points: pointsToAdd,
      timestamp: new Date().toISOString()
    });
    
    console.log(`تمت إضافة ${pointsToAdd} نقطة للمستخدم ${userId} بواسطة المشرف ${adminId}`);
    
    // توزيع النقاط على أعضاء الشبكة (الخط العلوي)
    await distributePointsToUplines(userId, pointsToAdd, adminId);
    
    // التحقق من الترقية بعد إضافة النقاط
    await checkPromotions(userId);
    
    return newPoints;
  } catch (error) {
    console.error("Error adding points to user:", error);
    throw error;
  }
};

// دالة لتحديث حالة المشرف للمستخدم
const updateAdminStatus = async (userId, isAdmin, currentAdminId) => {
  try {
    // التحقق من أن المستخدم الحالي هو مشرف
    const currentUserIsAdmin = await checkAdminStatus(currentAdminId);
    if (!currentUserIsAdmin) {
      throw new Error("ليست لديك صلاحية تعديل صلاحيات المشرفين");
    }
    
    const userRef = ref(database, 'users/' + userId);
    await update(userRef, {
      isAdmin: isAdmin
    });
    
    console.log(`تم ${isAdmin ? 'منح' : 'إزالة'} صلاحية المشرف للمستخدم ${userId} بواسطة ${currentAdminId}`);
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
  checkPromotions, checkTeamPromotions, addPointsAndCheckPromotion, setupRankChangeListener,
  checkAdminStatus, getAllUsers, searchUsers, addPointsToUser, updateAdminStatus,
  getUserIdFromReferralCode, distributePointsToUplines
};
