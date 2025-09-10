// add-post.js - الإصدار المحدث مع إضافة النوع والموقع
import { 
  auth, database, storage, serverTimestamp,
  ref, push, onValue, storageRef, uploadBytesResumable, getDownloadURL
} from './firebase.js';

// عناصر DOM
const addPostForm = document.getElementById('add-post-form');
const publishBtn = document.getElementById('publish-btn');
const postImageInput = document.getElementById('post-image');
const chooseImageBtn = document.getElementById('choose-image-btn');
const cameraBtn = document.getElementById('camera-btn');
const imageName = document.getElementById('image-name');
const imagePreview = document.getElementById('image-preview');
const previewImg = document.getElementById('preview-img');
const removeImageBtn = document.getElementById('remove-image-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const uploadProgress = document.getElementById('upload-progress');
const adminIcon = document.getElementById('admin-icon');

// متغيرات النظام
let selectedFile = null;

// تحميل بيانات المستخدم عند بدء التحميل
document.addEventListener('DOMContentLoaded', () => {
    console.log('صفحة إضافة منشور تم تحميلها');
    setupEventListeners();
});

// إعداد مستمعي الأحداث
function setupEventListeners() {
    console.log('جاري إعداد مستمعي الأحداث');
    
    // اختيار صورة من المعرض
    chooseImageBtn.addEventListener('click', () => {
        console.log('نقر على اختيار صورة');
        postImageInput.removeAttribute('capture');
        postImageInput.click();
    });

    // فتح الكاميرا
    cameraBtn.addEventListener('click', () => {
        console.log('نقر على فتح الكاميرا');
        postImageInput.setAttribute('capture', 'environment');
        postImageInput.click();
    });

    // عرض معاينة الصورة
    postImageInput.addEventListener('change', handleImageSelect);

    // إزالة الصورة المختارة
    removeImageBtn.addEventListener('click', removeSelectedImage);

    // نشر منشور جديد
    addPostForm.addEventListener('submit', handlePublishPost);
    
    console.log('تم إعداد مستمعي الأحداث بنجاح');
}

// معالجة اختيار الصورة
function handleImageSelect() {
    console.log('تم اختيار صورة');
    
    if (this.files && this.files[0]) {
        selectedFile = this.files[0];
        imageName.textContent = selectedFile.name;
        console.log('اسم الملف:', selectedFile.name, 'نوع الملف:', selectedFile.type, 'حجم الملف:', selectedFile.size);
        
        const reader = new FileReader();
        reader.onload = function(e) {
            previewImg.src = e.target.result;
            imagePreview.classList.remove('hidden');
            console.log('تم تحميل معاينة الصورة');
        }
        reader.readAsDataURL(selectedFile);
    }
}

// إزالة الصورة المختارة
function removeSelectedImage() {
    console.log('إزالة الصورة المختارة');
    postImageInput.value = '';
    selectedFile = null;
    imageName.textContent = 'لم يتم اختيار صورة';
    imagePreview.classList.add('hidden');
}

// معالجة نشر المنشور
async function handlePublishPost(e) {
    e.preventDefault();
    console.log('بدء عملية نشر المنشور');
    
    const user = auth.currentUser;
    if (!user) {
        alert('يجب تسجيل الدخول أولاً');
        window.location.href = 'auth.html';
        return;
    }
    
    const title = document.getElementById('post-title').value;
    const description = document.getElementById('post-description').value;
    const category = document.getElementById('post-category').value;
    const price = document.getElementById('post-price').value;
    const location = document.getElementById('post-location').value;
    const phone = document.getElementById('post-phone').value;
    
    console.log('بيانات النموذج:', { title, description, category, price, location, phone });
    
    if (!title || !description || !category || !location || !phone) {
        alert('يرجى ملء جميع الحقول المطلوبة');
        return;
    }
    
    showLoading();
    
    try {
        let imageUrl = null;
        
        // رفع الصورة إذا تم اختيارها
        if (selectedFile) {
            try {
                console.log('بدء رفع الصورة...');
                // التحقق من حجم الصورة (حد أقصى 5MB)
                if (selectedFile.size > 5 * 1024 * 1024) {
                    throw new Error('حجم الصورة كبير جداً. الحد الأقصى هو 5MB');
                }
                
                imageUrl = await uploadImage(selectedFile, user.uid);
                console.log('تم رفع الصورة بنجاح، الرابط:', imageUrl);
            } catch (uploadError) {
                console.error('خطأ في رفع الصورة:', uploadError);
                const shouldContinue = confirm('حدث خطأ في رفع الصورة. هل تريد متابعة النشر بدون صورة؟');
                if (!shouldContinue) {
                    hideLoading();
                    return;
                }
            }
        }
        
        // الحصول على بيانات المستخدم
        console.log('جاري الحصول على بيانات المستخدم...');
        const userRef = ref(database, 'users/' + user.uid);
        const userSnapshot = await new Promise((resolve) => {
            onValue(userRef, (snapshot) => resolve(snapshot), { onlyOnce: true });
        });
        
        if (!userSnapshot.exists()) {
            throw new Error('بيانات المستخدم غير موجودة');
        }
        
        const userData = userSnapshot.val();
        console.log('بيانات المستخدم:', userData);
        
        // إنشاء كائن المنشور
        const postData = {
            title: title,
            description: description,
            category: category,
            price: price || '',
            location: location,
            phone: phone,
            authorId: user.uid,
            authorName: userData.name || 'مستخدم',
            authorPhone: userData.phone || '',
            timestamp: serverTimestamp(),
            imageUrl: imageUrl || '',
            createdAt: Date.now()
        };
        
        console.log('بيانات المنشور التي سيتم حفظها:', postData);
        
        // حفظ المنشور في قاعدة البيانات
        console.log('جاري حفظ المنشور في قاعدة البيانات...');
        await push(ref(database, 'posts'), postData);
        
        console.log('تم نشر المنشور بنجاح في قاعدة البيانات');
        alert('تم نشر المنشور بنجاح!');
        resetAddPostForm();
        window.location.href = 'index.html';
        
    } catch (error) {
        console.error('خطأ تفصيلي أثناء نشر المنشور:', error);
        console.error('رسالة الخطأ:', error.message);
        console.error('اسم الخطأ:', error.name);
        
        // رسائل خطأ أكثر تحديداً
        let errorMessage = 'حدث خطأ أثناء نشر المنشور. ';
        
        if (error.code === 'storage/unauthorized') {
            errorMessage += 'ليس لديك صلاحية رفع الصور.';
        } else if (error.code === 'storage/retry-limit-exceeded') {
            errorMessage += 'فشلت عملية رفع الصورة بعد عدة محاولات. يرجى المحاولة مرة أخرى.';
        } else if (error.code === 'storage/canceled') {
            errorMessage += 'تم إلغاء عملية رفع الصورة.';
        } else if (error.code) {
            errorMessage += `خطأ: ${error.code} - ${error.message}`;
        } else {
            errorMessage += 'يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.';
        }
        
        alert(errorMessage);
    } finally {
        hideLoading();
    }
}

// رفع الصورة إلى التخزين
async function uploadImage(file, userId) {
    return new Promise((resolve, reject) => {
        console.log('بدء عملية رفع الصورة إلى التخزين...');
        
        // إضافة طابع زمني لاسم الملف لمنع التكرار
        const timestamp = Date.now();
        const fileExtension = file.name.split('.').pop();
        const fileName = `post_${timestamp}.${fileExtension}`;
        
        const storagePath = `posts/${userId}/${fileName}`;
        const imageRef = storageRef(storage, storagePath);
        
        console.log('مسار التخزين:', storagePath);
        
        // تحديد نوع MIME للصورة
        const metadata = {
            contentType: file.type
        };
        
        const uploadTask = uploadBytesResumable(imageRef, file, metadata);
        
        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                uploadProgress.style.width = progress + '%';
                console.log(`تم رفع ${progress}% من الصورة`);
            },
            (error) => {
                console.error('خطأ أثناء الرفع:', error);
                console.error('كود الخطأ:', error.code);
                console.error('رسالة الخطأ:', error.message);
                reject(error);
            },
            async () => {
                try {
                    console.log('تم الانتهاء من الرفع، جاري الحصول على رابط التحميل...');
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    console.log('تم الحصول على رابط التحميل:', downloadURL);
                    resolve(downloadURL);
                } catch (error) {
                    console.error('خطأ في الحصول على رابط التحميل:', error);
                    reject(error);
                }
            }
        );
    });
}

// إعادة تعيين النموذج
function resetAddPostForm() {
    console.log('إعادة تعيين النموذج');
    document.getElementById('post-title').value = '';
    document.getElementById('post-description').value = '';
    document.getElementById('post-category').value = '';
    document.getElementById('post-price').value = '';
    document.getElementById('post-location').value = '';
    document.getElementById('post-phone').value = '';
    postImageInput.value = '';
    selectedFile = null;
    imageName.textContent = 'لم يتم اختيار صورة';
    imagePreview.classList.add('hidden');
}

// وظائف مساعدة
function showLoading() {
    console.log('عرض شاشة التحميل');
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    console.log('إخفاء شاشة التحميل');
    if (loadingOverlay) {
        loadingOverlay.classList.add('hidden');
        uploadProgress.style.width = '0%';
    }
          }
