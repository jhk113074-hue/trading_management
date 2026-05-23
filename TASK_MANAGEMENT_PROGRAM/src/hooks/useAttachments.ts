import { useState, useEffect } from 'react';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { collection, addDoc, onSnapshot, query, where, deleteDoc, doc } from 'firebase/firestore';
import { storage, db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type { TaskAttachment } from '../types';

export const useAttachments = (taskId?: string) => {
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const { userProfile } = useAuth();

  useEffect(() => {
    if (!taskId) return;
    const q = query(collection(db, 'taskAttachments'), where('taskId', '==', taskId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAttachments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TaskAttachment)));
    });
    return unsubscribe;
  }, [taskId]);

  const uploadFile = async (file: File) => {
    if (!taskId || !userProfile) return;
    
    // File validation
    const maxSizeBytes = 10 * 1024 * 1024; // 10MB limit
    if (file.size > maxSizeBytes) {
      alert("파일 크기는 10MB를 초과할 수 없습니다.");
      return;
    }

    const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
    const allowedExts = ['pdf', 'xlsx', 'docx', 'png', 'jpg', 'zip'];
    if (!allowedExts.includes(fileExt)) {
      alert(`허용되지 않는 파일 형식입니다. (${allowedExts.join(', ')}만 허용)`);
      return;
    }

    const filePath = `tasks/${taskId}/${new Date().getTime()}_${file.name}`;
    const storageRef = ref(storage, filePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed', 
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(prev => ({ ...prev, [file.name]: progress }));
      }, 
      (error) => {
        console.error("Upload failed", error);
        alert("업로드 실패. 다시 시도해 주세요.");
        setUploadProgress(prev => { const p = {...prev}; delete p[file.name]; return p; });
      }, 
      async () => {
        try {
          await addDoc(collection(db, 'taskAttachments'), {
            taskId,
            fileName: file.name,
            filePath,
            fileExt,
            fileSize: file.size,
            uploadedBy: userProfile.id,
            uploadedByName: userProfile.name,
            uploadedAt: new Date().toISOString()
          });
          setUploadProgress(prev => { const p = {...prev}; delete p[file.name]; return p; });
        } catch (e) {
          console.error("Error saving attachment metadata", e);
        }
      }
    );
  };

  const deleteAttachment = async (attachment: TaskAttachment) => {
    if (!userProfile) return;
    if (attachment.uploadedBy !== userProfile.id && userProfile.roleCode !== 'ADMIN') {
      alert("삭제 권한이 없습니다.");
      return;
    }
    
    try {
      const storageRef = ref(storage, attachment.filePath);
      await deleteObject(storageRef);
      await deleteDoc(doc(db, 'taskAttachments', attachment.id));
    } catch (e) {
      console.error("Error deleting attachment", e);
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  const getFileUrl = async (filePath: string) => {
    const storageRef = ref(storage, filePath);
    return await getDownloadURL(storageRef);
  };

  return { attachments, uploadProgress, uploadFile, deleteAttachment, getFileUrl };
};
