// استيراد دوال Firebase
import { 
  auth, database, serverTimestamp,
  ref, onValue, push, set, update,
  onAuthStateChanged
} from './firebase.js';

// عناصر DOM
const usersList = document.getElementById('users-list');
const activeChat = document.getElementById('active-chat');
const messagesContent = document.getElementById('messages-content');
const messageInput = document.getElementById('message-input');
const sendMessageBtn = document.getElementById('send-message-btn');
const currentChatUser = document.getElementById('current-chat-user');
const noChatSelected = document.querySelector('.no-chat-selected');
const adminIcon = document.getElementById('admin-icon');

// متغيرات النظام
let currentUserData = null;
let activeUserId = null;
let messagesListener = null;
let userMessages = {};
let userUnreadCounts = {};

// تحميل البيانات عند بدء التحميل
document.addEventListener('DOMContentLoaded', () => {
    checkAuthState();
});

// التحقق من حالة المصادقة
function checkAuthState() {
    onAuthStateChanged(auth, user => {
        if (!user) {
            // توجيه إلى صفحة التسجيل إذا لم يكن المستخدم مسجلاً
            window.location.href = 'auth.html';
            return;
        }
        
        // تحميل بيانات المستخدم الحالي
        const userRef = ref(database, 'users/' + user.uid);
        onValue(userRef, (snapshot) => {
            if (snapshot.exists()) {
                currentUserData = snapshot.val();
                currentUserData.uid = user.uid;
                
                // إظهار أيقونة الإدارة إذا كان المستخدم مشرفاً
                if (currentUserData.isAdmin) {
                    adminIcon.style.display = 'flex';
                    loadAllUsersForAdmin(user.uid);
                } else {
                    loadAdminUsersForMessages(user.uid);
                }
            }
        });
    });
}








// messages.js - إضافة هذا الكود في بداية تحميل الصفحة

// التحقق من وجود محادثة خاصة
const privateChatData = JSON.parse(localStorage.getItem('privateChat'));
if (privateChatData && privateChatData.isPrivateChat) {
    // تحميل المستخدم المحدد فقط
    loadPrivateChatUser(privateChatData.userId, privateChatData.userType);
    
    // تنظيف البيانات بعد الاستخدام
    localStorage.removeItem('privateChat');
}

// دالة لتحميل مستخدم محدد للمحادثة
function loadPrivateChatUser(userId, userType) {
    const usersRef = ref(database, 'users/' + userId);
    onValue(usersRef, (snapshot) => {
        if (snapshot.exists()) {
            const userData = { id: userId, ...snapshot.val() };
            // فتح المحادثة تلقائياً
            openChat(userData);
            
            // تحديث عنوان المحادثة
            currentChatUser.textContent = `${userData.name} (${userType})`;
        }
    });
}


// تحميل جميع المستخدمين للمشرف
function loadAllUsersForAdmin(currentUserId) {
    const usersRef = ref(database, 'users');
    onValue(usersRef, (snapshot) => {
        usersList.innerHTML = '';
        userMessages = {};
        userUnreadCounts = {};
        
        if (snapshot.exists()) {
            const users = snapshot.val();
            const usersArray = [];
            
            for (const userId in users) {
                if (userId !== currentUserId) {
                    usersArray.push({ id: userId, ...users[userId] });
                }
            }
            
            // عرض قائمة المستخدمين
            displayUsersList(usersArray, currentUserId);
            
            // تحميل رسائل المستخدمين
            loadUserMessages(usersArray, currentUserId);
        } else {
            usersList.innerHTML = '<p class="no-users">لا يوجد مستخدمين</p>';
        }
    });
}

// تحميل الإدارة فقط للمستخدم العادي
function loadAdminUsersForMessages(currentUserId) {
    usersList.innerHTML = '';
    
    const usersRef = ref(database, 'users');
    onValue(usersRef, (snapshot) => {
        if (snapshot.exists()) {
            const users = snapshot.val();
            const adminUsers = [];
            
            for (const userId in users) {
                if (users[userId].isAdmin && userId !== currentUserId) {
                    adminUsers.push({ id: userId, ...users[userId] });
                }
            }
            
            if (adminUsers.length > 0) {
                displayUsersList(adminUsers, currentUserId);
                loadUserMessages(adminUsers, currentUserId);
            } else {
                usersList.innerHTML = '<p class="no-users">لا يوجد مشرفين متاحين</p>';
            }
        } else {
            usersList.innerHTML = '<p class="no-users">لا يوجد مستخدمين</p>';
        }
    });
}

// عرض قائمة المستخدمين
function displayUsersList(users, currentUserId) {
    usersList.innerHTML = '';
    
    users.forEach(user => {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.dataset.userId = user.id;
        
        userItem.innerHTML = `
            <div class="user-avatar">
                <i class="fas fa-user"></i>
            </div>
            <div class="user-info">
                <div class="user-name">${user.name || 'مستخدم'}</div>
                <div class="user-status">${user.isAdmin ? 'مشرف' : 'مستخدم'}</div>
            </div>
            ${userUnreadCounts[user.id] > 0 ? `
                <div class="unread-badge">${userUnreadCounts[user.id]}</div>
            ` : ''}
        `;
        
        userItem.addEventListener('click', () => {
            openChat(user);
        });
        
        usersList.appendChild(userItem);
    });
}

// تحميل رسائل المستخدمين
function loadUserMessages(users, currentUserId) {
    // إزالة المستمع السابق إذا كان موجوداً
    if (messagesListener) {
        messagesListener();
    }
    
    const messagesRef = ref(database, 'messages');
    messagesListener = onValue(messagesRef, (snapshot) => {
        userMessages = {};
        userUnreadCounts = {};
        
        if (snapshot.exists()) {
            const messages = snapshot.val();
            
            // تجميع الرسائل حسب المستخدم
            for (const messageId in messages) {
                const message = messages[messageId];
                
                // تحديد المستخدم الآخر في المحادثة
                let otherUserId;
                if (message.senderId === currentUserId) {
                    otherUserId = message.receiverId;
                } else if (message.receiverId === currentUserId) {
                    otherUserId = message.senderId;
                    
                    // عد الرسائل غير المقروءة
                    if (!message.isRead) {
                        userUnreadCounts[otherUserId] = (userUnreadCounts[otherUserId] || 0) + 1;
                    }
                } else {
                    continue;
                }
                
                // إضافة الرسالة إلى مجموعة المستخدم
                if (!userMessages[otherUserId]) {
                    userMessages[otherUserId] = [];
                }
                userMessages[otherUserId].push({ id: messageId, ...message });
            }
            
            // تحديث واجهة المستخدم
            updateUnreadCounts();
        }
    });
}

// تحديث عدد الرسائل غير المقروءة
function updateUnreadCounts() {
    document.querySelectorAll('.user-item').forEach(item => {
        const userId = item.dataset.userId;
        const badge = item.querySelector('.unread-badge');
        
        if (userUnreadCounts[userId] > 0) {
            if (!badge) {
                const newBadge = document.createElement('div');
                newBadge.className = 'unread-badge';
                newBadge.textContent = userUnreadCounts[userId];
                item.appendChild(newBadge);
            } else {
                badge.textContent = userUnreadCounts[userId];
            }
            
            item.classList.add('unread');
        } else {
            if (badge) {
                badge.remove();
            }
            item.classList.remove('unread');
        }
    });
}

// فتح محادثة مع مستخدم
function openChat(user) {
    activeUserId = user.id;
    
    // تحديث واجهة المستخدم
    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.userId === user.id) {
            item.classList.add('active');
        }
    });
    
    currentChatUser.textContent = user.name || 'مستخدم';
    noChatSelected.classList.add('hidden');
    activeChat.classList.remove('hidden');
    
    // تحميل رسائل المحادثة
    displayMessages(user.id);
    
    // وضع علامة على الرسائل كمقروءة
    markMessagesAsRead(user.id);
}

// عرض الرسائل في المحادثة
function displayMessages(userId) {
    messagesContent.innerHTML = '';
    
    if (userMessages[userId]) {
        // ترتيب الرسائل حسب الوقت
        const sortedMessages = userMessages[userId].sort((a, b) => a.timestamp - b.timestamp);
        
        sortedMessages.forEach(message => {
            addMessageToChat(message, userId);
        });
        
        // التمرير إلى أحدث رسالة
        messagesContent.scrollTop = messagesContent.scrollHeight;
    } else {
        messagesContent.innerHTML = '<p class="no-messages">لا توجد رسائل بعد</p>';
    }
}

// إضافة رسالة إلى الدردشة
function addMessageToChat(message, userId) {
    const messageElement = document.createElement('div');
    const isSent = message.senderId === auth.currentUser.uid;
    
    messageElement.className = `message ${isSent ? 'sent' : 'received'}`;
    
    // تنسيق الوقت
    const time = message.timestamp ? new Date(message.timestamp).toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit'
    }) : 'الآن';
    
    messageElement.innerHTML = `
        <div class="message-content">${message.content}</div>
        <div class="message-time">${time}</div>
    `;
    
    messagesContent.appendChild(messageElement);
}

// وضع علامة على الرسائل كمقروءة
function markMessagesAsRead(userId) {
    const user = auth.currentUser;
    if (!user) return;
    
    if (userMessages[userId]) {
        const updates = {};
        
        userMessages[userId].forEach(message => {
            if (message.receiverId === user.uid && !message.isRead) {
                updates[`/messages/${message.id}/isRead`] = true;
            }
        });
        
        if (Object.keys(updates).length > 0) {
            update(ref(database), updates);
        }
    }
}

// إرسال رسالة
sendMessageBtn.addEventListener('click', () => {
    const message = messageInput.value.trim();
    if (!message || !activeUserId) return;
    
    sendMessageToUser(message, auth.currentUser, activeUserId);
    messageInput.value = '';
});

// دالة منفصلة لإرسال الرسالة
function sendMessageToUser(message, user, receiverId) {
    const newMessage = {
        senderId: user.uid,
        receiverId: receiverId,
        content: message,
        timestamp: serverTimestamp(),
        isRead: false
    };
    
    const messagesRef = ref(database, 'messages');
    push(messagesRef, newMessage);
}
